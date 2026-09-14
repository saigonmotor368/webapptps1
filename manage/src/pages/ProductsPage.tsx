import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Search, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, Plus, ChevronRight as Arrow, Upload, Download, X, CheckCircle2 } from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

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
}

// Trang "Hàng hóa" (Giai đoạn B) — danh sách tìm/lọc; bấm vào 1 sản phẩm mở
// trang chi tiết (/hang-hoa/:id) để sửa TOÀN BỘ thông tin (ảnh, mô tả, giá
// theo hạng, tồn kho...). Chỉ admin/thu_mua sửa được, role khác chỉ xem.
export default function ProductsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [categories, setCategories] = useState<string[]>([]);
  const [canEdit, setCanEdit] = useState(false);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 40;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showPricebookImport, setShowPricebookImport] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/api/admin/products?meta=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { if (data.ok) setCategories(data.categories || []); });
  }, [token, apiBase]);

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      if (lowStockOnly) params.set('lowStockOnly', '1');
      const res = await fetch(`${apiBase}/api/admin/products?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setProducts(data.products || []);
        setTotal(data.total || 0);
        setCanEdit(!!data.canEdit);
      }
    } finally {
      setLoading(false);
    }
  }, [token, apiBase, page, search, category, lowStockOnly]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hàng hóa</h1>
          <p className="text-slate-500 text-sm">{total} mã hàng {!canEdit && '· chỉ xem (cần quyền Admin/Thu mua để sửa)'}</p>
        </div>
        <div className="flex gap-2 self-start flex-wrap">
          {canEdit && (
            <>
              <button onClick={() => setShowImport(true)}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5">
                <Upload size={16} /> Nhập kho từ Excel
              </button>
              <button onClick={() => setShowPricebookImport(true)}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5">
                <Upload size={16} /> Nhập bảng giá từ Excel
              </button>
              <button onClick={() => navigate('/hang-hoa/moi')}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5">
                <Plus size={16} /> Thêm sản phẩm
              </button>
            </>
          )}
          <button onClick={fetchProducts} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" title="Tải lại">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {showImport && (
        <ImportInventoryModal
          apiBase={apiBase}
          token={token}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); fetchProducts(); }}
        />
      )}

      {showPricebookImport && (
        <ImportPricebookModal
          apiBase={apiBase}
          token={token}
          onClose={() => setShowPricebookImport(false)}
          onDone={() => { setShowPricebookImport(false); fetchProducts(); }}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Tìm theo tên, mã hàng..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
          />
        </div>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20"
        >
          <option value="">Tất cả nhóm hàng</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => { setLowStockOnly(e.target.checked); setPage(0); }} />
          Sắp hết hàng
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải...
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400">Không tìm thấy mã hàng nào</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
          {products.map((p) => {
            const base = Number(p.price_retail) || Number(p.price_wholesale) || 0;
            return (
              <button key={p.id} onClick={() => navigate(`/hang-hoa/${p.id}`)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.sku || '—'} · {p.category || 'Chưa phân loại'} · {p.unit || 'Kg'}</p>
                </div>
                {p.track_inventory ? (
                  <div className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${p.is_low_stock ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>
                    {p.is_low_stock && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                    Tồn {p.stock_qty ?? 0}
                  </div>
                ) : (
                  <div className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-600 shrink-0">Theo ngày</div>
                )}
                <div className="text-right shrink-0 w-24">
                  <p className="font-semibold text-slate-700 text-sm">{money(base)}</p>
                </div>
                <Arrow size={16} className="text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="p-2 border border-slate-200 rounded-lg disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="text-sm text-slate-500">Trang {page + 1}/{totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="p-2 border border-slate-200 rounded-lg disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

const PROBLEM_LABELS: Record<string, string> = {
  not_found: 'Không tìm thấy mã hàng',
  not_tracked: 'Mã hàng không theo dõi tồn kho (hàng tươi sống)',
  invalid_quantity: 'Số lượng không hợp lệ',
};

interface ImportSummary {
  total: number; ok: number; notFound: number; notTracked: number; invalidQuantity: number;
}
interface ImportProblem {
  row: number; sku: string; quantity: number; status: string; productName?: string;
}

// Modal "Nhập kho từ Excel" — 2 bước: xem trước (không ghi gì) rồi mới xác
// nhận ghi thật, giống nguyên tắc dry-run của script đồng bộ catalog, để
// tránh nhập nhầm hàng loạt vào inventory_transactions.
function ImportInventoryModal({ apiBase, token, onClose, onDone }: { apiBase: string; token: string | null; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [error, setError] = useState('');

  const runImport = async (apply: boolean) => {
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
      setProblems(data.problems || []);
      if (apply) {
        alert(`✅ Đã nhập kho ${data.summary.ok} mã hàng`);
        onDone();
      }
    } catch (err: any) {
      setError(err.message || 'Không xử lý được file');
    } finally {
      apply ? setApplying(false) : setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Nhập kho từ Excel</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <a href={`${apiBase}/api/admin/products/import-inventory`} target="_blank" rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            fetch(`${apiBase}/api/admin/products/import-inventory`, { headers: { Authorization: `Bearer ${token}` } })
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'mau-nhap-kho.xlsx'; a.click();
                URL.revokeObjectURL(url);
              });
          }}
          className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium">
          <Download size={14} /> Tải file mẫu
        </a>

        <div>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setSummary(null); setProblems([]); setError(''); }}
            className="text-sm w-full border border-slate-200 rounded-lg px-3 py-2" />
        </div>

        {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

        {summary && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2.5 bg-green-50 rounded-lg text-green-700 flex items-center gap-2">
                <CheckCircle2 size={16} /> Hợp lệ: <b>{summary.ok}</b>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-slate-600">Tổng dòng: <b>{summary.total}</b></div>
              {summary.notFound > 0 && <div className="p-2.5 bg-red-50 rounded-lg text-red-600">Không tìm thấy: <b>{summary.notFound}</b></div>}
              {summary.notTracked > 0 && <div className="p-2.5 bg-amber-50 rounded-lg text-amber-700">Hàng theo ngày: <b>{summary.notTracked}</b></div>}
              {summary.invalidQuantity > 0 && <div className="p-2.5 bg-red-50 rounded-lg text-red-600">SL không hợp lệ: <b>{summary.invalidQuantity}</b></div>}
            </div>
            {problems.length > 0 && (
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto text-xs">
                {problems.map((p, i) => (
                  <div key={i} className="px-2.5 py-1.5 border-b border-slate-50 last:border-0 flex justify-between gap-2">
                    <span>Dòng {p.row}: {p.sku} {p.productName ? `(${p.productName})` : ''}</span>
                    <span className="text-slate-400 shrink-0">{PROBLEM_LABELS[p.status] || p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Đóng</button>
          {!summary ? (
            <button onClick={() => runImport(false)} disabled={!file || checking}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
              {checking ? 'Đang kiểm tra...' : 'Xem trước'}
            </button>
          ) : (
            <button onClick={() => runImport(true)} disabled={applying || summary.ok === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {applying ? 'Đang ghi...' : `Xác nhận nhập ${summary.ok} mã`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PricebookSummary {
  total: number; ok: number; notFound: number; noChanges: number; tierPriceUpdates: number; productFieldUpdates: number;
}
interface PricebookProblem {
  row: number; sku: string; status: string; productName?: string;
}
const PRICEBOOK_PROBLEM_LABELS: Record<string, string> = {
  not_found: 'Không tìm thấy mã hàng',
  no_changes: 'Không có cột nào có giá trị để cập nhật',
};

// Modal "Nhập bảng giá từ Excel" (mục 14.2-3 KE_HOACH) — khớp file thật
// MauFileBangGia.xlsx của KiotViet: Mã hàng + Giá vốn + Giá nhập cuối + N cột
// giá theo hạng khách. Có tùy chọn "% từ giá vốn" thay vì gõ số tiền tay,
// đúng yêu cầu gốc trong brief. Cùng nguyên tắc dry-run trước khi ghi thật.
function ImportPricebookModal({ apiBase, token, onClose, onDone }: { apiBase: string; token: string | null; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'amount' | 'markup_percent'>('amount');
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<PricebookSummary | null>(null);
  const [problems, setProblems] = useState<PricebookProblem[]>([]);
  const [error, setError] = useState('');

  const runImport = async (apply: boolean) => {
    if (!file) return;
    setError('');
    apply ? setApplying(true) : setChecking(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);
      if (apply) form.append('apply', '1');
      const res = await fetch(`${apiBase}/api/admin/products/import-pricebook`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSummary(data.summary);
      setProblems(data.problems || []);
      if (apply) {
        alert(`✅ Đã cập nhật bảng giá cho ${data.summary.ok} mã hàng`);
        onDone();
      }
    } catch (err: any) {
      setError(err.message || 'Không xử lý được file');
    } finally {
      apply ? setApplying(false) : setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Nhập bảng giá từ Excel</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <a href={`${apiBase}/api/admin/products/import-pricebook`} target="_blank" rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            fetch(`${apiBase}/api/admin/products/import-pricebook`, { headers: { Authorization: `Bearer ${token}` } })
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'mau-bang-gia.xlsx'; a.click();
                URL.revokeObjectURL(url);
              });
          }}
          className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium">
          <Download size={14} /> Tải file mẫu
        </a>

        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Cách tính giá từ các cột "Giá VIPx"</p>
          <div className="flex gap-2">
            <label className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer ${mode === 'amount' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
              <input type="radio" checked={mode === 'amount'} onChange={() => setMode('amount')} /> Số tiền trực tiếp
            </label>
            <label className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer ${mode === 'markup_percent' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
              <input type="radio" checked={mode === 'markup_percent'} onChange={() => setMode('markup_percent')} /> % cộng thêm từ giá vốn
            </label>
          </div>
        </div>

        <div>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setSummary(null); setProblems([]); setError(''); }}
            className="text-sm w-full border border-slate-200 rounded-lg px-3 py-2" />
        </div>

        {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

        {summary && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2.5 bg-green-50 rounded-lg text-green-700 flex items-center gap-2">
                <CheckCircle2 size={16} /> Hợp lệ: <b>{summary.ok}</b>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-slate-600">Tổng dòng: <b>{summary.total}</b></div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-slate-600">Giá theo hạng sẽ cập nhật: <b>{summary.tierPriceUpdates}</b></div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-slate-600">Giá vốn/nhập cuối sẽ cập nhật: <b>{summary.productFieldUpdates}</b></div>
              {summary.notFound > 0 && <div className="p-2.5 bg-red-50 rounded-lg text-red-600">Không tìm thấy: <b>{summary.notFound}</b></div>}
              {summary.noChanges > 0 && <div className="p-2.5 bg-amber-50 rounded-lg text-amber-700">Không có gì thay đổi: <b>{summary.noChanges}</b></div>}
            </div>
            {problems.length > 0 && (
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto text-xs">
                {problems.map((p, i) => (
                  <div key={i} className="px-2.5 py-1.5 border-b border-slate-50 last:border-0 flex justify-between gap-2">
                    <span>Dòng {p.row}: {p.sku} {p.productName ? `(${p.productName})` : ''}</span>
                    <span className="text-slate-400 shrink-0">{PRICEBOOK_PROBLEM_LABELS[p.status] || p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Đóng</button>
          {!summary ? (
            <button onClick={() => runImport(false)} disabled={!file || checking}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
              {checking ? 'Đang kiểm tra...' : 'Xem trước'}
            </button>
          ) : (
            <button onClick={() => runImport(true)} disabled={applying || summary.ok === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {applying ? 'Đang ghi...' : `Xác nhận cập nhật ${summary.ok} mã`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
