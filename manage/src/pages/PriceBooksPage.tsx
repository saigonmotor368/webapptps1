import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { can } from '../lib/permissions';
import {
  FileSpreadsheet, Upload, CheckCircle2, AlertCircle,
  Eye, Save, RefreshCw, Plus, Check, X,
  ChevronLeft, ChevronRight, SlidersHorizontal, ArrowLeft
} from 'lucide-react';

function money(v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v))) + ' đ';
}

interface PriceBook {
  id: string;
  code: string;
  name: string;
  kind: 'general' | 'customer' | 'group' | 'department';
  status: 'draft' | 'pending_approval' | 'active' | 'expired' | 'archived';
  version: number;
  valid_from?: string | null;
  valid_to?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  approved_by?: string | null;
}

interface GridProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  cost_price: number | null;
  last_import_price: number | null;
  price_retail: number | null;
  min_order_qty: number;
  order_step: number;
  packaging_note: string;
  is_active: boolean;
  prices: Record<string, number | null>;
  priceDetails: Record<string, any>;
}

export default function PriceBooksPage() {
  const fileInputId = useId();
  const { token, user } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const canEditPricing = can(user?.role, 'pricing.edit');

  // Navigation tab: 'grid' (Thiết lập giá) | 'list' (Danh sách bảng giá) | 'import' (Nhập từ Excel)
  const [activeTab, setActiveTab] = useState<'grid' | 'list' | 'import'>('grid');

  // ─── GRID (THIẾT LẬP GIÁ) STATE ────────────────────────────────────
  const [gridProducts, setGridProducts] = useState<GridProduct[]>([]);
  const [displayedBooks, setDisplayedBooks] = useState<PriceBook[]>([]);
  const [allPriceBooks, setAllPriceBooks] = useState<PriceBook[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);

  // Filters & Search
  const [skuSearch, setSkuSearch] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [customerGroupFilter, setCustomerGroupFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [customerGroups, setCustomerGroups] = useState<string[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Column picker popover
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [pendingBookIds, setPendingBookIds] = useState<string[]>([]);
  const [priceBookSearch, setPriceBookSearch] = useState('');
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Inline cell editing: { productId, priceBookId, currentVal, isNew }
  const [editingCell, setEditingCell] = useState<{ productId: string; priceBookId: string; value: string } | null>(null);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; text: string; action?: { label: string; onClick: () => void } } | null>(null);

  // ─── MODAL TẠO BẢNG GIÁ MỚI ────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingBook, setCreatingBook] = useState(false);
  const [newBookForm, setNewBookForm] = useState({
    name: '',
    code: '',
    kind: 'customer',
    sourcePriceBookId: '',
  });

  // ─── IMPORT WIZARD STATE ───────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<any>(null);
  const [detectedMappings, setDetectedMappings] = useState<Record<string, any>>({});
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [mappingConfig, setMappingConfig] = useState<any>(null);
  const [allowZeroPrice, setAllowZeroPrice] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewChangeFilter, setPreviewChangeFilter] = useState<'all' | 'changed' | 'increase' | 'decrease' | 'errors'>('all');
  const [committing, setCommitting] = useState(false);
  const validOnly = true;
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Click outside to close column picker
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load distinct categories for filter
  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/api/admin/products?meta=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.ok && d.categories) setCategories(d.categories); })
      .catch(() => {});
  }, [apiBase, token]);

  // ─── FETCH GRID DATA ───────────────────────────────────────────────
  const fetchGridData = useCallback(async () => {
    setLoadingGrid(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (skuSearch.trim()) params.set('sku', skuSearch.trim());
      if (nameSearch.trim()) params.set('name', nameSearch.trim());
      if (categoryFilter) params.set('category', categoryFilter);
      if (customerGroupFilter) params.set('groupName', customerGroupFilter);
      if (customerFilter) params.set('customerId', customerFilter);

      // Selected price books
      if (selectedBookIds.length > 0) params.set('priceBookIds', selectedBookIds.join(','));

      const res = await fetch(`${apiBase}/api/admin/price-books/grid?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.ok && data.data) {
        setGridProducts(data.data.products || []);
        setDisplayedBooks(data.data.priceBooks || []);
        setAllPriceBooks(data.data.allPriceBooks || []);
        setCustomerGroups(data.data.customerGroups || []);
        setCustomers(data.data.customers || []);
        setTotalProducts(data.data.pagination?.total || 0);
        setTotalPages(data.data.pagination?.totalPages || 1);

        // Initialize selectedBookIds if empty
        if (selectedBookIds.length === 0 && data.data.priceBooks?.length > 0) {
          setSelectedBookIds(data.data.priceBooks.map((b: any) => b.id));
        }
      } else {
        setToast({ type: 'error', text: data.error || 'Không tải được dữ liệu bảng giá' });
      }
    } catch {
      setToast({ type: 'error', text: 'Lỗi kết nối máy chủ thiết lập giá' });
    } finally {
      setLoadingGrid(false);
    }
  }, [apiBase, token, page, pageSize, skuSearch, nameSearch, categoryFilter, customerGroupFilter, customerFilter, selectedBookIds]);

  useEffect(() => {
    if (activeTab === 'grid') {
      fetchGridData();
    }
  }, [activeTab, fetchGridData]);

  // ─── INLINE PRICE UPDATE & ADD ─────────────────────────────────────
  const handleSavePriceCell = async (productId: string, priceBookId: string, rawVal: string) => {
    const book = allPriceBooks.find((b) => b.id === priceBookId) || displayedBooks.find((b) => b.id === priceBookId);
    const priceNum = Math.round(Number(rawVal.replace(/[^0-9]/g, '')));

    if (isNaN(priceNum) || priceNum < 0) {
      setToast({ type: 'error', text: 'Vui lòng nhập đơn giá hợp lệ (>= 0đ)' });
      return;
    }

    const cellKey = `${productId}_${priceBookId}`;
    setSavingCellKey(cellKey);

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/${priceBookId}/items`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
          price: priceNum,
          reason: 'Cập nhật trực tiếp trên màn hình Thiết lập giá',
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Active price book conflict: need to create draft
        setToast({
          type: 'warning',
          text: `Bảng giá "${book?.name}" đang áp dụng. Hãy tạo bản nháp mới để sửa an toàn.`,
          action: {
            label: 'Tạo bản nháp mới',
            onClick: () => handleCreateDraftFromActive(priceBookId),
          },
        });
        setEditingCell(null);
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không lưu được đơn giá');
      }

      // Update local state immediately for fast feedback
      setGridProducts((prev) =>
        prev.map((p) => {
          if (p.id !== productId) return p;
          return {
            ...p,
            prices: { ...p.prices, [priceBookId]: priceNum },
          };
        })
      );

      setToast({ type: 'success', text: `Đã lưu giá ${money(priceNum)} cho bảng giá "${book?.name}"` });
      setEditingCell(null);
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Lỗi khi lưu đơn giá' });
    } finally {
      setSavingCellKey(null);
    }
  };

  // ─── CREATE DRAFT FROM ACTIVE PRICE BOOK ───────────────────────────
  const handleCreateDraftFromActive = async (sourceBookId: string) => {
    try {
      setToast({ type: 'warning', text: 'Đang tạo bản nháp mới...' });
      const res = await fetch(`${apiBase}/api/admin/price-books/${sourceBookId}/create-draft`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không tạo được bản nháp');

      setToast({ type: 'success', text: `✅ ${data.message}! Bạn có thể chuyển sang bản nháp để sửa.` });
      // Refresh list
      fetchGridData();
    } catch (err: any) {
      setToast({ type: 'error', text: err.message });
    }
  };

  // ─── CREATE NEW PRICE BOOK ─────────────────────────────────────────
  const handleCreatePriceBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookForm.name.trim()) {
      alert('Vui lòng nhập tên bảng giá');
      return;
    }

    setCreatingBook(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/price-books`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newBookForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Lỗi tạo bảng giá');

      setToast({ type: 'success', text: `✅ Đã tạo thành công bảng giá: ${data.data.name}` });
      setShowCreateModal(false);
      setNewBookForm({ name: '', code: '', kind: 'customer', sourcePriceBookId: '' });

      // Refresh and auto-select new book
      await fetchGridData();
      if (data.data?.id) {
        setSelectedBookIds((prev) => [...prev, data.data.id]);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreatingBook(false);
    }
  };

  // ─── IMPORT WIZARD HANDLERS ────────────────────────────────────────
  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setInspecting(true);
    setToast(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/import/inspect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không thể đọc file Excel');

      setInspection(data.inspection);
      setDetectedMappings(data.detectedMappings || {});
      const firstSheet = data.inspection.sheets[0]?.name || '';
      setSelectedSheet(firstSheet);
      setMappingConfig(data.detectedMappings[firstSheet] || null);
      setStep(2);
    } catch (err: any) {
      setToast({ type: 'error', text: err.message });
    } finally {
      setInspecting(false);
    }
  };

  const handleRunPreview = async (pageToPreview: number = 1) => {
    if (!file || !selectedSheet) return;
    setPreviewing(true);
    setToast(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', selectedSheet);
    formData.append('mappingConfig', JSON.stringify(mappingConfig));
    formData.append('page', String(pageToPreview));
    formData.append('pageSize', '50');
    formData.append('allowZeroPrice', String(allowZeroPrice));

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Lỗi kiểm tra bảng giá');

      setPreviewData(data.preview);
      setStep(3);
    } catch (err: any) {
      setToast({ type: 'error', text: err.message });
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!file || !selectedSheet || !mappingConfig) return;
    setCommitting(true);
    setToast(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', selectedSheet);
    formData.append('mappingConfig', JSON.stringify(mappingConfig));
    formData.append('validOnly', String(validOnly));
    formData.append('allowZeroPrice', String(allowZeroPrice));

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/import/commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Lỗi lưu bảng giá vào hệ thống');

      setStep(4);
      setToast({ type: 'success', text: data.message });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message });
    } finally {
      setCommitting(false);
    }
  };

  const handleActivate = async (priceBookId: string) => {
    if (!confirm('Bạn có chắc chắn muốn KÍCH HOẠT bảng giá này thành chính thức? Bảng giá cũ cùng nhóm sẽ được lưu trữ.')) {
      return;
    }

    setActivatingId(priceBookId);
    setToast(null);

    try {
      const res = await fetch(`${apiBase}/api/admin/price-books/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceBookId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Lỗi kích hoạt bảng giá');

      setToast({ type: 'success', text: data.message });
      fetchGridData();
    } catch (err: any) {
      setToast({ type: 'error', text: err.message });
    } finally {
      setActivatingId(null);
    }
  };

  const generalBookId = allPriceBooks.find((b) => b.kind === 'general' && b.status === 'active')?.id
    || allPriceBooks.find((b) => b.kind === 'general')?.id;

  const openBookPicker = () => {
    setPendingBookIds(selectedBookIds.length ? selectedBookIds : (generalBookId ? [generalBookId] : []));
    setPriceBookSearch('');
    setShowColumnPicker(true);
  };

  // Chỉ cập nhật lựa chọn tạm; dữ liệu được tải khi người dùng bấm Áp dụng.
  const toggleBookColumn = (bookId: string) => {
    setPendingBookIds((prev) => {
      if (prev.includes(bookId)) {
        if (bookId === generalBookId) return prev;
        return prev.filter((id) => id !== bookId);
      } else {
        return [...prev, bookId];
      }
    });
  };

  const applyBookColumns = () => {
    const next = Array.from(new Set([generalBookId, ...pendingBookIds].filter(Boolean) as string[]));
    setSelectedBookIds(next);
    setPage(1);
    setShowColumnPicker(false);
  };

  return (
    <div className="space-y-5">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-md border animate-in fade-in slide-in-from-top-2 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : toast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {toast.type === 'success' ? (
              <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
            ) : (
              <AlertCircle className="text-amber-600 shrink-0" size={20} />
            )}
            <span className="text-sm font-semibold">{toast.text}</span>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="ml-3 px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 shadow-sm"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button onClick={() => setToast(null)} className="p-1 hover:bg-black/5 rounded-lg text-slate-400">
            <X size={16} />
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-inner">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Thiết lập giá</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  {allPriceBooks.length} bảng giá
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Quản lý và áp dụng giá bán theo từng bảng giá, nhóm bếp và khách hàng
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls & Main Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <button
              onClick={() => setActiveTab('grid')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'grid' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Thiết lập giá
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'list' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Danh sách bảng giá
            </button>
            <button
              onClick={() => { setActiveTab('import'); setStep(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'import' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nhập từ Excel
            </button>
          </div>

          {canEditPricing && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Plus size={16} /> Thêm bảng giá
            </button>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* TAB 1: THIẾT LẬP GIÁ (KIOTVIET GRID)                               */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {activeTab === 'grid' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2.5 flex-1">
              <input
                type="text"
                placeholder="Tìm mã hàng..."
                value={skuSearch}
                onChange={(e) => { setSkuSearch(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Tìm tên hàng..."
                value={nameSearch}
                onChange={(e) => { setNameSearch(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Tất cả nhóm hàng</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="relative" ref={columnPickerRef}>
                <button
                  type="button"
                  onClick={() => showColumnPicker ? setShowColumnPicker(false) : openBookPicker()}
                  className="w-full h-full min-h-9 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 hover:border-emerald-400 focus:outline-none focus:border-emerald-500 flex items-center justify-between gap-2"
                >
                  <span className="truncate font-medium">
                    {selectedBookIds.length > 1
                      ? `${selectedBookIds.length} bảng giá đã chọn`
                      : (allPriceBooks.find((b) => b.id === selectedBookIds[0])?.name || 'Bảng giá chung')}
                  </span>
                  <SlidersHorizontal size={14} className="shrink-0 text-slate-400" />
                </button>

                {showColumnPicker && (
                  <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <span className="text-sm font-extrabold text-slate-800">Bảng giá</span>
                      {canEditPricing && (
                        <button
                          type="button"
                          onClick={() => { setShowColumnPicker(false); setShowCreateModal(true); }}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                        >
                          <Plus size={14} /> Tạo mới
                        </button>
                      )}
                    </div>
                    <div className="p-3 border-b border-slate-100">
                      <input
                        autoFocus
                        value={priceBookSearch}
                        onChange={(e) => setPriceBookSearch(e.target.value)}
                        placeholder="Tìm bảng giá..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="max-h-72 overflow-y-auto p-2">
                      {allPriceBooks
                        .filter((b) => `${b.name} ${b.code}`.toLocaleLowerCase('vi').includes(priceBookSearch.trim().toLocaleLowerCase('vi')))
                        .map((b) => {
                          const checked = pendingBookIds.includes(b.id);
                          const isGeneral = b.id === generalBookId;
                          return (
                            <label key={b.id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                              <span className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isGeneral}
                                  onChange={() => toggleBookColumn(b.id)}
                                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-70"
                                />
                                <span className="text-xs font-semibold text-slate-800 truncate">{b.name}</span>
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${b.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {b.status === 'active' ? 'Đang áp dụng' : 'Bản nháp'}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3 border-t border-slate-100 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setPendingBookIds(generalBookId ? [generalBookId] : [])}
                        className="px-2 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
                      >
                        Bỏ chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={applyBookColumns}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                      >
                        Áp dụng ({pendingBookIds.length})
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <select
                value={customerGroupFilter}
                onChange={(e) => { setCustomerGroupFilter(e.target.value); setCustomerFilter(''); setSelectedBookIds([]); setPage(1); }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Tất cả nhóm bếp</option>
                {customerGroups.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
              <select
                value={customerFilter}
                onChange={(e) => { setCustomerFilter(e.target.value); setSelectedBookIds([]); setPage(1); }}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Tất cả khách hàng</option>
                {customers.filter((c) => !customerGroupFilter || c.customer_group === customerGroupFilter).map((c) => (
                  <option key={c.id} value={c.id}>{c.partner_code} · {c.company || c.name}</option>
                ))}
              </select>
            </div>

            {/* Tải lại dữ liệu */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchGridData()}
                disabled={loadingGrid}
                className="p-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                title="Tải lại dữ liệu"
              >
                <RefreshCw size={16} className={loadingGrid ? 'animate-spin' : ''} />
              </button>

            </div>
          </div>

          {/* TABLE CONTAINER */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200/80 sticky top-0 z-10 text-slate-600 font-bold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5 w-28 bg-slate-50">Mã hàng</th>
                    <th className="px-4 py-3.5 min-w-64 bg-slate-50">Tên hàng</th>
                    <th className="px-3 py-3.5 w-16 bg-slate-50 text-center">ĐVT</th>
                    <th className="px-4 py-3.5 w-32 bg-slate-50 text-right text-slate-500">Giá vốn</th>
                    <th className="px-4 py-3.5 w-32 bg-slate-50 text-right text-slate-500">Giá nhập cuối</th>
                    {displayedBooks.map((b) => (
                      <th key={b.id} className="px-4 py-3.5 text-right min-w-36 bg-slate-50">
                        <div className="flex flex-col items-end">
                          <span className="text-slate-800 font-extrabold">{b.name}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold mt-0.5 ${
                              b.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {b.status === 'active' ? 'Đang áp dụng' : 'Bản nháp'}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {loadingGrid ? (
                    <tr>
                      <td colSpan={5 + displayedBooks.length} className="text-center py-20 text-slate-400">
                        <RefreshCw className="animate-spin inline-block mr-2" size={18} /> Đang tải bảng giá hàng hóa...
                      </td>
                    </tr>
                  ) : gridProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5 + displayedBooks.length} className="text-center py-20 text-slate-400">
                        Không tìm thấy mặt hàng nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    gridProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-emerald-50/20 transition-colors">
                        {/* Mã hàng */}
                        <td className="px-4 py-3 font-mono font-bold text-slate-700">{p.sku || '—'}</td>

                        {/* Tên hàng */}
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div>{p.name}</div>
                          {(p.packaging_note || (p.min_order_qty && p.min_order_qty > 1)) && (
                            <div className="text-[10px] text-slate-400 mt-0.5 font-normal">
                              {p.packaging_note ? `Quy cách: ${p.packaging_note}` : ''}
                              {p.min_order_qty && p.min_order_qty > 1 ? ` · Tối thiểu: ${p.min_order_qty}` : ''}
                            </div>
                          )}
                        </td>

                        {/* ĐVT */}
                        <td className="px-3 py-3 text-center text-slate-500 font-medium">{p.unit || '—'}</td>

                        {/* Giá vốn (chỉ xem) */}
                        <td className="px-4 py-3 text-right font-medium text-slate-500">
                          {money(p.cost_price)}
                        </td>

                        {/* Giá nhập cuối (chỉ xem) */}
                        <td className="px-4 py-3 text-right font-medium text-slate-500">
                          {money(p.last_import_price)}
                        </td>

                        {/* Các cột Bảng giá */}
                        {displayedBooks.map((b) => {
                          const hasPrice = p.prices[b.id] != null;
                          const currentVal = p.prices[b.id];
                          const isEditing = editingCell?.productId === p.id && editingCell?.priceBookId === b.id;
                          const isSaving = savingCellKey === `${p.id}_${b.id}`;

                          return (
                            <td key={b.id} className="px-4 py-2.5 text-right font-semibold">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="500"
                                    autoFocus
                                    disabled={isSaving}
                                    value={editingCell.value}
                                    onChange={(e) =>
                                      setEditingCell({ ...editingCell, value: e.target.value })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSavePriceCell(p.id, b.id, editingCell.value);
                                      } else if (e.key === 'Escape') {
                                        setEditingCell(null);
                                      }
                                    }}
                                    className="w-28 border border-emerald-500 rounded-lg px-2 py-1 text-right text-xs font-bold text-emerald-800 bg-emerald-50/50 focus:outline-none"
                                    placeholder="Nhập giá..."
                                  />
                                  <button
                                    onClick={() => handleSavePriceCell(p.id, b.id, editingCell.value)}
                                    disabled={isSaving}
                                    className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                    title="Lưu (Enter)"
                                  >
                                    <Check size={13} />
                                  </button>
                                  <button
                                    onClick={() => setEditingCell(null)}
                                    disabled={isSaving}
                                    className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
                                    title="Hủy (Esc)"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ) : hasPrice ? (
                                <div
                                  onClick={() => {
                                    if (canEditPricing) {
                                      setEditingCell({
                                        productId: p.id,
                                        priceBookId: b.id,
                                        value: String(currentVal),
                                      });
                                    }
                                  }}
                                  className={`inline-block px-2.5 py-1 rounded-lg text-emerald-800 font-bold transition-all ${
                                    canEditPricing
                                      ? 'cursor-pointer hover:bg-emerald-100 hover:ring-1 hover:ring-emerald-400'
                                      : ''
                                  }`}
                                  title={canEditPricing ? 'Bấm để chỉnh giá' : undefined}
                                >
                                  {money(currentVal)}
                                </div>
                              ) : (
                                <div className="flex justify-end">
                                  {canEditPricing ? (
                                    <button
                                      onClick={() =>
                                        setEditingCell({
                                          productId: p.id,
                                          priceBookId: b.id,
                                          value: '',
                                        })
                                      }
                                      className="w-7 h-7 rounded-full bg-slate-100 hover:bg-emerald-100 text-slate-400 hover:text-emerald-700 flex items-center justify-center font-bold text-sm cursor-pointer transition-colors shadow-sm"
                                      title="Thêm giá cho mặt hàng này"
                                    >
                                      +
                                    </button>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Hiển thị</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                >
                  <option value={10}>10 dòng</option>
                  <option value={20}>20 dòng</option>
                  <option value={50}>50 dòng</option>
                  <option value={100}>100 dòng</option>
                </select>
                <span>mỗi trang · Tổng số: <b>{new Intl.NumberFormat('vi-VN').format(totalProducts)}</b> hàng hóa</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loadingGrid}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 font-semibold"
                >
                  <ChevronLeft size={14} /> Trước
                </button>
                <span className="px-3 py-1 font-bold text-slate-800">
                  Trang {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loadingGrid}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 font-semibold"
                >
                  Sau <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* TAB 2: DANH SÁCH BẢNG GIÁ                                          */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Danh sách các bảng giá trong hệ thống</h2>
            <button
              onClick={() => fetchGridData()}
              className="p-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[11px]">
                <tr>
                  <th className="px-4 py-3">Mã bảng giá</th>
                  <th className="px-4 py-3">Tên bảng giá</th>
                  <th className="px-4 py-3">Phân loại</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3">Phiên bản / thời gian</th>
                  <th className="px-4 py-3">Người cập nhật</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allPriceBooks.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{b.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{b.name}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-slate-600">
                        {b.kind === 'general' ? 'Bảng giá chung' : b.kind === 'customer' ? 'Khách hàng' : 'Nhóm khách'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          b.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.status === 'draft'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {b.status === 'active' ? 'Đang áp dụng' : b.status === 'draft' ? 'Bản nháp' : b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="font-bold text-slate-700">Phiên bản {b.version}</div>
                      <div className="text-[10px] mt-0.5">
                        {b.status === 'active'
                          ? `Áp dụng từ ${b.valid_from ? new Date(b.valid_from).toLocaleDateString('vi-VN') : 'chưa xác định'}`
                          : `Cập nhật ${new Date(b.updated_at || b.created_at || Date.now()).toLocaleString('vi-VN')}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.status === 'active' ? (b.approved_by || b.created_by || '—') : (b.created_by || '—')}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {b.status === 'active' && canEditPricing && (
                        <button
                          onClick={() => handleCreateDraftFromActive(b.id)}
                          className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold hover:bg-amber-100"
                        >
                          Tạo bản nháp mới
                        </button>
                      )}
                      {b.status === 'draft' && can(user?.role, 'pricing.edit') && (
                        <button
                          onClick={() => handleActivate(b.id)}
                          disabled={activatingId === b.id}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {activatingId === b.id ? 'Đang kích hoạt...' : 'Kích hoạt'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* TAB 3: NHẬP TỪ EXCEL (G4)                                          */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {activeTab === 'import' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Nhập bảng giá từ Excel</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kiểm tra đối chiếu theo SKU, hiển thị xem trước và lưu thành bản nháp an toàn
              </p>
            </div>
            <button
              onClick={() => setActiveTab('grid')}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl flex items-center gap-1"
            >
              <ArrowLeft size={14} /> Quay lại Thiết lập giá
            </button>
          </div>

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-4 hover:border-emerald-500 transition-colors">
              <input
                id={fileInputId}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                }}
              />
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <Upload size={28} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Chọn file Excel bảng giá để tải lên</p>
                <p className="text-xs text-slate-400 mt-1">Định dạng file .xlsx hoặc .xls (dung lượng tối đa 15MB)</p>
              </div>
              <label
                htmlFor={fileInputId}
                className="inline-block px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
              >
                {inspecting ? 'Đang đọc cấu trúc file...' : 'Chọn file Excel'}
              </label>
            </div>
          )}

          {/* Step 2: Mapping Configuration */}
          {step === 2 && inspection && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                <span>File: <b>{file?.name}</b> · {inspection.sheets?.length} trang tính</span>
                <button onClick={() => setStep(1)} className="text-emerald-700 font-bold hover:underline">
                  Đổi file khác
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn trang tính (Sheet)</label>
                <select
                  value={selectedSheet}
                  onChange={(e) => {
                    const sheet = e.target.value;
                    setSelectedSheet(sheet);
                    setMappingConfig(detectedMappings[sheet] || null);
                  }}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white focus:outline-none"
                >
                  {inspection.sheets?.map((s: any) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.rowCount} dòng)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="allowZero"
                  checked={allowZeroPrice}
                  onChange={(e) => setAllowZeroPrice(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <label htmlFor="allowZero" className="text-xs text-slate-700 cursor-pointer">
                  Chấp nhận sản phẩm có giá 0đ (báo giá tại chỗ sau)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => handleRunPreview(1)}
                  disabled={previewing}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  {previewing ? <RefreshCw className="animate-spin" size={14} /> : <Eye size={14} />}
                  Xem trước dữ liệu (Preview)
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 3 && previewData && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-lg font-black text-slate-800">{previewData.stats?.totalRows || 0}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Tổng dòng</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-lg font-black text-emerald-700">{previewData.stats?.validRows || 0}</div>
                  <div className="text-[10px] text-emerald-600 font-bold uppercase">Khớp SKU hợp lệ</div>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="text-lg font-black text-red-700">{previewData.comparison?.increased || 0}</div>
                  <div className="text-[10px] text-red-600 font-bold uppercase">Giá tăng</div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="text-lg font-black text-blue-700">{previewData.comparison?.decreased || 0}</div>
                  <div className="text-[10px] text-blue-600 font-bold uppercase">Giá giảm</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-lg font-black text-slate-700">{previewData.comparison?.unchanged || 0}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Không đổi</div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="text-lg font-black text-amber-700">{previewData.stats?.zeroPriceRows || 0}</div>
                  <div className="text-[10px] text-amber-600 font-bold uppercase">Giá bằng 0đ</div>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="text-lg font-black text-red-700">{previewData.stats?.unmatchedRows || 0}</div>
                  <div className="text-[10px] text-red-600 font-bold uppercase">SKU không khớp</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {([
                  ['all', 'Tất cả'], ['changed', 'Chỉ xem giá thay đổi'], ['increase', 'Giá tăng'],
                  ['decrease', 'Giá giảm'], ['errors', 'Dữ liệu cần kiểm tra'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreviewChangeFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${previewChangeFilter === value ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Rows Preview Table */}
              <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 sticky top-0 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">Dòng</th>
                      <th className="p-3">Mã SKU</th>
                      <th className="p-3">Tên sản phẩm</th>
                      <th className="p-3">Bảng giá</th>
                      <th className="p-3 text-right">Giá đang áp dụng</th>
                      <th className="p-3 text-right">Giá mới tải lên</th>
                      <th className="p-3 text-right">Chênh lệch</th>
                      <th className="p-3 text-center">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.rows?.flatMap((r: any) => previewData.priceBooks.map((pb: any) => ({ row: r, pb, price: r.prices?.[pb.key] })))
                      .filter(({ row, price }: any) => {
                        if (previewChangeFilter === 'changed') return ['increase', 'decrease', 'new'].includes(price?.comparisonStatus);
                        if (previewChangeFilter === 'increase') return price?.comparisonStatus === 'increase';
                        if (previewChangeFilter === 'decrease') return price?.comparisonStatus === 'decrease';
                        if (previewChangeFilter === 'errors') return !row.isValid || ['zero_price', 'invalid_price', 'invalid_format'].includes(price?.status);
                        return true;
                      })
                      .slice(0, 200)
                      .map(({ row: r, pb, price }: any) => {
                        const status = !r.isValid ? 'error' : price?.comparisonStatus;
                        const labels: Record<string, string> = { increase: 'Tăng', decrease: 'Giảm', unchanged: 'Không đổi', new: 'Giá mới', missing: 'Thiếu giá', error: 'Cần kiểm tra' };
                        return (
                          <tr key={`${r.rowIndex}-${pb.key}`} className={status === 'error' ? 'bg-red-50/40' : ''}>
                            <td className="p-3 font-mono text-slate-400">{r.rowIndex}</td>
                            <td className="p-3 font-mono font-bold text-slate-800">{r.rawSku || '—'}</td>
                            <td className="p-3 text-slate-700">{r.rawName || '—'}</td>
                            <td className="p-3 font-semibold text-slate-700">{pb.name}</td>
                            <td className="p-3 text-right text-slate-600">{money(price?.previousPrice)}</td>
                            <td className="p-3 text-right font-extrabold text-slate-900">{money(price?.finalPrice)}</td>
                            <td className={`p-3 text-right font-bold ${Number(price?.differenceAmount) > 0 ? 'text-red-600' : Number(price?.differenceAmount) < 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                              {price?.differenceAmount == null ? '—' : `${price.differenceAmount > 0 ? '+' : ''}${money(price.differenceAmount)}`}
                              {price?.differencePercent != null && <span className="block text-[10px]">{price.differencePercent > 0 ? '+' : ''}{price.differencePercent.toFixed(1)}%</span>}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${status === 'increase' || status === 'error' ? 'bg-red-100 text-red-700' : status === 'decrease' ? 'bg-blue-100 text-blue-700' : status === 'new' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                                {labels[status] || price?.status || '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleCommit}
                  disabled={committing}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  {committing ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                  Xác nhận lưu vào bản nháp
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-xl font-black text-slate-800">Đã lưu bảng giá vào bản nháp thành công!</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Bảng giá đã được nạp an toàn dưới dạng bản nháp (Draft). Bạn có thể quay lại màn Thiết lập giá để xem và tinh chỉnh trước khi duyệt kích hoạt.
              </p>
              <button
                onClick={() => { setActiveTab('grid'); setStep(1); fetchGridData(); }}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Về màn hình Thiết lập giá
              </button>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* MODAL: THÊM BẢNG GIÁ MỚI                                          */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Plus size={18} />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Thêm bảng giá mới</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePriceBook} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên bảng giá <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Bảng giá Bếp Cơ Quan, Bảng giá HPF..."
                  value={newBookForm.name}
                  onChange={(e) => setNewBookForm({ ...newBookForm, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã bảng giá (tùy chọn)</label>
                  <input
                    type="text"
                    placeholder="Tự sinh nếu để trống"
                    value={newBookForm.code}
                    onChange={(e) => setNewBookForm({ ...newBookForm, code: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phân loại áp dụng</label>
                  <select
                    value={newBookForm.kind}
                    onChange={(e) => setNewBookForm({ ...newBookForm, kind: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="customer">Khách hàng cụ thể</option>
                    <option value="group">Nhóm khách hàng / Bếp</option>
                    <option value="general">Bảng giá chung</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sao chép giá từ bảng giá nguồn (tùy chọn)
                </label>
                <select
                  value={newBookForm.sourcePriceBookId}
                  onChange={(e) => setNewBookForm({ ...newBookForm, sourcePriceBookId: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Không sao chép (tạo bảng giá trống)</option>
                  {allPriceBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.status === 'active' ? 'Đang áp dụng' : 'Bản nháp'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Nếu chọn bảng giá nguồn, toàn bộ danh mục sản phẩm và giá sẽ được sao chép sang bản nháp mới.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingBook}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {creatingBook ? 'Đang tạo...' : 'Tạo bản nháp mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
