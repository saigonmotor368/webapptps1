import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, Plus,
  Upload, Download, X, CheckCircle2, Sliders, Edit3, Check, Layers,
  ExternalLink, FileSpreadsheet, Info
} from 'lucide-react';
import { getValidQuantityExamples, formatQuantityVN } from '../lib/quantityRules';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ';
}

interface Product {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  image_url?: string | null;
  price_retail: number | null;
  price_wholesale: number | null;
  stock_qty: number | null;
  track_inventory: boolean;
  is_low_stock: boolean;
  packaging_note?: string | null;
  min_order_qty?: number;
  order_step?: number;
  enforce_order_step?: boolean;
}

interface SpecStats {
  total: number;
  configured: number;
  unconfigured: number;
  enforced: number;
}

export default function ProductsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

  const [categories, setCategories] = useState<string[]>([]);
  const [canEdit, setCanEdit] = useState(false);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [specFilter, setSpecFilter] = useState<'all' | 'configured' | 'unconfigured' | 'enforced'>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 40;

  // Data & Stats
  const [products, setProducts] = useState<Product[]>([]);
  const [specStats, setSpecStats] = useState<SpecStats>({ total: 0, configured: 0, unconfigured: 0, enforced: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Selection for Batch Edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals & Popups
  const [quickEditProduct, setQuickEditProduct] = useState<Product | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showSpecsImport, setShowSpecsImport] = useState(false);
  const [showInventoryImport, setShowInventoryImport] = useState(false);
  const [showPricebookImport, setShowPricebookImport] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // Debounce search 300ms với AbortController
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load metadata danh mục
  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/api/admin/products?meta=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setCategories(data.categories || []);
      })
      .catch((err) => console.warn('Lỗi tải meta danh mục:', err));
  }, [token, apiBase]);

  // Fetch sản phẩm phân trang phía server kèm abort controller
  const fetchProducts = useCallback(async (signal?: AbortSignal) => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (category) params.set('category', category);
      if (lowStockOnly) params.set('lowStockOnly', '1');
      if (specFilter !== 'all') params.set('specFilter', specFilter);

      const res = await fetch(`${apiBase}/api/admin/products?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        setProducts([]);
        setTotal(0);
        setLoadError('Phiên đăng nhập đã hết hạn hoặc không đủ quyền. Vui lòng đăng nhập lại.');
      } else if (data.ok) {
        setProducts(data.products || []);
        setTotal(data.total || 0);
        setCanEdit(!!data.canEdit);
        if (data.specStats) {
          setSpecStats(data.specStats);
        }
      } else {
        setLoadError(data.error || 'Không tải được danh sách hàng hóa.');
        showToast(data.error || 'Không tải được danh sách hàng hóa', 'error');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Fetch products error:', err);
        setLoadError('Không kết nối được máy chủ dữ liệu hàng hóa.');
      }
    } finally {
      setLoading(false);
    }
  }, [token, apiBase, page, debouncedSearch, category, lowStockOnly, specFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProducts(controller.signal);
    return () => controller.abort();
  }, [fetchProducts]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Chọn dòng
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 text-sm transition-all transform animate-in fade-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <AlertTriangle size={18} className="text-rose-600 shrink-0" />}
          <span className="font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Hàng hóa & Quy cách</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {total} mã hàng {!canEdit && '· chỉ xem (cần quyền Admin/Thu mua để sửa quy cách)'}
          </p>
        </div>

        <div className="flex gap-2 self-start flex-wrap">
          {canEdit && (
            <>
              <button
                onClick={() => setShowSpecsImport(true)}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm transition-colors"
                title="Nhập quy cách đóng gói và bước đặt hàng từ file Excel"
              >
                <Sliders size={16} /> Nhập quy cách Excel
              </button>
              <button
                onClick={() => setShowInventoryImport(true)}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              >
                <Upload size={16} /> Nhập kho
              </button>
              <button
                onClick={() => setShowPricebookImport(true)}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              >
                <FileSpreadsheet size={16} /> Bảng giá Excel
              </button>
              <button
                onClick={() => navigate('/hang-hoa/moi')}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
              >
                <Plus size={16} /> Thêm sản phẩm
              </button>
            </>
          )}
          <button
            onClick={() => fetchProducts()}
            className="p-2 border border-slate-200 text-slate-600 bg-white rounded-lg hover:bg-slate-50 transition-colors"
            title="Tải lại danh sách"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} />
          </button>
        </div>
      </header>

      {/* Chỉ báo thống kê quy cách (Section 3.1) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => { setSpecFilter('all'); setPage(0); }}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            specFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white border-slate-200/80 text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-medium opacity-80">Tổng sản phẩm</div>
          <div className="text-xl font-bold mt-1">{specStats.total || total}</div>
          <div className="text-[11px] opacity-70 mt-0.5">Tất cả sản phẩm đang hoạt động</div>
        </button>

        <button
          onClick={() => { setSpecFilter('configured'); setPage(0); }}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            specFilter === 'configured'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white border-slate-200/80 text-slate-700 hover:border-emerald-300'
          }`}
        >
          <div className="text-xs font-medium opacity-80">Đã hoàn thiện quy cách</div>
          <div className="text-xl font-bold mt-1 text-emerald-600 group-hover:text-emerald-700" style={{ color: specFilter === 'configured' ? 'white' : undefined }}>
            {specStats.configured}
          </div>
          <div className="text-[11px] opacity-70 mt-0.5">Đã ghi quy cách hoặc bước đặt</div>
        </button>

        <button
          onClick={() => { setSpecFilter('unconfigured'); setPage(0); }}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            specFilter === 'unconfigured'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white border-slate-200/80 text-slate-700 hover:border-amber-300'
          }`}
        >
          <div className="text-xs font-medium opacity-80">Chưa hoàn thiện quy cách</div>
          <div className="text-xl font-bold mt-1 text-amber-600" style={{ color: specFilter === 'unconfigured' ? 'white' : undefined }}>
            {specStats.unconfigured}
          </div>
          <div className="text-[11px] opacity-70 mt-0.5">Cần bổ sung mô tả & bước đặt</div>
        </button>

        <button
          onClick={() => { setSpecFilter('enforced'); setPage(0); }}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            specFilter === 'enforced'
              ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
              : 'bg-white border-slate-200/80 text-slate-700 hover:border-sky-300'
          }`}
        >
          <div className="text-xs font-medium opacity-80">Đang bật kiểm tra quy cách</div>
          <div className="text-xl font-bold mt-1 text-sky-600" style={{ color: specFilter === 'enforced' ? 'white' : undefined }}>
            {specStats.enforced}
          </div>
          <div className="text-[11px] opacity-70 mt-0.5">Bắt buộc đúng số lượng min/bước</div>
        </button>
      </div>

      {/* Thanh tìm kiếm & Bộ lọc */}
      <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên sản phẩm, mã hàng SKU..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-slate-200 text-slate-700 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Tất cả nhóm hàng</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={specFilter}
          onChange={(e) => { setSpecFilter(e.target.value as any); setPage(0); }}
          className="px-3 py-2 border border-slate-200 text-slate-700 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
        >
          <option value="all">Quy cách: Tất cả</option>
          <option value="configured">Quy cách: Đã thiết lập</option>
          <option value="unconfigured">Quy cách: Chưa thiết lập</option>
          <option value="enforced">Quy cách: Đang bật kiểm tra</option>
        </select>

        <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => { setLowStockOnly(e.target.checked); setPage(0); }}
            className="rounded text-emerald-600 focus:ring-emerald-500"
          />
          <span>Sắp hết hàng</span>
        </label>
      </div>

      {/* Thanh tác vụ hàng loạt khi có dòng được chọn */}
      {selectedIds.size > 0 && canEdit && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-sm animate-in fade-in">
          <div className="flex items-center gap-2 text-emerald-900 font-medium">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <span>Đã chọn <strong className="font-bold text-emerald-800">{selectedIds.size}</strong> sản phẩm</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBatchModal(true)}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs"
            >
              <Edit3 size={14} /> Sửa quy cách {selectedIds.size} sản phẩm
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Danh sách Hàng hóa */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100 text-slate-500">
          <RefreshCw className="animate-spin text-emerald-600 mb-2" size={24} />
          <span className="text-sm font-medium">Đang tải danh sách hàng hóa...</span>
        </div>
      ) : loadError ? (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 py-16 text-center text-amber-700">
          {loadError}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-20 text-center text-slate-400">
          <Layers size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium text-slate-600">Không tìm thấy mã hàng nào phù hợp</p>
          <p className="text-xs text-slate-400 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                  {canEdit && (
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === products.length && products.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">Mã & Tên hàng hóa</th>
                  <th className="py-3 px-3">Quy cách đóng gói</th>
                  <th className="py-3 px-3 text-center">Số lượng tối thiểu</th>
                  <th className="py-3 px-3 text-center">Bước đặt hàng</th>
                  <th className="py-3 px-3 text-center">Kiểm tra</th>
                  <th className="py-3 px-4 text-right">Đơn giá bán</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const basePrice = Number(p.price_retail) || Number(p.price_wholesale) || 0;
                  const isSelected = selectedIds.has(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-emerald-50/40' : ''}`}
                    >
                      {canEdit && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                      )}

                      {/* Tên hàng & SKU */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover border border-slate-100 shrink-0 bg-slate-50"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200/60 shrink-0 flex items-center justify-center text-slate-400 font-bold text-xs">
                              {p.name.substring(0, 1)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <button
                              onClick={() => navigate(`/hang-hoa/${p.id}`)}
                              className="font-medium text-slate-800 hover:text-emerald-700 transition-colors text-left truncate block max-w-md"
                              title={p.name}
                            >
                              {p.name}
                            </button>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                              <span className="font-mono text-slate-600 font-medium">{p.sku || '—'}</span>
                              <span>·</span>
                              <span>{p.category || 'Chưa phân loại'}</span>
                              <span>·</span>
                              <span className="bg-slate-100 text-slate-600 px-1 rounded">{p.unit || 'Kg'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Quy cách đóng gói */}
                      <td className="py-3 px-3">
                        {p.packaging_note ? (
                          <span className="inline-flex items-center gap-1 text-slate-700 font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">
                            {p.packaging_note}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Chưa thiết lập</span>
                        )}
                      </td>

                      {/* Số lượng tối thiểu */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="text-slate-700 font-semibold">
                          {formatQuantityVN(p.min_order_qty ?? 1)}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">{p.unit || 'Kg'}</span>
                      </td>

                      {/* Bước đặt hàng */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="text-slate-700 font-semibold">
                          +{formatQuantityVN(p.order_step ?? 1)}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">{p.unit || 'Kg'}</span>
                      </td>

                      {/* Bật kiểm tra quy cách */}
                      <td className="py-3 px-3 text-center">
                        {p.enforce_order_step ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Check size={12} /> Bật
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-slate-400 bg-slate-100">
                            Tắt
                          </span>
                        )}
                      </td>

                      {/* Giá */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-semibold text-slate-800">
                          {basePrice > 0 ? money(basePrice) : <span className="text-amber-600 text-xs">Báo giá</span>}
                        </div>
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canEdit && (
                            <button
                              onClick={() => setQuickEditProduct(p)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Sửa nhanh quy cách"
                            >
                              <Edit3 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/hang-hoa/${p.id}`)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Chi tiết sản phẩm"
                          >
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Phân trang */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
          <div className="text-xs text-slate-500">
            Hiển thị trang {page + 1} / {totalPages} ({total} mã hàng)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 border border-slate-200 bg-white rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              title="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold px-2">Trang {page + 1}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 border border-slate-200 bg-white rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              title="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal Sửa Nhanh 1 Sản Phẩm (Section 3.1) */}
      {quickEditProduct && (
        <QuickEditModal
          product={quickEditProduct}
          apiBase={apiBase}
          token={token}
          onClose={() => setQuickEditProduct(null)}
          onSuccess={(updated) => {
            setQuickEditProduct(null);
            showToast(`Đã lưu quy cách cho ${updated.name}`);
            fetchProducts();
          }}
        />
      )}

      {/* Modal Sửa Quy Cách Hàng Loạt (Section 3.1) */}
      {showBatchModal && (
        <BatchEditModal
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          apiBase={apiBase}
          token={token}
          onClose={() => setShowBatchModal(false)}
          onSuccess={(count) => {
            setShowBatchModal(false);
            setSelectedIds(new Set());
            showToast(`Đã cập nhật quy cách cho ${count} sản phẩm đã chọn`);
            fetchProducts();
          }}
        />
      )}

      {/* Modal Nhập Quy Cách Hàng Loạt 2 Bước (Section 3.4) */}
      {showSpecsImport && (
        <ImportSpecsModal
          apiBase={apiBase}
          token={token}
          onClose={() => setShowSpecsImport(false)}
          onDone={(result) => {
            setShowSpecsImport(false);
            if (result?.partial) {
              showToast(result.message || `Cập nhật một phần: Đã áp dụng ${result.summary?.applied} mã, ${result.summary?.failed} mã bị lỗi.`);
            } else {
              showToast(`Đã cập nhật quy cách thành công cho ${result?.summary?.applied || 'toàn bộ'} mã hàng.`);
            }
            fetchProducts();
          }}
        />
      )}

      {/* Modal Nhập Kho Cũ */}
      {showInventoryImport && (
        <ImportInventoryModal
          apiBase={apiBase}
          token={token}
          onClose={() => setShowInventoryImport(false)}
          onDone={() => { setShowInventoryImport(false); fetchProducts(); }}
        />
      )}

      {/* Modal Nhập Bảng Giá Cũ */}
      {showPricebookImport && (
        <ImportPricebookModal
          apiBase={apiBase}
          token={token}
          onClose={() => setShowPricebookImport(false)}
          onDone={() => { setShowPricebookImport(false); fetchProducts(); }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Component: Modal Sửa Nhanh 1 Sản Phẩm (QuickEditModal)
// -------------------------------------------------------------
function QuickEditModal({
  product,
  apiBase,
  token,
  onClose,
  onSuccess,
}: {
  product: Product;
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onSuccess: (p: Product) => void;
}) {
  const [packagingNote, setPackagingNote] = useState(product.packaging_note || '');
  const [minOrderQty, setMinOrderQty] = useState(String(product.min_order_qty ?? 1));
  const [orderStep, setOrderStep] = useState(String(product.order_step ?? 1));
  const [enforceOrderStep, setEnforceOrderStep] = useState(Boolean(product.enforce_order_step));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sinh ví dụ tự động
  const exampleText = useMemo(() => {
    const min = Number(minOrderQty) || 1;
    const step = Number(orderStep) || 1;
    return getValidQuantityExamples(min, step, product.unit || 'Kg');
  }, [minOrderQty, orderStep, product.unit]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (packagingNote && packagingNote.trim().length > 120) {
      errs.packagingNote = 'Mô tả quy cách không được vượt quá 120 ký tự';
    }
    const min = Number(minOrderQty);
    if (!Number.isFinite(min) || min < 0) {
      errs.minOrderQty = 'Số lượng tối thiểu không hợp lệ hoặc bị âm';
    } else if (Math.round(min * 1000) !== min * 1000) {
      errs.minOrderQty = 'Tối đa 3 chữ số thập phân';
    }

    const step = Number(orderStep);
    if (!Number.isFinite(step) || step < 0) {
      errs.orderStep = 'Bước đặt hàng không hợp lệ hoặc bị âm';
    } else if (Math.round(step * 1000) !== step * 1000) {
      errs.orderStep = 'Tối đa 3 chữ số thập phân';
    }

    if (enforceOrderStep) {
      if (min <= 0) errs.minOrderQty = 'Khi bật kiểm tra, số lượng tối thiểu phải lớn hơn 0';
      if (step <= 0) errs.orderStep = 'Khi bật kiểm tra, bước đặt hàng phải lớn hơn 0';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: product.id,
          fields: {
            packaging_note: packagingNote.trim() || null,
            min_order_qty: Number(minOrderQty) || 1,
            order_step: Number(orderStep) || 1,
            enforce_order_step: enforceOrderStep,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không lưu được thay đổi');
      onSuccess(data.product);
    } catch (err: any) {
      setErrors({ global: err.message || 'Lỗi lưu quy cách' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Sửa quy cách đặt hàng</h3>
            <p className="text-xs text-slate-500 font-mono">{product.sku} · {product.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {errors.global && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{errors.global}</span>
          </div>
        )}

        <div className="space-y-4 text-sm">
          {/* Packaging Note */}
          <div>
            <label className="block font-medium text-slate-700 text-xs uppercase tracking-wide mb-1">
              Mô tả quy cách đóng gói (tối đa 120 ký tự)
            </label>
            <input
              type="text"
              value={packagingNote}
              onChange={(e) => setPackagingNote(e.target.value)}
              placeholder="VD: Bịch 0,5kg, Khay 30 quả, Thùng 10kg..."
              maxLength={120}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                errors.packagingNote
                  ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                  : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
              }`}
            />
            {errors.packagingNote && <p className="text-rose-600 text-xs mt-1">{errors.packagingNote}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Min Order Qty */}
            <div>
              <label className="block font-medium text-slate-700 text-xs uppercase tracking-wide mb-1">
                Số lượng tối thiểu ({product.unit || 'Kg'})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 ${
                  errors.minOrderQty
                    ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
              {errors.minOrderQty && <p className="text-rose-600 text-xs mt-1">{errors.minOrderQty}</p>}
            </div>

            {/* Order Step */}
            <div>
              <label className="block font-medium text-slate-700 text-xs uppercase tracking-wide mb-1">
                Bước đặt hàng ({product.unit || 'Kg'})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={orderStep}
                onChange={(e) => setOrderStep(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 ${
                  errors.orderStep
                    ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
              {errors.orderStep && <p className="text-rose-600 text-xs mt-1">{errors.orderStep}</p>}
            </div>
          </div>

          {/* Enforce Checkbox */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enforceOrderStep}
                onChange={(e) => setEnforceOrderStep(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-semibold text-slate-800 text-sm">
                Bật kiểm tra quy cách đặt hàng
              </span>
            </label>
            <p className="text-xs text-slate-500 pl-6">
              Hệ thống sẽ từ chối số lượng không đúng bước đặt trên Website, Zalo Mini App và POS.
            </p>
          </div>

          {/* Live Example */}
          <div className="p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-xl flex items-start gap-2 text-xs text-emerald-900">
            <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Ví dụ số lượng hợp lệ:</span>{' '}
              <span className="font-mono font-bold text-emerald-800">{exampleText}</span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Đang lưu...' : 'Lưu quy cách'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Component: Modal Sửa Hàng Loạt (BatchEditModal)
// -------------------------------------------------------------
function BatchEditModal({
  selectedCount,
  selectedIds,
  apiBase,
  token,
  onClose,
  onSuccess,
}: {
  selectedCount: number;
  selectedIds: string[];
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const [packagingNote, setPackagingNote] = useState('');
  const [applyPackagingNote, setApplyPackagingNote] = useState(false);
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [applyMinOrderQty, setApplyMinOrderQty] = useState(true);
  const [orderStep, setOrderStep] = useState('1');
  const [applyOrderStep, setApplyOrderStep] = useState(true);
  const [enforceOrderStep, setEnforceOrderStep] = useState(true);
  const [applyEnforce, setApplyEnforce] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleBatchSave = async () => {
    setError('');
    const fields: Record<string, any> = {};

    if (applyPackagingNote) {
      if (packagingNote.trim().length > 120) {
        setError('Quy cách đóng gói tối đa 120 ký tự');
        return;
      }
      fields.packaging_note = packagingNote.trim() || null;
    }
    if (applyMinOrderQty) {
      const min = Number(minOrderQty);
      if (!Number.isFinite(min) || min < 0) {
        setError('Số lượng tối thiểu không hợp lệ');
        return;
      }
      fields.min_order_qty = min;
    }
    if (applyOrderStep) {
      const step = Number(orderStep);
      if (!Number.isFinite(step) || step < 0) {
        setError('Bước đặt hàng không hợp lệ');
        return;
      }
      fields.order_step = step;
    }
    if (applyEnforce) {
      fields.enforce_order_step = enforceOrderStep;
    }

    if (Object.keys(fields).length === 0) {
      setError('Vui lòng chọn ít nhất một thông số cần áp dụng hàng loạt');
      return;
    }

    if (fields.enforce_order_step === true) {
      if (fields.min_order_qty !== undefined && fields.min_order_qty <= 0) {
        setError('Khi bật kiểm tra quy cách, số lượng tối thiểu phải lớn hơn 0');
        return;
      }
      if (fields.order_step !== undefined && fields.order_step <= 0) {
        setError('Khi bật kiểm tra quy cách, bước đặt hàng phải lớn hơn 0');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productIds: selectedIds, fields }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không cập nhật được hàng loạt');
      onSuccess(data.updatedCount || selectedCount);
    } catch (err: any) {
      setError(err.message || 'Lỗi cập nhật hàng loạt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Sửa quy cách hàng loạt</h3>
            <p className="text-xs text-emerald-700 font-medium">Áp dụng cho {selectedCount} sản phẩm đã chọn</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 text-sm">
          {/* Packaging Note */}
          <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200/80">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyPackagingNote}
                onChange={(e) => setApplyPackagingNote(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-semibold text-xs uppercase tracking-wide text-slate-700">
                Áp dụng quy cách đóng gói chung
              </span>
            </label>
            {applyPackagingNote && (
              <input
                type="text"
                value={packagingNote}
                onChange={(e) => setPackagingNote(e.target.value)}
                placeholder="VD: Bịch 0,5kg hoặc để trống để xóa quy cách..."
                maxLength={120}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            )}
          </div>

          {/* Min Order Qty & Step */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200/80">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyMinOrderQty}
                  onChange={(e) => setApplyMinOrderQty(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-xs uppercase tracking-wide text-slate-700">
                  Số lượng tối thiểu
                </span>
              </label>
              {applyMinOrderQty && (
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200/80">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyOrderStep}
                  onChange={(e) => setApplyOrderStep(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-xs uppercase tracking-wide text-slate-700">
                  Bước đặt hàng
                </span>
              </label>
              {applyOrderStep && (
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={orderStep}
                  onChange={(e) => setOrderStep(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              )}
            </div>
          </div>

          {/* Enforce Checkbox */}
          <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200/80">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyEnforce}
                onChange={(e) => setApplyEnforce(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-semibold text-xs uppercase tracking-wide text-slate-700">
                Áp dụng trạng thái kiểm tra
              </span>
            </label>
            {applyEnforce && (
              <div className="flex gap-4 pt-1 pl-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="batchEnforce"
                    checked={enforceOrderStep === true}
                    onChange={() => setEnforceOrderStep(true)}
                    className="text-emerald-600"
                  />
                  <span className="font-medium text-emerald-800">Bật kiểm tra quy cách</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="batchEnforce"
                    checked={enforceOrderStep === false}
                    onChange={() => setEnforceOrderStep(false)}
                    className="text-slate-600"
                  />
                  <span className="text-slate-600">Tắt kiểm tra</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            onClick={handleBatchSave}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Đang lưu...' : `Áp dụng cho ${selectedCount} mã`}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Component: Modal Nhập Quy Cách Hàng Loạt 2 Bước (Section 3.4)
// -------------------------------------------------------------
function ImportSpecsModal({
  apiBase,
  token,
  onClose,
  onDone,
}: {
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onDone: (result?: any) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    valid: number;
    notFound: number;
    duplicateSku: number;
    invalidData: number;
  } | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'valid' | 'notFound' | 'duplicateSku' | 'invalidData'>('all');
  const [error, setError] = useState('');
  const [commitResult, setCommitResult] = useState<{
    applied: number;
    failed: number;
    partial: boolean;
    message: string;
    failedDetails: Array<{ row: number; sku: string; reason: string }>;
    summary?: any;
  } | null>(null);

  const runPreview = async () => {
    if (!file) return;
    setError('');
    setChecking(true);
    setCommitResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${apiBase}/api/admin/products/import-specs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi kiểm tra file');
      setSummary(data.summary);
      setPreview(data.preview || []);
    } catch (err: any) {
      setError(err.message || 'Không đọc được file');
    } finally {
      setChecking(false);
    }
  };

  const runCommit = async () => {
    if (!file || !summary || summary.valid === 0) return;
    setError('');
    setApplying(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('apply', '1');
      const res = await fetch(`${apiBase}/api/admin/products/import-specs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.failedDetails?.length) {
          setCommitResult({
            applied: data.summary?.applied || 0,
            failed: data.summary?.failed || data.failedDetails.length,
            partial: false,
            message: data.error || 'Cập nhật thất bại',
            failedDetails: data.failedDetails,
            summary: data.summary,
          });
        }
        throw new Error(data.error || 'Lỗi lưu quy cách');
      }

      if (data.partial) {
        setCommitResult(data);
      } else {
        onDone(data);
      }
    } catch (err: any) {
      setError(err.message || 'Không lưu được quy cách');
    } finally {
      setApplying(false);
    }
  };

  const filteredPreview = useMemo(() => {
    if (activeTab === 'all') return preview;
    if (activeTab === 'valid') return preview.filter((p) => p.status === 'valid');
    if (activeTab === 'notFound') return preview.filter((p) => p.status === 'not_found');
    if (activeTab === 'duplicateSku') return preview.filter((p) => p.status === 'duplicate_sku');
    if (activeTab === 'invalidData') return preview.filter((p) => p.status === 'invalid_data');
    return preview;
  }, [preview, activeTab]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Nhập quy cách hàng hóa từ Excel</h3>
            <p className="text-xs text-slate-500">Khớp mã hàng chính xác, kiểm tra dữ liệu 2 bước trước khi lưu</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2 shrink-0">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {commitResult && commitResult.partial && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl space-y-2 shrink-0">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle size={16} className="text-amber-600" />
              <span>Cập nhật một phần ({commitResult.summary?.applied ?? commitResult.applied} thành công, {commitResult.summary?.failed ?? commitResult.failed} thất bại)</span>
            </div>
            <p>{commitResult.message}</p>
          </div>
        )}

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* File picker & Download template */}
          {!commitResult && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  1. Chọn file Excel (.xlsx, tối đa 2.000 dòng)
                </span>
                <a
                  href={`${apiBase}/api/admin/products/import-specs`}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                  download
                >
                  <Download size={14} /> Tải file mẫu chuẩn (.xlsx)
                </a>
              </div>

              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setSummary(null);
                    setPreview([]);
                    setCommitResult(null);
                  }}
                  className="flex-1 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 cursor-pointer"
                />
                <button
                  onClick={runPreview}
                  disabled={!file || checking || applying}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  {checking ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                  {checking ? 'Đang kiểm tra...' : 'Tải & Xem trước'}
                </button>
              </div>
            </div>
          )}

          {/* If partial commit or failures during commit, show failed details */}
          {commitResult && commitResult.failedDetails && commitResult.failedDetails.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-rose-700 uppercase tracking-wide">
                Chi tiết các dòng không thể cập nhật:
              </div>
              <div className="border border-rose-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-rose-50 text-rose-800 font-semibold sticky top-0 border-b border-rose-200">
                    <tr>
                      <th className="py-2 px-3 w-16 text-center">Dòng</th>
                      <th className="py-2 px-3 w-32">Mã hàng</th>
                      <th className="py-2 px-3">Lý do thất bại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {commitResult.failedDetails.map((f, i) => (
                      <tr key={i} className="hover:bg-rose-50/50">
                        <td className="py-2 px-3 text-center font-mono text-slate-500">{f.row}</td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-800">{f.sku}</td>
                        <td className="py-2 px-3 text-rose-700">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 2: Preview Results */}
          {!commitResult && summary && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                2. Kết quả đối chiếu trước khi lưu
              </div>

              {/* Tabs / Filter Pills */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    activeTab === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  Tất cả ({summary.total})
                </button>
                <button
                  onClick={() => setActiveTab('valid')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    activeTab === 'valid'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white border-emerald-200 text-emerald-700'
                  }`}
                >
                  Hợp lệ ({summary.valid})
                </button>
                {summary.notFound > 0 && (
                  <button
                    onClick={() => setActiveTab('notFound')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      activeTab === 'notFound'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white border-rose-200 text-rose-700'
                    }`}
                  >
                    Mã không tìm thấy ({summary.notFound})
                  </button>
                )}
                {summary.duplicateSku > 0 && (
                  <button
                    onClick={() => setActiveTab('duplicateSku')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      activeTab === 'duplicateSku'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white border-amber-200 text-amber-700'
                    }`}
                  >
                    Trùng mã file ({summary.duplicateSku})
                  </button>
                )}
                {summary.invalidData > 0 && (
                  <button
                    onClick={() => setActiveTab('invalidData')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      activeTab === 'invalidData'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white border-purple-200 text-purple-700'
                    }`}
                  >
                    Dữ liệu sai ({summary.invalidData})
                  </button>
                )}
              </div>

              {/* Table preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center">Dòng</th>
                      <th className="py-2 px-3">Mã hàng</th>
                      <th className="py-2 px-3">Tên hàng</th>
                      <th className="py-2 px-3">Quy cách</th>
                      <th className="py-2 px-3 text-center">Tối thiểu</th>
                      <th className="py-2 px-3 text-center">Bước đặt</th>
                      <th className="py-2 px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPreview.slice(0, 100).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono">{row.row}</td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-800">{row.sku}</td>
                        <td className="py-2 px-3 truncate max-w-[150px]">{row.name || '—'}</td>
                        <td className="py-2 px-3">{row.packagingNote || <span className="text-slate-300">—</span>}</td>
                        <td className="py-2 px-3 text-center font-mono">{row.minOrderQty}</td>
                        <td className="py-2 px-3 text-center font-mono">+{row.orderStep}</td>
                        <td className="py-2 px-3">
                          {row.status === 'valid' ? (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <Check size={12} /> Hợp lệ
                            </span>
                          ) : (
                            <span className="text-rose-600 font-medium" title={row.reason}>
                              {row.reason || row.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredPreview.length > 100 && (
                <p className="text-[11px] text-slate-400 italic">Đang hiển thị 100 dòng đầu tiên trong nhóm này.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 shrink-0">
          <button
            onClick={commitResult ? () => onDone(commitResult) : onClose}
            disabled={applying}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
          >
            {commitResult ? 'Đóng và hoàn tất' : 'Đóng'}
          </button>

          {commitResult ? (
            <button
              onClick={() => onDone(commitResult)}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 shadow-xs"
            >
              Xác nhận và cập nhật danh sách
            </button>
          ) : (
            summary && summary.valid > 0 && (
              <button
                onClick={runCommit}
                disabled={applying || checking}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shadow-xs"
              >
                {applying ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {applying ? 'Đang cập nhật...' : `Xác nhận lưu ${summary.valid} mã hợp lệ`}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Component: Modal Nhập Kho & Bảng Giá Cũ
// -------------------------------------------------------------
function ImportInventoryModal({
  apiBase,
  token,
  onClose,
  onDone,
}: {
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
  const [error, setError] = useState('');

  const run = async (apply: boolean) => {
    if (!file) return;
    setError('');
    apply ? setApplying(true) : setChecking(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (apply) form.append('apply', '1');
      const res = await fetch(`${apiBase}/api/admin/products/import-inventory`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSummary(data.summary);
      if (apply) onDone();
    } catch (err: any) {
      setError(err.message || 'Lỗi nhập kho');
    } finally {
      apply ? setApplying(false) : setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800 text-lg">Nhập kho từ Excel</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={20} />
          </button>
        </div>
        {error && <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm"
        />
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Hủy</button>
          {!summary ? (
            <button
              onClick={() => run(false)}
              disabled={!file || checking}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 disabled:opacity-50"
            >
              {checking ? 'Đang kiểm tra...' : 'Xem trước'}
            </button>
          ) : (
            <button
              onClick={() => run(true)}
              disabled={applying}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {applying ? 'Đang nhập...' : `Xác nhận nhập ${summary.ok} mã`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportPricebookModal({
  apiBase,
  token,
  onClose,
  onDone,
}: {
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
  const [error, setError] = useState('');

  const run = async (apply: boolean) => {
    if (!file) return;
    setError('');
    apply ? setApplying(true) : setChecking(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (apply) form.append('apply', '1');
      const res = await fetch(`${apiBase}/api/admin/products/import-pricebook`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSummary(data.summary);
      if (apply) onDone();
    } catch (err: any) {
      setError(err.message || 'Lỗi nhập bảng giá');
    } finally {
      apply ? setApplying(false) : setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800 text-lg">Nhập bảng giá từ Excel</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={20} />
          </button>
        </div>
        {error && <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg">{error}</div>}
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm"
        />
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Hủy</button>
          {!summary ? (
            <button
              onClick={() => run(false)}
              disabled={!file || checking}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 disabled:opacity-50"
            >
              {checking ? 'Đang kiểm tra...' : 'Xem trước'}
            </button>
          ) : (
            <button
              onClick={() => run(true)}
              disabled={applying}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {applying ? 'Đang nhập...' : `Xác nhận nhập ${summary.ok} giá`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
