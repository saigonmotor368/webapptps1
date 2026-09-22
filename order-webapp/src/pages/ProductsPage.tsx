import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import {
  api,
  type Product,
  type ProductCatalogResponse,
  type Order,
  type FrequentItem,
  ApiError,
} from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

import OrderTabsBar, { type OrderTab } from '../components/products/OrderTabsBar';
import ProductSearchBar from '../components/products/ProductSearchBar';
import QuickOrderSections from '../components/products/QuickOrderSections';
import ProductGrid from '../components/products/ProductGrid';
import CartSummarySidebar from '../components/products/CartSummarySidebar';
import CartFloatingBar from '../components/products/CartFloatingBar';
import CartCheckoutDrawer from '../components/products/CartCheckoutDrawer';
import OrderSuccessModal from '../components/products/OrderSuccessModal';

const STORAGE_KEY = 'tps1_b2b_pos_tabs_v1';
const PRODUCT_CACHE_TTL_MS = 2 * 60 * 1000;
const productSearchCache = new Map<string, { expiresAt: number; products: Product[] }>();
const PRODUCT_CATALOG_TTL_MS = 5 * 60 * 1000;
const productCatalogMemoryCache = new Map<string, { expiresAt: number; products: Product[] }>();
const productSearchKeys = new Map<string, string>();

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeCatalog(catalog: ProductCatalogResponse): Product[] {
  const imageBaseUrl = catalog.imageBaseUrl.replace(/\/$/, '');
  return catalog.items.map(([id, sku, name, category, unit, price, priceOnRequest, hasImage]) => {
    const imageUrl = hasImage && imageBaseUrl ? `${imageBaseUrl}/${id}.webp` : null;
    const product: Product = {
      id,
      sku,
      name,
      category,
      unit,
      price: Number(price) || 0,
      priceOnRequest,
      imageUrl,
      thumbUrl: imageUrl,
      available: true,
    };
    productSearchKeys.set(id, normalizeSearch(`${sku} ${name} ${category || ''}`));
    return product;
  });
}

function searchLocalCatalog(products: Product[], rawQuery: string): Product[] {
  const query = normalizeSearch(rawQuery);
  if (!query) return products.slice(0, 48);
  const words = query.split(' ').filter(Boolean);
  const ranked: Array<{ product: Product; score: number }> = [];

  for (const product of products) {
    const key = productSearchKeys.get(product.id) || normalizeSearch(`${product.sku} ${product.name}`);
    if (!words.every((word) => key.includes(word))) continue;
    const sku = normalizeSearch(product.sku || '');
    const name = normalizeSearch(product.name);
    const score =
      sku === query ? 0 : sku.startsWith(query) ? 1 : name === query ? 2 : name.startsWith(query) ? 3 : 4;
    ranked.push({ product, score });
  }

  return ranked
    .sort(
      (a, b) =>
        a.score - b.score ||
        Number(Boolean(b.product.thumbUrl || b.product.imageUrl)) -
          Number(Boolean(a.product.thumbUrl || a.product.imageUrl)) ||
        a.product.name.localeCompare(b.product.name, 'vi')
    )
    .slice(0, 60)
    .map(({ product }) => product);
}

function getTomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultDelivery(session: any) {
  const shipping = session?.defaultShippingAddress;
  const address = String(shipping?.address || '').trim();
  if (!address) {
    return { deliveryName: '', deliveryPhone: '', deliveryAddress: '' };
  }
  return {
    deliveryName: String(shipping?.name || '').trim(),
    deliveryPhone: String(shipping?.phone || '').trim(),
    deliveryAddress: address,
  };
}

function createDefaultTab(index: number, session: any): OrderTab {
  const defaultDelivery = getDefaultDelivery(session);
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    idempotencyKey: crypto.randomUUID(),
    title: `Đặt hàng ${index}`,
    items: [],
    note: '',
    deliveryDate: getTomorrowDateStr(),
    deliveryShift: 'Ca sáng sớm (05:00 - 07:00)',
    ...defaultDelivery,
    mode: 'delivery',
  };
}

export default function ProductsPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  // 1. Quản lý hệ thống Đa tab đặt hàng
  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const defaultDelivery = getDefaultDelivery(session);
          return parsed.map((tab) => ({
            ...tab,
            idempotencyKey: tab?.idempotencyKey || crypto.randomUUID(),
            ...(String(tab?.deliveryAddress || '').trim() ? {} : defaultDelivery),
          }));
        }
      }
    } catch {}
    return [createDefaultTab(1, session)];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || '');

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId) && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // 2. Search & Catalog state
  const [searchQuery, setSearchQuery] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [frequentItems, setFrequentItems] = useState<FrequentItem[]>([]);
  const [loadingLatestOrder, setLoadingLatestOrder] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tps1_favorite_products_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Mobile Checkout Drawer & Success Modal state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successOrder, setSuccessOrder] = useState<{ code: string; total: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestRef = useRef(0);
  const catalogAbortRef = useRef<AbortController | null>(null);

  // Lưu danh sách yêu thích
  useEffect(() => {
    try {
      localStorage.setItem('tps1_favorite_products_v1', JSON.stringify(favoriteIds));
    } catch {}
  }, [favoriteIds]);

  // Tải danh sách sản phẩm (Search API)
  const loadProducts = useCallback(
    async (rawQuery: string, openDropdown = true) => {
      const query = rawQuery.trim();
      const cacheKey = `${session?.id || 'anonymous'}:${query.toLocaleLowerCase('vi-VN')}`;
      const cached = productSearchCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        setSearchResults(cached.products);
        setIsDropdownOpen(openDropdown);
        setSelectedResultIndex(0);
        return;
      }

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      const requestId = ++searchRequestRef.current;
      setSearchLoading(true);
      try {
        const res = await api.products(query ? { search: query } : {}, controller.signal);
        if (requestId !== searchRequestRef.current) return;
        const products = res.products || [];
        productSearchCache.set(cacheKey, {
          expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS,
          products,
        });
        setSearchResults(products);
        setIsDropdownOpen(openDropdown);
        setSelectedResultIndex(0);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          navigate('/dang-nhap');
        }
      } finally {
        if (requestId === searchRequestRef.current) setSearchLoading(false);
      }
    },
    [logout, navigate, session?.id]
  );

  // Tải trước nhóm sản phẩm ban đầu
  useEffect(() => {
    void loadProducts('', false);
    return () => searchAbortRef.current?.abort();
  }, [loadProducts]);

  // Tải 20 mặt hàng thường đặt
  useEffect(() => {
    const controller = new AbortController();
    void api
      .frequentItems(controller.signal)
      .then((res) => setFrequentItems(res.items || []))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // Tải toàn bộ Catalog vào bộ nhớ để tìm kiếm tức thì
  useEffect(() => {
    const customerId = session?.id;
    if (!customerId) return;
    const now = Date.now();
    const memory = productCatalogMemoryCache.get(customerId);
    if (memory && memory.expiresAt > now) {
      setCatalogProducts(memory.products);
      setSearchResults(memory.products.slice(0, 48));
      setCatalogLoading(false);
      return;
    }

    const storageKey = `tps1_product_catalog_v1_${customerId}`;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { expiresAt: number; catalog: ProductCatalogResponse };
        if (parsed.expiresAt > now && Array.isArray(parsed.catalog?.items)) {
          const products = decodeCatalog(parsed.catalog);
          productCatalogMemoryCache.set(customerId, { expiresAt: parsed.expiresAt, products });
          setCatalogProducts(products);
          setSearchResults(products.slice(0, 48));
          setCatalogLoading(false);
          return;
        }
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }

    const controller = new AbortController();
    catalogAbortRef.current = controller;
    void api
      .productCatalog(controller.signal)
      .then((catalog) => {
        if (controller.signal.aborted) return;
        const products = decodeCatalog(catalog);
        const expiresAt = Date.now() + PRODUCT_CATALOG_TTL_MS;
        productCatalogMemoryCache.set(customerId, { expiresAt, products });
        setCatalogProducts(products);
        setSearchResults((current) => (searchQuery.trim() ? current : products.slice(0, 48)));
        setCatalogLoading(false);
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ expiresAt, catalog }));
        } catch {}
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('Không tải được catalog nền:', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });

    return () => controller.abort();
  }, [session?.id]);

  // Phím tắt F3 để focus ô tìm kiếm
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setIsDropdownOpen(false);
      return;
    }

    if (catalogProducts.length > 0) {
      searchAbortRef.current?.abort();
      setSearchLoading(false);
      setSearchResults(searchLocalCatalog(catalogProducts, q));
      setIsDropdownOpen(true);
      setSelectedResultIndex(0);
      return;
    }

    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => void loadProducts(q), 120);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery, loadProducts, catalogProducts]);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !searchInputRef.current?.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update tab helper
  const updateActiveTab = useCallback(
    (updater: (prev: OrderTab) => OrderTab) => {
      setTabs((prevTabs) =>
        prevTabs.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab))
      );
    },
    [activeTab.id]
  );

  // Thao tác Thêm / Sửa số lượng / Ghi chú dòng
  const handleAddProduct = (product: Product, quantityToAdd: number = addQty) => {
    const qty = Math.max(0.1, Number(quantityToAdd) || 1);
    updateActiveTab((tab) => {
      const existingIdx = tab.items.findIndex((item) => item.product.id === product.id);
      if (existingIdx >= 0) {
        const updated = [...tab.items];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: Number((updated[existingIdx].quantity + qty).toFixed(2)),
        };
        return { ...tab, items: updated };
      } else {
        return {
          ...tab,
          items: [...tab.items, { product, quantity: qty }],
        };
      }
    });

    setSearchQuery('');
    setIsDropdownOpen(false);
    setAddQty(1);
    searchInputRef.current?.focus();
  };

  const handleUpdateQty = (productId: string, newQty: number) => {
    const qty = Number(newQty);
    if (qty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    updateActiveTab((tab) => ({
      ...tab,
      items: tab.items.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      ),
    }));
  };

  const handleUpdateItemNote = (productId: string, note: string) => {
    updateActiveTab((tab) => ({
      ...tab,
      items: tab.items.map((item) =>
        item.product.id === productId ? { ...item, note } : item
      ),
    }));
  };

  const handleRemoveItem = (productId: string) => {
    updateActiveTab((tab) => ({
      ...tab,
      items: tab.items.filter((item) => item.product.id !== productId),
    }));
  };

  // Nhận yêu cầu "Đặt lại" từ lịch sử đơn sau khi catalog đã sẵn sàng.
  useEffect(() => {
    if (catalogProducts.length === 0) return;
    const raw = sessionStorage.getItem('tps1_reorder_request_v1');
    if (!raw) return;
    sessionStorage.removeItem('tps1_reorder_request_v1');
    try {
      const requested = JSON.parse(raw) as Array<{ productId: string; quantity: number; note?: string }>;
      const productsById = new Map(catalogProducts.map((product) => [product.id, product]));
      const items = requested
        .map((item) => {
          const product = productsById.get(item.productId);
          return product
            ? { product, quantity: Math.max(0.1, Number(item.quantity) || 1), note: item.note || '' }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (items.length === 0) {
        setErrorMessage('Các mặt hàng trong đơn cũ hiện không còn trong danh mục. Vui lòng tìm và chọn lại.');
        return;
      }
      updateActiveTab((tab) => ({ ...tab, items }));
      if (items.length < requested.length) {
        setErrorMessage('Một số mặt hàng cũ không còn trong danh mục và đã được bỏ qua.');
      }
    } catch {
      setErrorMessage('Không đọc được dữ liệu đơn cũ. Vui lòng thử lại.');
    }
  }, [catalogProducts, updateActiveTab]);

  const handleAddNewTab = () => {
    const nextNum = tabs.length + 1;
    const newT = createDefaultTab(nextNum, session);
    setTabs((prev) => [...prev, newT]);
    setActiveTabId(newT.id);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      updateActiveTab((t) => ({ ...t, items: [] }));
      return;
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedResultIndex]) {
        handleAddProduct(searchResults[selectedResultIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  // Danh sách gợi ý từ catalog và lịch sử
  const frequentProducts = useMemo(
    () =>
      frequentItems.slice(0, 10).map((item) => ({
        id: item.productId,
        sku: item.sku || '',
        name: item.name,
        category: item.category || null,
        unit: item.unit || 'Kg',
        price: Number(item.price) || 0,
        priceOnRequest: Boolean(item.priceOnRequest),
        imageUrl: item.imageUrl || null,
        thumbUrl: item.imageUrl || null,
        available: true,
      } satisfies Product)),
    [frequentItems]
  );

  const favoriteProducts = useMemo(
    () =>
      favoriteIds
        .map((id) => catalogProducts.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p))
        .slice(0, 10),
    [catalogProducts, favoriteIds]
  );

  const latestOrder = recentOrders[0];

  const categories = useMemo(() => {
    const values = [
      ...new Set(
        catalogProducts.map((p) => String(p.category || '').trim()).filter(Boolean)
      ),
    ];
    return values.sort((a, b) => a.localeCompare(b, 'vi')).slice(0, 16);
  }, [catalogProducts]);

  const categoryProducts = useMemo(() => {
    if (!selectedCategory) return [];
    return catalogProducts.filter((p) => p.category === selectedCategory).slice(0, 12);
  }, [catalogProducts, selectedCategory]);

  const displayedProducts = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }
    if (selectedCategory) {
      return catalogProducts.filter((p) => p.category === selectedCategory);
    }
    return (catalogProducts.length > 0 ? catalogProducts : searchResults).slice(0, 48);
  }, [searchQuery, searchResults, selectedCategory, catalogProducts]);

  const toggleFavorite = (productId: string) => {
    setFavoriteIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const addOrderAgain = (order: Order) => {
    const productsById = new Map(catalogProducts.map((p) => [p.id, p]));
    order.items.forEach((item) => {
      const p = productsById.get(item.productId);
      if (p) handleAddProduct(p, Number(item.quantity) || 1);
    });
  };

  const loadLatestOrderAndAdd = async () => {
    if (latestOrder) {
      addOrderAgain(latestOrder);
      return;
    }
    setLoadingLatestOrder(true);
    try {
      const res = await api.orders();
      const order = (res.orders || [])[0];
      if (order) {
        setRecentOrders([order]);
        addOrderAgain(order);
      }
    } catch {
    } finally {
      setLoadingLatestOrder(false);
    }
  };

  // Gửi đơn đặt hàng (Submit Order)
  const handleSubmitOrder = async () => {
    setErrorMessage('');
    if (activeTab.items.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất 1 mặt hàng vào đơn');
      return;
    }
    if (
      !activeTab.deliveryName.trim() ||
      !activeTab.deliveryPhone.trim() ||
      !activeTab.deliveryAddress.trim()
    ) {
      setErrorMessage('Vui lòng điền đầy đủ Tên, SĐT và Địa chỉ giao hàng');
      return;
    }

    setSubmitting(true);
    try {
      const lineNotesFormatted = activeTab.items
        .filter((it) => it.note?.trim())
        .map((it) => `[${it.product.name}: ${it.note!.trim()}]`)
        .join('; ');

      const fullNote = [
        activeTab.deliveryShift ? `[Ca: ${activeTab.deliveryShift}]` : '',
        activeTab.deliveryDate ? `[Ngày giao: ${activeTab.deliveryDate}]` : '',
        lineNotesFormatted,
        activeTab.note.trim(),
      ]
        .filter(Boolean)
        .join(' - ');

      const res = await api.createOrder({
        items: activeTab.items.map((it) => ({
          productId: it.product.id,
          name: it.product.name,
          quantity: it.quantity,
          note: it.note?.trim() || undefined,
        })),
        deliveryName: activeTab.deliveryName.trim(),
        deliveryPhone: activeTab.deliveryPhone.trim(),
        deliveryAddress: activeTab.deliveryAddress.trim(),
        deliveryDate: activeTab.deliveryDate,
        note: fullNote,
        idempotencyKey: activeTab.idempotencyKey,
      });

      const subtotal = activeTab.items.reduce(
        (sum, item) => sum + item.quantity * (item.product.price || 0),
        0
      );

      setSuccessOrder({ code: res.orderCode, total: subtotal });
      setIsDrawerOpen(false);

      // Reset giỏ của tab vừa gửi
      updateActiveTab((t) => ({ ...t, items: [], note: '', idempotencyKey: crypto.randomUUID() }));
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Không gửi được đơn hàng, vui lòng thử lại'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 sm:gap-4 pb-12 lg:pb-0">
      {/* 1. Header trang: Lời chào & Giờ chốt đơn */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-0.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#17231d] tracking-tight">
            Đặt hàng cho bếp
          </h1>
          <p className="text-xs sm:text-sm text-[#59665f] mt-0.5">
            Chọn món quen thuộc hoặc tìm nhanh theo tên, mã SKU
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-900 text-xs font-bold shadow-xs">
          <Clock size={15} className="text-[#e0742f]" />
          <span>Vui lòng chọn ngày và ca giao hàng phù hợp</span>
        </div>
      </div>

      {/* 2. Top Bar: Tìm kiếm F3 & Hệ thống Đa Tab */}
      <div className="bg-white rounded-2xl border border-[#17231d]/10 shadow-xs p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sticky top-[58px] z-20 backdrop-blur-md bg-white/95">
        <ProductSearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          addQty={addQty}
          onAddQtyChange={setAddQty}
          searchResults={searchResults}
          searchLoading={searchLoading}
          isDropdownOpen={isDropdownOpen}
          onOpenDropdown={() => {
            if (searchResults.length > 0) setIsDropdownOpen(true);
            else void loadProducts('');
          }}
          onCloseDropdown={() => setIsDropdownOpen(false)}
          selectedResultIndex={selectedResultIndex}
          onSelectIndex={setSelectedResultIndex}
          onAddProduct={handleAddProduct}
          searchInputRef={searchInputRef}
          dropdownRef={dropdownRef}
          onKeyDown={handleSearchKeyDown}
        />

        <OrderTabsBar
          tabs={tabs}
          activeTabId={activeTab.id}
          onSelectTab={setActiveTabId}
          onAddTab={handleAddNewTab}
          onCloseTab={handleCloseTab}
        />
      </div>

      {/* 3. Khối đặt nhanh cho bếp (Đơn gần nhất, Thường mua, Yêu thích, Nhóm hàng) */}
      <QuickOrderSections
        latestOrder={latestOrder}
        loadingLatestOrder={loadingLatestOrder}
        onReorderLatest={loadLatestOrderAndAdd}
        frequentProducts={frequentProducts}
        favoriteProducts={favoriteProducts}
        favoriteIds={favoriteIds}
        onToggleFavorite={toggleFavorite}
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        categoryProducts={categoryProducts}
        onAddProduct={handleAddProduct}
      />

      {/* 4. Vùng làm việc chính: 2 Cột (Trái: Lưới sản phẩm; Phải: Sidebar Tóm tắt & Gửi đơn) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_370px] gap-4 items-start">
        {/* CỘT TRÁI: Lưới card sản phẩm */}
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-[#17231d] uppercase tracking-wider flex items-center gap-2">
              <span>
                {searchQuery.trim()
                  ? `Kết quả tìm kiếm ("${searchQuery}")`
                  : selectedCategory
                  ? `Nhóm: ${selectedCategory}`
                  : 'Danh mục hàng hóa'}
              </span>
              <span className="text-xs font-mono font-normal text-[#59665f]">
                ({displayedProducts.length} mặt hàng)
              </span>
            </h2>

            {selectedCategory && (
              <button
                type="button"
                onClick={() => setSelectedCategory('')}
                className="text-xs text-[#0f7a4f] hover:underline font-semibold cursor-pointer"
              >
                Xem tất cả nhóm
              </button>
            )}
          </div>

          <ProductGrid
            products={displayedProducts}
            itemsInCart={activeTab.items}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
            onAddProduct={handleAddProduct}
            onUpdateQty={handleUpdateQty}
            onUpdateNote={handleUpdateItemNote}
            searchQuery={searchQuery}
            loading={catalogLoading || searchLoading}
          />
        </div>

        {/* CỘT PHẢI (Desktop): Sidebar Tóm tắt đơn & Gửi đơn */}
        <div className="hidden lg:block min-w-0">
          <CartSummarySidebar
            session={session}
            activeTab={activeTab}
            onUpdateTab={updateActiveTab}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onSubmitOrder={handleSubmitOrder}
            submitting={submitting}
            errorMessage={errorMessage}
          />
        </div>
      </div>

      {/* 5. Mobile Floating Cart Bar (khi có sản phẩm) */}
      <CartFloatingBar
        activeTab={activeTab}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      {/* 6. Mobile Slide-up Checkout Drawer */}
      <CartCheckoutDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        session={session}
        activeTab={activeTab}
        onUpdateTab={updateActiveTab}
        onUpdateQty={handleUpdateQty}
        onUpdateNote={handleUpdateItemNote}
        onRemoveItem={handleRemoveItem}
        onSubmitOrder={handleSubmitOrder}
        submitting={submitting}
        errorMessage={errorMessage}
      />

      {/* 7. Modal thông báo đặt hàng thành công */}
      <OrderSuccessModal
        order={successOrder}
        onClose={() => setSuccessOrder(null)}
      />
    </div>
  );
}
