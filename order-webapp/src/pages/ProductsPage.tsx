import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Truck,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  PlusCircle,
  ArrowRight,
  Printer,
  ChevronDown,
  PackageOpen,
  Heart,
  Repeat2,
  ChefHat,
} from 'lucide-react';
import { api, type Product, type ProductCatalogResponse, type Order, type FrequentItem, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface OrderItem {
  product: Product;
  quantity: number;
}

interface OrderTab {
  id: string;
  title: string;
  items: OrderItem[];
  note: string;
  deliveryDate: string;
  deliveryShift: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  mode: 'delivery' | 'pickup';
}

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

function decodeCatalog(catalog: ProductCatalogResponse) {
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

function searchLocalCatalog(products: Product[], rawQuery: string) {
  const query = normalizeSearch(rawQuery);
  if (!query) return products.slice(0, 24);
  const words = query.split(' ').filter(Boolean);
  const ranked: Array<{ product: Product; score: number }> = [];

  for (const product of products) {
    const key = productSearchKeys.get(product.id) || normalizeSearch(`${product.sku} ${product.name}`);
    if (!words.every((word) => key.includes(word))) continue;
    const sku = normalizeSearch(product.sku || '');
    const name = normalizeSearch(product.name);
    const score = sku === query ? 0 : sku.startsWith(query) ? 1 : name === query ? 2 : name.startsWith(query) ? 3 : 4;
    ranked.push({ product, score });
  }

  return ranked
    .sort((a, b) => a.score - b.score || Number(Boolean(productImage(b.product))) - Number(Boolean(productImage(a.product))) || a.product.name.localeCompare(b.product.name, 'vi'))
    .slice(0, 60)
    .map(({ product }) => product);
}

function productImage(product: Product) {
  return product.thumbUrl || product.imageUrl || '';
}

function ProductThumbnail({ product, compact = false }: { product: Product; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = productImage(product);
  return (
    <div className={`${compact ? 'w-11 h-11 rounded-lg' : 'w-12 h-12 rounded-xl'} border border-[#14231c]/10 bg-[#f6f7f4] overflow-hidden shrink-0 flex items-center justify-center text-[#59665f]/40`}>
      {src && !failed ? (
        <img
          src={src}
          alt={product.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <PackageOpen size={compact ? 18 : 20} />
      )}
    </div>
  );
}

function getTomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
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

  // Nhiều tab giúp nhân viên lên đồng thời nhiều đơn đặt hàng.
  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const defaultDelivery = getDefaultDelivery(session);
          return parsed.map((tab) =>
            String(tab?.deliveryAddress || '').trim()
              ? tab
              : { ...tab, ...defaultDelivery }
          );
        }
      }
    } catch {}
    return [createDefaultTab(1, session)];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || '');

  // Đảm bảo activeTabId luôn hợp lệ
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId) && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Search Autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
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

  // Submit & Modal state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successOrder, setSuccessOrder] = useState<{ code: string; total: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestRef = useRef(0);
  const catalogAbortRef = useRef<AbortController | null>(null);

  const loadProducts = useCallback(async (rawQuery: string, openDropdown = true) => {
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
  }, [logout, navigate, session?.id]);

  // Tải sẵn một nhóm sản phẩm đầu tiên để khách có thể chọn ngay khi mở trang.
  useEffect(() => {
    void loadProducts('', false);
    return () => searchAbortRef.current?.abort();
  }, [loadProducts]);

  // Endpoint này trả đúng 20 mặt hàng hay đặt, nhẹ hơn nhiều so với tải toàn bộ
  // lịch sử đơn kèm từng dòng hàng ngay khi mở màn hình.
  useEffect(() => {
    const controller = new AbortController();
    void api.frequentItems(controller.signal).then((res) => setFrequentItems(res.items || [])).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('tps1_favorite_products_v1', JSON.stringify(favoriteIds));
    } catch {
      // Không ảnh hưởng luồng đặt hàng nếu trình duyệt không cho lưu localStorage.
    }
  }, [favoriteIds]);

  // KiotViet cho cảm giác nhanh vì tìm trên catalog đã nằm trong trình duyệt.
  // TPS1 áp dụng cùng nguyên lý nhưng catalog vẫn mang đúng giá riêng của từng khách.
  useEffect(() => {
    const customerId = session?.id;
    if (!customerId) return;
    const now = Date.now();
    const memory = productCatalogMemoryCache.get(customerId);
    if (memory && memory.expiresAt > now) {
      setCatalogProducts(memory.products);
      setSearchResults(memory.products.slice(0, 24));
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
          setSearchResults(products.slice(0, 24));
          return;
        }
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }

    const controller = new AbortController();
    catalogAbortRef.current = controller;
    void api.productCatalog(controller.signal).then((catalog) => {
      if (controller.signal.aborted) return;
      const products = decodeCatalog(catalog);
      const expiresAt = Date.now() + PRODUCT_CATALOG_TTL_MS;
      productCatalogMemoryCache.set(customerId, { expiresAt, products });
      setCatalogProducts(products);
      setSearchResults((current) => searchQuery.trim() ? current : products.slice(0, 24));
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ expiresAt, catalog }));
      } catch {
        // Nếu trình duyệt giới hạn bộ nhớ, vẫn giữ catalog trong RAM cho phiên hiện tại.
      }
    }).catch((error) => {
      if (!controller.signal.aborted) console.warn('Không tải được catalog nền:', error);
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

  // Tìm kiếm có debounce, hủy request cũ và dùng cache ngắn hạn để tránh chờ lặp lại.
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

  // Đóng dropdown khi click ra ngoài
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

  // Hàm cập nhật tab hiện tại
  const updateActiveTab = useCallback(
    (updater: (prev: OrderTab) => OrderTab) => {
      setTabs((prevTabs) =>
        prevTabs.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab))
      );
    },
    [activeTab.id]
  );

  // Thêm sản phẩm vào giỏ tab hiện tại
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

  // Cập nhật số lượng của 1 dòng
  const handleUpdateQty = (productId: string, newQty: number) => {
    const qty = Math.max(0.1, Number(newQty) || 1);
    updateActiveTab((tab) => ({
      ...tab,
      items: tab.items.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      ),
    }));
  };

  // Xoá 1 dòng hàng
  const handleRemoveItem = (productId: string) => {
    updateActiveTab((tab) => ({
      ...tab,
      items: tab.items.filter((item) => item.product.id !== productId),
    }));
  };

  // Thêm tab đặt hàng mới
  const handleAddNewTab = () => {
    const nextNum = tabs.length + 1;
    const newT = createDefaultTab(nextNum, session);
    setTabs((prev) => [...prev, newT]);
    setActiveTabId(newT.id);
  };

  // Đóng tab
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      // Nếu chỉ còn 1 tab thì reset giỏ của tab đó thay vì xoá
      updateActiveTab((t) => ({ ...t, items: [] }));
      return;
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
  };

  // Xử lý phím điều hướng trong dropdown
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

  // Tính toán tổng tiền
  const totalItemsCount = activeTab.items.length;
  const totalQuantity = activeTab.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalAmount = activeTab.items.reduce(
    (sum, item) => sum + item.quantity * (item.product.price || 0),
    0
  );
  const discountAmount = 0; // Áp dụng chiết khấu theo tier nếu có
  const finalTotalAmount = Math.max(0, subtotalAmount - discountAmount);

  const frequentProducts = useMemo(() => frequentItems.slice(0, 8).map((item) => ({
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
  } satisfies Product)), [frequentItems]);

  const favoriteProducts = useMemo(
    () => favoriteIds
      .map((id) => catalogProducts.find((product) => product.id === id))
      .filter((product): product is Product => Boolean(product))
      .slice(0, 8),
    [catalogProducts, favoriteIds]
  );

  const latestOrder = recentOrders[0];

  const categories = useMemo(() => {
    const values = [...new Set(catalogProducts.map((product) => String(product.category || '').trim()).filter(Boolean))];
    return values.sort((a, b) => a.localeCompare(b, 'vi')).slice(0, 16);
  }, [catalogProducts]);

  const categoryProducts = useMemo(() => {
    if (!selectedCategory) return [];
    return catalogProducts.filter((product) => product.category === selectedCategory).slice(0, 12);
  }, [catalogProducts, selectedCategory]);

  const toggleFavorite = (productId: string) => {
    setFavoriteIds((current) => current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId]);
  };

  const addOrderAgain = (order: Order) => {
    const productsById = new Map(catalogProducts.map((product) => [product.id, product]));
    order.items.forEach((item) => {
      const product = productsById.get(item.productId);
      if (product) handleAddProduct(product, Number(item.quantity) || 1);
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
      // Người dùng vẫn có thể đặt bằng danh mục/tìm kiếm nếu lịch sử không tải được.
    } finally {
      setLoadingLatestOrder(false);
    }
  };

  // Gửi đơn hàng (Submit Order)
  const handleSubmitOrder = async () => {
    setErrorMessage('');
    if (activeTab.items.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất 1 sản phẩm vào đơn hàng');
      return;
    }
    if (!activeTab.deliveryName.trim() || !activeTab.deliveryPhone.trim() || !activeTab.deliveryAddress.trim()) {
      setErrorMessage('Vui lòng điền đầy đủ Tên người nhận, SĐT và Địa chỉ giao hàng');
      return;
    }

    setSubmitting(true);
    try {
      const fullNote = [
        activeTab.deliveryShift ? `[Giao: ${activeTab.deliveryShift}]` : '',
        activeTab.deliveryDate ? `[Ngày giao: ${activeTab.deliveryDate}]` : '',
        activeTab.note.trim(),
      ]
        .filter(Boolean)
        .join(' - ');

      const res = await api.createOrder({
        items: activeTab.items.map((it) => ({
          productId: it.product.id,
          name: it.product.name,
          quantity: it.quantity,
        })),
        deliveryName: activeTab.deliveryName.trim(),
        deliveryPhone: activeTab.deliveryPhone.trim(),
        deliveryAddress: activeTab.deliveryAddress.trim(),
        note: fullNote,
        idempotencyKey: crypto.randomUUID(),
      });

      setSuccessOrder({ code: res.orderCode, total: finalTotalAmount });

      // Reset items trong tab hiện tại
      updateActiveTab((t) => ({ ...t, items: [], note: '' }));
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Lỗi khi gửi đơn hàng, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#14231c]">Đặt hàng cho bếp</h1>
          <p className="text-xs sm:text-sm text-[#59665f] mt-0.5">Chọn món quen thuộc hoặc tìm nhanh theo tên, mã hàng</p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
          <Clock size={15} /> Chốt đơn hôm nay: 16:30
        </div>
      </div>
      {/* ========================================================================= */}
      {/* THANH TOP BAR: TÌM KIẾM HÀNG HÓA & HỆ THỐNG ĐA TAB */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-[#14231c]/10 shadow-sm p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Khối tìm kiếm F3 */}
        <div className="relative flex-1 max-w-2xl flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={18} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => {
                if (searchResults.length > 0) setIsDropdownOpen(true);
                else void loadProducts('');
              }}
              placeholder="Tìm hàng hóa theo tên hoặc mã SKU (F3)..."
              className="w-full pl-10 pr-8 py-2.5 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-sm font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0070f3]/25 focus:border-[#0070f3] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/40 hover:text-[#59665f] p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Ô nhập số lượng nhanh trước khi chọn */}
          <div className="flex items-center gap-1 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl px-2 py-1.5 shrink-0">
            <span className="text-xs text-[#59665f] font-medium hidden sm:inline">SL:</span>
            <input
              type="number"
              min={0.1}
              step={1}
              value={addQty}
              onChange={(e) => setAddQty(Math.max(0.1, parseFloat(e.target.value) || 1))}
              className="w-12 bg-transparent text-center text-sm font-bold text-[#14231c] focus:outline-none"
            />
          </div>

          {/* Danh sách gợi ý sản phẩm */}
          {isDropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-2xl border border-[#14231c]/15 z-50 overflow-hidden max-h-[380px] overflow-y-auto"
            >
              {searchLoading ? (
                <div className="py-6 text-center text-sm text-[#59665f] flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#0070f3] border-t-transparent rounded-full animate-spin" />
                  <span>Đang tìm kiếm hàng hóa...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-6 text-center text-sm text-[#59665f]">
                  Không tìm thấy mặt hàng nào khớp với <span className="font-semibold">"{searchQuery}"</span>
                </div>
              ) : (
                <div className="divide-y divide-[#14231c]/5">
                  <div className="bg-[#f8faf7] px-3.5 py-2 text-[11px] font-bold text-[#59665f] uppercase tracking-wider flex justify-between">
                    <span>Hình ảnh / Mã / Tên sản phẩm</span>
                    <span>ĐVT • Đơn giá</span>
                  </div>
                  {searchResults.map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      onMouseEnter={() => setSelectedResultIndex(idx)}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        idx === selectedResultIndex
                          ? 'bg-[#0070f3]/10 text-[#0070f3]'
                          : 'hover:bg-[#f6f7f4] text-[#14231c]'
                      }`}
                    >
                      <ProductThumbnail product={p} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold bg-[#14231c]/5 px-1.5 py-0.5 rounded text-[#59665f]">
                            {p.sku || 'N/A'}
                          </span>
                          <span className="text-sm font-semibold truncate">{p.name}</span>
                        </div>
                        {p.category && (
                          <span className="text-[11px] text-[#59665f] mt-0.5 block">
                            Nhóm: {p.category}
                          </span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-[#0f6f4b]">
                          {p.priceOnRequest ? (
                            <span className="text-amber-600 text-xs">Liên hệ báo giá</span>
                          ) : (
                            money(p.price)
                          )}
                        </div>
                        <div className="text-xs text-[#59665f] mt-0.5 font-medium">
                          {p.unit || 'Kg'} • <span className="text-emerald-700">Nhận đặt hàng</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hệ thống Tab Đặt hàng 1, Đặt hàng 2, + */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shrink-0 border ${
                  isActive
                    ? 'bg-[#0070f3] text-white border-[#0070f3] shadow-sm shadow-[#0070f3]/30'
                    : 'bg-[#f8faf7] text-[#59665f] border-[#14231c]/10 hover:bg-[#eaece8]'
                }`}
              >
                <span>{tab.title}</span>
                {tab.items.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-white text-[#0070f3]' : 'bg-[#14231c]/10 text-[#14231c]'
                    }`}
                  >
                    {tab.items.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className={`p-0.5 rounded-full hover:bg-black/10 transition-colors ${
                    isActive ? 'text-white/80 hover:text-white' : 'text-[#59665f]'
                  }`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddNewTab}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-[#0070f3] bg-[#0070f3]/10 hover:bg-[#0070f3]/20 transition-colors shrink-0"
            title="Mở thêm tab đặt hàng mới"
          >
            <Plus size={14} />
            <span>Thêm đơn</span>
          </button>
        </div>
      </div>

      {/* Khu vực thao tác nhanh cho bếp: ưu tiên món quen thuộc và đơn gần nhất. */}
      {(latestOrder || frequentItems.length > 0 || favoriteProducts.length > 0 || categories.length > 0) && (
        <section className="bg-white rounded-2xl border border-[#14231c]/10 shadow-sm p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-[#0f6f4b]/10 text-[#0f6f4b] flex items-center justify-center">
                <ChefHat size={19} />
              </span>
              <div>
                <h2 className="font-bold text-sm sm:text-base text-[#14231c]">Đặt nhanh cho bếp</h2>
                <p className="text-[11px] sm:text-xs text-[#59665f]">Món quen thuộc, thêm vào đơn chỉ bằng một chạm</p>
              </div>
            </div>
            {(latestOrder || frequentItems.length > 0) && (
              <button type="button" onClick={loadLatestOrderAndAdd} disabled={loadingLatestOrder} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f6f4b] text-white text-xs font-bold hover:bg-[#0b5a3c] active:scale-[.98] transition-all disabled:opacity-70">
                <Repeat2 size={15} className={loadingLatestOrder ? 'animate-spin' : ''} /> <span className="hidden sm:inline">{loadingLatestOrder ? 'Đang tải đơn...' : 'Đặt lại đơn gần nhất'}</span><span className="sm:hidden">{loadingLatestOrder ? 'Đang tải' : 'Đặt lại'}</span>
              </button>
            )}
          </div>

          {categories.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#59665f] mb-1.5">Duyệt theo nhóm hàng</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button type="button" onClick={() => setSelectedCategory('')} className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${!selectedCategory ? 'bg-[#0f6f4b] text-white border-[#0f6f4b]' : 'bg-[#f8faf7] text-[#59665f] border-[#14231c]/10 hover:border-[#0f6f4b]/30'}`}>Tất cả nhóm</button>
                {categories.map((category) => (
                  <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${selectedCategory === category ? 'bg-[#0f6f4b] text-white border-[#0f6f4b]' : 'bg-[#f8faf7] text-[#59665f] border-[#14231c]/10 hover:border-[#0f6f4b]/30'}`}>{category}</button>
                ))}
              </div>
              {selectedCategory && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                  {categoryProducts.map((product) => (
                    <button key={product.id} type="button" onClick={() => handleAddProduct(product)} className="flex items-center gap-2 min-w-0 p-2 rounded-xl border border-[#14231c]/10 bg-[#fbfcfb] hover:border-[#0f6f4b]/30 hover:bg-[#f4faf6] text-left">
                      <ProductThumbnail product={product} compact />
                      <span className="min-w-0"><span className="block text-xs font-semibold truncate">{product.name}</span><span className="block text-[10px] text-[#59665f] mt-0.5">{product.unit || 'Kg'}</span></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {favoriteProducts.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#59665f] mb-1.5 flex items-center gap-1"><Heart size={12} className="text-rose-500" /> Yêu thích</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {favoriteProducts.map((product) => (
                  <button key={product.id} type="button" onClick={() => handleAddProduct(product)} className="min-w-[180px] max-w-[220px] flex items-center gap-2 p-2 rounded-xl border border-rose-100 bg-rose-50/50 hover:bg-rose-50 text-left">
                    <ProductThumbnail product={product} compact />
                    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold truncate text-[#14231c]">{product.name}</span><span className="block text-[11px] text-[#0f6f4b] font-bold mt-0.5">{product.priceOnRequest ? 'Liên hệ' : money(product.price)}</span></span>
                    <Heart size={14} className="shrink-0 fill-rose-500 text-rose-500" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {frequentProducts.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#59665f] mb-1.5">Hàng thường đặt</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {frequentProducts.map((product) => {
                  const isFavorite = favoriteIds.includes(product.id);
                  return (
                    <div key={product.id} className="min-w-[210px] max-w-[250px] flex items-center gap-2 p-2 rounded-xl border border-[#14231c]/10 bg-[#f8faf7]">
                      <button type="button" onClick={() => handleAddProduct(product)} className="min-w-0 flex-1 flex items-center gap-2 text-left">
                        <ProductThumbnail product={product} compact />
                        <span className="min-w-0"><span className="block text-xs font-semibold truncate text-[#14231c]">{product.name}</span><span className="block text-[11px] text-[#59665f] mt-0.5">{product.unit || 'Kg'} · {product.priceOnRequest ? 'Liên hệ' : money(product.price)}</span></span>
                      </button>
                      <button type="button" onClick={() => toggleFavorite(product.id)} className="p-1.5 rounded-lg hover:bg-white text-[#59665f]" aria-label={isFavorite ? `Bỏ yêu thích ${product.name}` : `Yêu thích ${product.name}`}>
                        <Heart size={15} className={isFavorite ? 'fill-rose-500 text-rose-500' : ''} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* VÙNG LÀM VIỆC CHÍNH: 2 CỘT (BẢNG HÀNG HÓA 68% + GIAO HÀNG & CHỐT ĐƠN 32%) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
        {/* --------------------------------------------------------------------- */}
        {/* CỘT TRÁI: BẢNG DANH SÁCH MẶT HÀNG (8/12) */}
        {/* --------------------------------------------------------------------- */}
        <div className="min-w-0 bg-white rounded-2xl border border-[#14231c]/10 shadow-sm flex flex-col min-h-[560px] overflow-hidden">
          {/* Header Bảng cột */}
          <div className="md:hidden flex-1 divide-y divide-[#14231c]/5">
            {activeTab.items.length === 0 ? (
              <div className="py-16 px-6 text-center text-[#59665f]">
                <div className="w-14 h-14 rounded-full bg-[#f6f7f4] flex items-center justify-center mx-auto mb-3 text-[#59665f]/40">
                  <Search size={24} />
                </div>
                <p className="font-semibold text-sm text-[#14231c]">Chưa có mặt hàng nào</p>
                <p className="text-xs mt-1">Tìm tên hoặc mã hàng ở phía trên để thêm vào đơn.</p>
              </div>
            ) : (
              activeTab.items.map((item, idx) => {
                const lineTotal = item.quantity * (item.product.price || 0);
                return (
                  <div key={item.product.id} className="p-3.5 space-y-3">
                    <div className="flex items-start gap-3">
                      <ProductThumbnail product={item.product} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-[#14231c] leading-tight">{item.product.name}</p>
                            <p className="text-[11px] text-[#59665f] mt-1 font-mono">{item.product.sku || '—'} · {item.product.unit || 'Kg'}</p>
                          </div>
                          <button type="button" onClick={() => handleRemoveItem(item.product.id)} className="p-1.5 -mr-1 text-[#59665f]/50 hover:text-red-600" aria-label={`Xóa ${item.product.name}`}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-3">
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => handleUpdateQty(item.product.id, item.quantity - 1)} className="w-9 h-9 rounded-lg bg-[#f6f7f4] font-bold text-base">−</button>
                            <input type="number" min={0.1} step={1} value={item.quantity} onChange={(e) => handleUpdateQty(item.product.id, parseFloat(e.target.value) || 0)} className="w-16 h-9 text-center font-bold border border-[#14231c]/15 rounded-lg text-sm" aria-label={`Số lượng ${item.product.name}`} />
                            <button type="button" onClick={() => handleUpdateQty(item.product.id, item.quantity + 1)} className="w-9 h-9 rounded-lg bg-[#f6f7f4] font-bold text-base">+</button>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-[#59665f]">{item.product.priceOnRequest ? 'Liên hệ báo giá' : money(item.product.price)} / {item.product.unit || 'Kg'}</p>
                            <p className="font-bold text-[#0f6f4b]">{item.product.priceOnRequest ? 'Tạm tính' : money(lineTotal)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#59665f]">#{idx + 1} · Giá sẽ được xác nhận lại theo đơn cuối cùng.</p>
                  </div>
                );
              })
            )}
          </div>
          <div className="hidden md:block overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[620px]">
              <thead>
                <tr className="bg-[#f8faf7] border-b border-[#14231c]/10 text-[12px] font-bold text-[#59665f] uppercase tracking-wider">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-3 w-16">Ảnh</th>
                  <th className="py-3 px-3 w-28">Mã hàng</th>
                  <th className="py-3 px-3">Tên hàng hóa</th>
                  <th className="py-3 px-3 w-20 text-center">ĐVT</th>
                  <th className="py-3 px-3 w-32 text-center">Số lượng</th>
                  <th className="py-3 px-3 w-28 text-right">Đơn giá</th>
                  <th className="py-3 px-3 w-32 text-right">Thành tiền</th>
                  <th className="py-3 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14231c]/5 text-sm font-medium">
                {activeTab.items.length === 0 ? (
                  <tr>
                     <td colSpan={9} className="py-20 text-center text-[#59665f]">
                      <div className="w-16 h-16 rounded-full bg-[#f6f7f4] flex items-center justify-center mx-auto mb-3 text-[#59665f]/40">
                        <Search size={28} />
                      </div>
                      <p className="font-semibold text-base text-[#14231c]">
                        Chưa có mặt hàng nào trong đơn này
                      </p>
                      <p className="text-xs text-[#59665f] mt-1 max-w-sm mx-auto">
                        Gõ tên hoặc mã hàng vào ô tìm kiếm ở trên (hoặc bấm <span className="font-bold text-[#0070f3]">F3</span>) để thêm hàng hóa nhanh chóng.
                      </p>
                    </td>
                  </tr>
                ) : (
                  activeTab.items.map((item, idx) => {
                    const lineTotal = item.quantity * (item.product.price || 0);
                    return (
                      <tr
                        key={item.product.id}
                        className="hover:bg-[#fbfcfb] transition-colors group"
                      >
                        {/* STT */}
                        <td className="py-3 px-3 text-center text-xs text-[#59665f] font-mono">
                          {idx + 1}
                        </td>

                        {/* Ảnh sản phẩm */}
                        <td className="py-2 px-3">
                          <ProductThumbnail product={item.product} compact />
                        </td>

                        {/* Mã hàng SKU */}
                        <td className="py-3 px-3 text-xs font-mono font-bold text-[#59665f]">
                          {item.product.sku || '—'}
                        </td>

                        {/* Tên hàng hóa */}
                        <td className="py-3 px-3 font-semibold text-[#14231c]">
                          <div className="line-clamp-1">{item.product.name}</div>
                          {item.product.category && (
                            <span className="text-[10px] text-[#59665f] font-normal">
                              {item.product.category}
                            </span>
                          )}
                        </td>

                        {/* ĐVT */}
                        <td className="py-3 px-3 text-center text-xs text-[#59665f] font-semibold">
                          <span className="px-2 py-0.5 bg-[#f6f7f4] rounded-md border border-[#14231c]/5">
                            {item.product.unit || 'Kg'}
                          </span>
                        </td>

                        {/* Số lượng (+ / -) */}
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, item.quantity - 1)}
                              className="w-7 h-7 rounded-lg bg-[#f6f7f4] hover:bg-[#eaece8] text-[#14231c] flex items-center justify-center font-bold text-sm select-none"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={0.1}
                              step={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateQty(item.product.id, parseFloat(e.target.value) || 0)
                              }
                              className="w-14 text-center font-bold py-1 border border-[#14231c]/15 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0070f3]"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, item.quantity + 1)}
                              className="w-7 h-7 rounded-lg bg-[#f6f7f4] hover:bg-[#eaece8] text-[#14231c] flex items-center justify-center font-bold text-sm select-none"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Đơn giá */}
                        <td className="py-3 px-3 text-right font-mono text-sm text-[#59665f]">
                          {item.product.priceOnRequest ? (
                            <span className="text-amber-600 text-xs font-sans">Liên hệ báo giá</span>
                          ) : (
                            money(item.product.price)
                          )}
                        </td>

                        {/* Thành tiền */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-sm text-[#0f6f4b]">
                          {item.product.priceOnRequest ? (
                            <span className="text-xs text-amber-600 font-sans">Tạm tính 0đ</span>
                          ) : (
                            money(lineTotal)
                          )}
                        </td>

                        {/* Xóa dòng */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.product.id)}
                            className="text-[#59665f]/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Xóa mặt hàng này"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Dòng tóm tắt & Ghi chú dưới chân bảng */}
          <div className="bg-[#f8faf7] border-t border-[#14231c]/10 p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Ghi chú đơn hàng */}
            <div className="flex-1">
              <input
                type="text"
                value={activeTab.note}
                onChange={(e) => updateActiveTab((t) => ({ ...t, note: e.target.value }))}
                placeholder="Ghi chú đơn hàng (ví dụ: sơ chế sẵn, chia 2 phần, giao đúng giờ...)"
                className="w-full bg-white border border-[#14231c]/15 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#0070f3]"
              />
            </div>

            {/* Thống kê tiền */}
            <div className="flex items-center gap-6 shrink-0 text-sm">
              <div>
                <span className="text-[#59665f] text-xs">Tổng mặt hàng:</span>{' '}
                <span className="font-bold text-[#14231c]">{totalItemsCount}</span> (
                <span className="font-bold text-[#0f6f4b]">{totalQuantity.toFixed(1)}</span> ĐVT)
              </div>
              <div>
                <span className="text-[#59665f] text-xs">Tổng tiền hàng:</span>{' '}
                <span className="font-mono font-bold text-[#14231c]">{money(subtotalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------------------- */}
        {/* CỘT PHẢI: GIAO HÀNG, THÔNG TIN KHÁCH HÀNG & NÚT ĐẶT HÀNG (4/12) */}
        {/* --------------------------------------------------------------------- */}
        <div className="min-w-0 space-y-3">
          {/* Card Thông tin khách hàng & Giao nhận */}
          <div className="bg-white rounded-2xl border border-[#14231c]/10 shadow-sm p-4 space-y-3.5">
            {/* Header thông tin khách */}
            <div className="flex items-center justify-between pb-3 border-b border-[#14231c]/10">
              <div>
                <span className="text-xs text-[#59665f] font-medium block">Khách hàng đặt</span>
                <p className="font-bold text-sm text-[#14231c] truncate">
                  {session?.name || session?.company || 'Khách hàng VIP'}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 text-xs font-bold border border-emerald-500/20 font-mono">
                {session?.code}
              </span>
            </div>

            {/* Thông tin nhận hàng */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Ngày giao hàng mong muốn
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={15} />
                  <input
                    type="date"
                    value={activeTab.deliveryDate}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryDate: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Khung giờ / Ca giao hàng
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={15} />
                  <select
                    value={activeTab.deliveryShift}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryShift: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white cursor-pointer"
                  >
                    <option value="Ca sáng sớm (05:00 - 07:00)">Ca sáng sớm (05:00 - 07:00)</option>
                    <option value="Ca sáng (07:00 - 09:00)">Ca sáng (07:00 - 09:00)</option>
                    <option value="Ca trưa (09:30 - 11:00)">Ca trưa (09:30 - 11:00)</option>
                    <option value="Ca chiều (14:00 - 16:00)">Ca chiều (14:00 - 16:00)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                    Người nhận
                  </label>
                  <input
                    type="text"
                    value={activeTab.deliveryName}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryName: e.target.value }))}
                    placeholder="Tên người nhận"
                    className="w-full px-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={activeTab.deliveryPhone}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryPhone: e.target.value }))}
                    placeholder="SĐT người nhận"
                    className="w-full px-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Địa chỉ giao hàng chi tiết
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 text-[#59665f]/60" size={15} />
                  <textarea
                    rows={2}
                    value={activeTab.deliveryAddress}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryAddress: e.target.value }))}
                    placeholder="Số nhà, đường, xưởng, bếp ăn..."
                    className="w-full pl-9 pr-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Tổng kết tiền đơn hàng */}
            <div className="pt-3 border-t border-[#14231c]/10 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#59665f]">
                <span>Tổng tiền hàng:</span>
                <span className="font-mono font-semibold text-[#14231c]">{money(subtotalAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#59665f]">
                <span>Giảm giá / Chiết khấu:</span>
                <span className="font-mono font-semibold text-[#14231c]">{money(discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#14231c]/10">
                <span className="text-sm font-bold text-[#14231c]">Khách cần trả:</span>
                <span className="text-xl font-black font-mono text-[#0070f3]">
                  {money(finalTotalAmount)}
                </span>
              </div>
              <p className="text-[11px] text-[#59665f]/80 text-right">
                *(Tạm tính — Sale sẽ chốt giá thực tế theo biến động giá tươi trong ngày)
              </p>
            </div>

            {/* Báo lỗi nếu có */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Nút gửi đơn đặt hàng */}
            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={submitting || activeTab.items.length === 0}
              className="w-full py-4 rounded-xl font-black text-base tracking-wider bg-[#0070f3] hover:bg-[#005bb5] text-white shadow-lg shadow-[#0070f3]/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase"
            >
              {submitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>ĐANG GỬI ĐƠN HÀNG...</span>
                </>
              ) : (
                <>
                  <span>ĐẶT HÀNG</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Thanh trạng thái chân trang */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-[#14231c]/10 p-2.5 px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#59665f]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-bold text-[#0070f3]">
            <Truck size={14} /> Bán giao hàng
          </span>
          <span className="text-[#14231c]/20">|</span>
          <span>⚡ Nhận mọi đơn đặt hàng thực phẩm tươi</span>
          <span className="text-[#14231c]/20">|</span>
          <span className="hidden md:inline">Phím tắt: <kbd className="px-1.5 py-0.5 bg-[#f6f7f4] border border-[#14231c]/10 rounded font-mono font-bold">F3</kbd> Tìm hàng hóa</span>
        </div>

        <div className="flex items-center gap-4">
          <span>Hỗ trợ đặt hàng: <strong className="text-[#14231c]">089 890 2222</strong></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL THÔNG BÁO TẠO ĐƠN THÀNH CÔNG */}
      {/* ========================================================================= */}
      {successOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-7 max-w-md w-full shadow-2xl border border-[#14231c]/10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#14231c]">Gửi đơn đặt hàng thành công!</h3>
              <p className="text-sm text-[#59665f] mt-1">
                Mã đơn hàng của bạn:{' '}
                <span className="font-mono font-bold text-[#0070f3] text-base">{successOrder.code}</span>
              </p>
            </div>

            <p className="text-xs text-[#59665f] leading-relaxed bg-[#f8faf7] p-3 rounded-xl border border-[#14231c]/5">
              Đơn hàng đã được chuyển tới bộ phận Bán hàng &amp; Thu mua TPS1 để chuẩn bị và sắp xếp xe lạnh giao theo đúng ca hẹn của bạn.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSuccessOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#14231c]/15 text-[#14231c] text-xs font-bold hover:bg-[#f6f7f4] transition-colors"
              >
                Tiếp tục lên đơn khác
              </button>
              <button
                type="button"
                onClick={() => navigate('/don-hang')}
                className="flex-1 py-2.5 rounded-xl bg-[#0070f3] hover:bg-[#005bb5] text-white text-xs font-bold transition-colors"
              >
                Xem đơn hàng của tôi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
