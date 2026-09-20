import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, RefreshCw, X, Package, Plus } from 'lucide-react';

type ProductSearchCacheEntry = { expiresAt: number; products: SearchProductItem[] };
const PRODUCT_SEARCH_CACHE_TTL = 5 * 60 * 1000;
const productSearchCache = new Map<string, ProductSearchCacheEntry>();
const productCatalogCache = new Map<string, ProductSearchCacheEntry>();
const CATALOG_STORAGE_PREFIX = 'tps1_admin_product_catalog_v1_';

export interface SearchProductItem {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  image_url?: string | null;
  thumb_url?: string | null;
  price: number;
  basePrice?: number;
  price_retail?: number;
  price_wholesale?: number;
  trackInventory?: boolean;
  stockQty?: number | null;
  lowStock?: boolean;
  categoryLabel?: string;
  [key: string]: any;
}

type CompactCatalogRow = [
  string, string, string, string, string, number, number, string, boolean,
  boolean, number | null, boolean
];

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

function decodeCatalog(rows: CompactCatalogRow[]): SearchProductItem[] {
  return rows.map((row) => ({
    id: row[0], sku: row[1], name: row[2], category: row[3] || null, unit: row[4] || 'Kg',
    price: Number(row[5]) || 0, basePrice: Number(row[6]) || 0,
    thumb_url: row[8] ? row[7] : null, image_url: row[8] ? null : row[7],
    trackInventory: Boolean(row[9]), stockQty: row[10], lowStock: Boolean(row[11]),
    categoryLabel: row[3] || '',
    _searchKey: normalizeSearch(`${row[1]} ${row[2]} ${row[3] || ''}`),
    _skuKey: normalizeSearch(row[1] || ''),
    _nameKey: normalizeSearch(row[2] || ''),
  }));
}

interface ProductSearchBoxProps {
  apiBase?: string;
  token?: string | null;
  customerId?: string | null;
  placeholder?: string;
  onSelectProduct: (product: SearchProductItem) => void;
  onQuickAddProduct?: (initialName: string) => void;
  showCategoryFilter?: boolean;
  autoFocus?: boolean;
  className?: string;
}

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ';
}

/**
 * Trả về URL ảnh Supabase hoặc placeholder an toàn
 */
export function resolveThumbnailUrl(thumbUrl?: string | null, imageUrl?: string | null): string | null {
  const url = thumbUrl || imageUrl;
  if (!url) return null;
  if (url.startsWith('http')) return url;
  // Ưu tiên bucket product-images, fallback products
  const bucket = thumbUrl ? 'product-images' : 'products';
  return `https://yntgxollwjemyidizhnn.supabase.co/storage/v1/object/public/${bucket}/${url}`;
}

/**
 * Tô đậm các từ khoá khớp trong tên sản phẩm
 */
export function highlightKeywords(text: string, query: string) {
  if (!query || !text) return text;
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) return text;

  // Regex khớp bất kỳ từ nào
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        words.some((w) => w.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="bg-amber-200 text-slate-900 rounded-sm px-0.5 font-bold">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function ProductSearchBox({
  apiBase = '',
  token,
  customerId,
  placeholder = 'Tìm tên hoặc mã sản phẩm (tự gợi ý, Enter để chọn)...',
  onSelectProduct,
  onQuickAddProduct,
  showCategoryFilter = true,
  autoFocus = false,
  className = '',
}: ProductSearchBoxProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [results, setResults] = useState<SearchProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [catalogProducts, setCatalogProducts] = useState<SearchProductItem[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Catalog giá theo khách được tải nền một lần và giữ 5 phút. Khi chưa sẵn
  // sàng, ô tìm kiếm vẫn dùng API cũ làm phương án dự phòng.
  useEffect(() => {
    if (!token) return;
    let active = true;
    const catalogKey = `${apiBase}|${customerId || 'base'}`;
    const cached = productCatalogCache.get(catalogKey);
    if (cached && cached.expiresAt > Date.now()) {
      setCatalogProducts(cached.products);
      return;
    }
    try {
      const stored = sessionStorage.getItem(`${CATALOG_STORAGE_PREFIX}${customerId || 'base'}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.expiresAt > Date.now() && Array.isArray(parsed.rows)) {
          const products = decodeCatalog(parsed.rows);
          productCatalogCache.set(catalogKey, { products, expiresAt: parsed.expiresAt });
          setCatalogProducts(products);
          return;
        }
      }
    } catch { /* bỏ qua cache lỗi */ }
    setCatalogProducts(null);
    const params = new URLSearchParams({ catalog: '1' });
    if (customerId) params.set('customerId', customerId);
    fetch(`${apiBase}/api/admin/products?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => ({ status: res.status, data: await res.json() }))
      .then(({ status, data }) => {
        if (!active) return;
        if (!data.ok || !Array.isArray(data.products)) {
          console.warn(`[TPS1 catalog] HTTP ${status}: ${data.error || 'Dữ liệu catalog không hợp lệ'}`);
          return;
        }
        const expiresAt = Date.now() + PRODUCT_SEARCH_CACHE_TTL;
        const products = decodeCatalog(data.products as CompactCatalogRow[]);
        productCatalogCache.set(catalogKey, { products, expiresAt });
        setCatalogProducts(products);
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key?.startsWith(CATALOG_STORAGE_PREFIX)) sessionStorage.removeItem(key);
          }
          sessionStorage.setItem(`${CATALOG_STORAGE_PREFIX}${customerId || 'base'}`, JSON.stringify({ expiresAt, rows: data.products }));
        } catch { /* sessionStorage đầy vẫn dùng cache RAM */ }
      })
      .catch((error) => { console.warn('[TPS1 catalog] Không tải được catalog, dùng tìm kiếm API dự phòng:', error); });
    return () => { active = false; };
  }, [apiBase, token, customerId]);

  // Tải danh mục phân loại một lần (qua get_distinct_categories)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/admin/products?meta=1`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (isMounted && data.ok && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [apiBase, token]);

  // Click outside -> đóng dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Tìm kiếm có debounce 250ms + AbortController
  const performSearch = useCallback(
    async (q: string, cat: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (!q.trim() && !cat) {
        setResults([]);
        setLoading(false);
        setIsOpen(false);
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('search', q.trim());
        if (cat) params.set('category', cat);
        if (customerId) params.set('customerId', customerId);
        params.set('pageSize', '50');

        const cacheKey = `${apiBase}|${customerId || ''}|${cat}|${q.trim().toLocaleLowerCase('vi-VN')}`;
        const cached = productSearchCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          setResults(cached.products);
          setSelectedIndex(0);
          setIsOpen(true);
          setLoading(false);
          return;
        }

        const res = await fetch(`${apiBase}/api/admin/products?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });

        const data = await res.json();
        if (!controller.signal.aborted) {
          const items = (data.products || []).map((p: any) => ({
            id: p.id,
            sku: p.sku || '',
            name: p.name,
            category: p.category || null,
            unit: p.unit || 'Kg',
            image_url: p.image_url,
            thumb_url: p.thumb_url,
            price: Number(p.price != null ? p.price : p.price_retail || 0),
            basePrice: Number(p.basePrice != null ? p.basePrice : p.price_retail || 0),
            price_retail: Number(p.price_retail || 0),
            price_wholesale: Number(p.price_wholesale || 0),
            trackInventory: !!p.trackInventory,
            stockQty: p.stockQty != null ? Number(p.stockQty) : null,
            lowStock: !!p.lowStock,
            categoryLabel: p.category || '',
          }));
          productSearchCache.set(cacheKey, { products: items, expiresAt: Date.now() + PRODUCT_SEARCH_CACHE_TTL });
          setResults(items);
          setSelectedIndex(0);
          setIsOpen(true);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Lỗi tìm kiếm sản phẩm:', err);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [apiBase, token, customerId]
  );

  const performLocalSearch = useCallback((q: string, cat: string) => {
    if (!catalogProducts) return false;
    const needle = normalizeSearch(q);
    if (!needle && !cat) {
      setResults([]); setLoading(false); setIsOpen(false); return true;
    }
    const categoryNeedle = normalizeSearch(cat);
    const ranked = catalogProducts
      .filter((p: any) => (!categoryNeedle || normalizeSearch(p.category || '') === categoryNeedle) && (!needle || p._searchKey.includes(needle)))
      .map((p: any) => {
        let score = 5;
        if (p._skuKey === needle) score = 0;
        else if (p._skuKey.startsWith(needle)) score = 1;
        else if (p._nameKey === needle) score = 2;
        else if (p._nameKey.startsWith(needle)) score = 3;
        else if (p._nameKey.includes(needle)) score = 4;
        return { p, score };
      })
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name, 'vi'))
      .slice(0, 50)
      .map(({ p }) => p);
    setResults(ranked);
    setSelectedIndex(0);
    setLoading(false);
    setIsOpen(true);
    return true;
  }, [catalogProducts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!performLocalSearch(searchTerm, selectedCategory)) performSearch(searchTerm, selectedCategory);
    }, catalogProducts ? 0 : 120);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedCategory, performSearch, performLocalSearch, catalogProducts]);

  const handleSelect = (product: SearchProductItem) => {
    onSelectProduct(product);
    setSearchTerm('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Enter' && searchTerm.trim() && onQuickAddProduct) {
        onQuickAddProduct(searchTerm.trim());
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative space-y-2 ${className}`}>
      {showCategoryFilter && categories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
              !selectedCategory ? 'bg-green-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả danh mục
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === c ? '' : c)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                selectedCategory === c ? 'bg-green-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-600 shadow-sm transition-all"
        />
        {loading ? (
          <RefreshCw size={16} className="animate-spin absolute right-3.5 top-1/2 -translate-y-1/2 text-green-600" />
        ) : searchTerm ? (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 max-h-96 overflow-y-auto">
          {results.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {results.map((product, idx) => {
                const imgUrl = resolveThumbnailUrl(product.thumb_url, product.image_url);
                const isSelected = idx === selectedIndex;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelect(product)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3.5 p-3 text-left transition-colors ${
                      isSelected ? 'bg-green-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Thumbnail 64px x 64px với Fallback Placeholder */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-100 bg-slate-100 relative flex items-center justify-center">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={product.name}
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                            const fallback = (e.target as HTMLElement).nextElementSibling;
                            if (fallback) (fallback as HTMLElement).style.display = 'flex';
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                      <div
                        className={`w-full h-full flex flex-col items-center justify-center text-green-700 bg-green-50 ${
                          imgUrl ? 'hidden' : 'flex'
                        }`}
                      >
                        <Package size={22} className="opacity-60" />
                        <span className="text-[9px] font-semibold tracking-wider uppercase opacity-60 mt-0.5">TPS1</span>
                      </div>
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm leading-snug">
                        {highlightKeywords(product.name, searchTerm)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        {product.sku && (
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono text-[11px]">
                            {highlightKeywords(product.sku, searchTerm)}
                          </span>
                        )}
                        {product.category && <span className="text-slate-400">· {product.category}</span>}
                        <span className="text-slate-400">· ĐVT: {product.unit}</span>
                      </div>

                      {product.trackInventory && (
                        <p
                          className={`text-xs mt-1 font-medium ${
                            (product.stockQty ?? 0) <= 0
                              ? 'text-red-500'
                              : product.lowStock
                              ? 'text-amber-600'
                              : 'text-slate-400'
                          }`}
                        >
                          Tồn kho: {product.stockQty ?? 0} {product.unit}
                          {(product.stockQty ?? 0) <= 0 ? ' (hết hàng)' : product.lowStock ? ' (sắp hết)' : ''}
                        </p>
                      )}
                    </div>

                    {/* Price & Add */}
                    <div className="text-right shrink-0">
                      <p
                        className={`font-bold text-sm ${
                          product.basePrice != null && product.price !== product.basePrice
                            ? 'text-red-600'
                            : 'text-green-700'
                        }`}
                      >
                        {money(product.price)}
                      </p>
                      {product.basePrice != null && product.price !== product.basePrice && (
                        <p className="text-[11px] text-slate-400 line-through">{money(product.basePrice)}</p>
                      )}
                      <div className="mt-1 flex items-center justify-end text-xs font-semibold text-green-600">
                        <Plus size={14} className="mr-0.5" /> Thêm
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : !loading ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <Package size={32} className="mx-auto mb-2 text-slate-300" />
              <p>Không tìm thấy sản phẩm phù hợp với "{searchTerm}"</p>
              {onQuickAddProduct && (
                <button
                  type="button"
                  onClick={() => {
                    onQuickAddProduct(searchTerm.trim());
                    setIsOpen(false);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors"
                >
                  <Plus size={14} /> Thêm "{searchTerm}" vào danh mục hàng hóa
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
