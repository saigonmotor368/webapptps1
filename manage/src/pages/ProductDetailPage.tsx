import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Upload, RefreshCw, PackagePlus, PackageMinus, Wrench,
  ImageOff, CheckCircle2, AlertTriangle, X, Info, Check, Sliders
} from 'lucide-react';
import { getValidQuantityExamples } from '../lib/quantityRules';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ';
}

function dt(v: string) {
  return v ? new Date(v).toLocaleString('vi-VN') : '—';
}

const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Tên sản phẩm' },
  { key: 'category', label: 'Nhóm hàng' },
  { key: 'sub_category', label: 'Nhóm hàng phụ' },
  { key: 'unit', label: 'Đơn vị tính' },
  { key: 'supplier', label: 'Nhà cung cấp' },
  { key: 'origin', label: 'Xuất xứ' },
  { key: 'tags', label: 'Thẻ (phân cách bởi dấu phẩy)' },
];

export default function ProductDetailPage() {
  const { id } = useParams();
  const isNew = id === 'moi';
  const navigate = useNavigate();
  const { token } = useAuth();
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

  const [tiers, setTiers] = useState<{ code: string; name: string }[]>([]);
  const [product, setProduct] = useState<Record<string, any>>({
    name: '',
    unit: 'Kg',
    min_order_qty: 1,
    order_step: 1,
    enforce_order_step: false,
    packaging_note: '',
  });
  const [tierDrafts, setTierDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [invType, setInvType] = useState<'in' | 'out' | 'adjust'>('in');
  const [invQty, setInvQty] = useState('');
  const [invNote, setInvNote] = useState('');

  // Validation & Toast
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchMeta = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/admin/products?meta=1`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) setTiers(data.tiers || []);
    } catch (e) {
      console.warn('Lỗi fetch meta tiers:', e);
    }
  }, [apiBase, token]);

  const fetchProduct = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/products?productId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Không tìm thấy sản phẩm', 'error');
        navigate('/hang-hoa');
        return;
      }
      setProduct({
        ...data.product,
        min_order_qty: data.product.min_order_qty ?? 1,
        order_step: data.product.order_step ?? 1,
        enforce_order_step: Boolean(data.product.enforce_order_step),
        packaging_note: data.product.packaging_note || '',
      });
      setCanEdit(!!data.canEdit);
      setHistory(data.inventoryHistory || []);
      const drafts: Record<string, string> = {};
      const tierCodes = tiers.length ? tiers : [{ code: 'VIP0' }, { code: 'VIP1' }, { code: 'VIP2' }, { code: 'VIP3' }];
      for (const t of tierCodes) {
        drafts[t.code] = data.product.tierPrices?.[t.code] != null ? String(data.product.tierPrices[t.code]) : '';
      }
      setTierDrafts(drafts);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token, id, isNew, navigate, tiers]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchProduct(); }, [id]);
  useEffect(() => {
    if (isNew) setCanEdit(true);
  }, [isNew]);

  const setField = (key: string, value: any) => {
    setProduct((p) => ({ ...p, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Sinh ví dụ số lượng hợp lệ tự động
  const exampleValidQuantities = useMemo(() => {
    const min = Number(product.min_order_qty) || 1;
    const step = Number(product.order_step) || 1;
    return getValidQuantityExamples(min, step, product.unit || 'Kg');
  }, [product.min_order_qty, product.order_step, product.unit]);

  // Validation client theo mục 3.2
  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!product.name?.trim()) {
      errs.name = 'Vui lòng nhập tên sản phẩm';
    }

    // Quy cách đóng gói tối đa 120 ký tự
    if (product.packaging_note && String(product.packaging_note).trim().length > 120) {
      errs.packaging_note = 'Mô tả quy cách đóng gói tối đa 120 ký tự';
    }

    // Số lượng tối thiểu
    const min = Number(product.min_order_qty);
    if (!Number.isFinite(min) || min < 0) {
      errs.min_order_qty = 'Số lượng tối thiểu không được âm hoặc không hợp lệ';
    } else if (Math.round(min * 1000) !== min * 1000) {
      errs.min_order_qty = 'Tối đa 3 chữ số thập phân';
    }

    // Bước đặt hàng
    const step = Number(product.order_step);
    if (!Number.isFinite(step) || step < 0) {
      errs.order_step = 'Bước đặt hàng không được âm hoặc không hợp lệ';
    } else if (Math.round(step * 1000) !== step * 1000) {
      errs.order_step = 'Tối đa 3 chữ số thập phân';
    }

    // Khi bật kiểm tra quy cách: min > 0, step > 0
    if (product.enforce_order_step) {
      if (min <= 0) {
        errs.min_order_qty = 'Khi bật kiểm tra, số lượng tối thiểu phải lớn hơn 0';
      }
      if (step <= 0) {
        errs.order_step = 'Khi bật kiểm tra, bước đặt hàng phải lớn hơn 0';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: product.name,
          category: product.category,
          unit: product.unit || 'Kg',
          priceRetail: product.price_retail,
          priceWholesale: product.price_wholesale,
          costPrice: product.cost_price,
          trackInventory: product.track_inventory !== false,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không tạo được sản phẩm');

      // Cập nhật bổ sung quy cách ngay sau khi tạo
      await fetch(`${apiBase}/api/admin/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: data.product.id,
          fields: {
            packaging_note: product.packaging_note?.trim() || null,
            min_order_qty: Number(product.min_order_qty) || 1,
            order_step: Number(product.order_step) || 1,
            enforce_order_step: !!product.enforce_order_step,
          },
        }),
      });

      showToast(`Đã tạo sản phẩm, mã hàng: ${data.product.sku}`);
      navigate(`/hang-hoa/${data.product.id}`, { replace: true });
    } catch (err: any) {
      showToast(err.message || 'Không tạo được sản phẩm', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const fields: Record<string, any> = {};
      for (const f of TEXT_FIELDS) fields[f.key] = product[f.key] ?? null;
      fields.description = product.description ?? null;
      fields.notes = product.notes ?? null;
      fields.cost_price = Number(product.cost_price) || 0;
      fields.price_retail = Number(product.price_retail) || 0;
      fields.price_wholesale = Number(product.price_wholesale) || 0;
      fields.min_stock = Number(product.min_stock) || 0;
      fields.max_stock = product.max_stock === '' || product.max_stock == null ? null : Number(product.max_stock);
      fields.track_inventory = !!product.track_inventory;
      fields.active = !!product.active;

      // Nhóm quy cách đặt hàng (G1 — Section 3.2)
      fields.packaging_note = product.packaging_note?.trim() || null;
      fields.min_order_qty = Number(product.min_order_qty) || 1;
      fields.order_step = Number(product.order_step) || 1;
      fields.enforce_order_step = !!product.enforce_order_step;

      const tierPrices: Record<string, number | null> = {};
      for (const t of tiers) {
        const raw = tierDrafts[t.code];
        tierPrices[t.code] = raw === '' || raw === undefined ? null : Number(raw);
      }

      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId: id, fields, tierPrices }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không lưu được thay đổi');
      showToast('Đã lưu thay đổi thông tin và quy cách đặt hàng');
      fetchProduct();
    } catch (err: any) {
      showToast(err.message || 'Không lưu được thay đổi', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadImage = async (file: File) => {
    if (!id || isNew) {
      showToast('Vui lòng lưu sản phẩm trước khi tải ảnh', 'error');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('productId', id);
      const res = await fetch(`${apiBase}/api/admin/products/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi tải ảnh');
      setField('image_url', data.imageUrl);
      showToast('Tải ảnh sản phẩm thành công');
    } catch (err: any) {
      showToast(err.message || 'Không tải ảnh lên được', 'error');
    } finally {
      setUploading(false);
    }
  };

  const submitInventoryAdjustment = async () => {
    const qty = Number(invQty);
    if (!qty || (invType !== 'adjust' && qty <= 0)) {
      showToast('Nhập số lượng điều chỉnh hợp lệ (> 0)', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId: id, inventoryAdjustment: { type: invType, quantity: qty, note: invNote || undefined } }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setInvQty('');
      setInvNote('');
      showToast('Ghi nhận điều chỉnh tồn kho thành công');
      await fetchProduct();
    } catch (err: any) {
      showToast(err.message || 'Không điều chỉnh tồn kho được', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <RefreshCw className="animate-spin text-emerald-600 mb-2" size={24} />
        <span className="text-sm font-medium">Đang tải chi tiết hàng hóa...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
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
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate('/hang-hoa')}
          className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors"
          title="Quay lại danh sách"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            {isNew ? 'Thêm sản phẩm mới' : product.name}
          </h1>
          {!isNew && <p className="text-xs text-slate-400 font-mono mt-0.5">{product.sku}</p>}
        </div>
        {!canEdit && (
          <span className="ml-auto text-xs text-slate-500 px-2.5 py-1 bg-slate-100 rounded-full font-medium">
            Chế độ chỉ xem
          </span>
        )}
      </header>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
        {/* Ảnh sản phẩm */}
        {!isNew && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Ảnh sản phẩm</label>
            <div className="flex items-center gap-4">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt=""
                  className="w-24 h-24 rounded-xl object-cover border border-slate-200 bg-slate-50"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                  <ImageOff size={24} />
                </div>
              )}
              {canEdit && (
                <label className="px-3.5 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-2 transition-colors">
                  {uploading ? <RefreshCw size={14} className="animate-spin text-emerald-600" /> : <Upload size={14} />}
                  <span>{uploading ? 'Đang tải lên...' : 'Tải ảnh mới'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0])}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Nhóm: Quy cách đặt hàng (G1 — Section 3.2) */}
        <div className="p-5 bg-emerald-50/40 border border-emerald-200/80 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-emerald-200/60 pb-2.5">
            <Sliders size={18} className="text-emerald-700" />
            <h2 className="font-bold text-slate-800 text-base">Quy cách đặt hàng</h2>
            <span className="text-xs text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-medium ml-auto">
              Đồng bộ Website, Mini App, POS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Mô tả quy cách */}
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Mô tả quy cách đóng gói
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={product.packaging_note || ''}
                onChange={(e) => setField('packaging_note', e.target.value)}
                placeholder="VD: Bịch 0,5kg, Khay 30 quả..."
                maxLength={120}
                className={`w-full px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 ${
                  errors.packaging_note
                    ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
              {errors.packaging_note ? (
                <p className="text-rose-600 text-xs mt-1">{errors.packaging_note}</p>
              ) : (
                <p className="text-slate-400 text-[11px] mt-1">Tối đa 120 ký tự</p>
              )}
            </div>

            {/* Số lượng tối thiểu */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Số lượng tối thiểu ({product.unit || 'Kg'})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                disabled={!canEdit}
                value={product.min_order_qty ?? ''}
                onChange={(e) => setField('min_order_qty', e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-sm font-mono bg-white focus:outline-none focus:ring-2 ${
                  errors.min_order_qty
                    ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
              {errors.min_order_qty && <p className="text-rose-600 text-xs mt-1">{errors.min_order_qty}</p>}
            </div>

            {/* Bước đặt hàng */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Bước đặt hàng ({product.unit || 'Kg'})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                disabled={!canEdit}
                value={product.order_step ?? ''}
                onChange={(e) => setField('order_step', e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-sm font-mono bg-white focus:outline-none focus:ring-2 ${
                  errors.order_step
                    ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/20'
                    : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                }`}
              />
              {errors.order_step && <p className="text-rose-600 text-xs mt-1">{errors.order_step}</p>}
            </div>
          </div>

          {/* Toggle enforce_order_step */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={!!product.enforce_order_step}
                onChange={(e) => setField('enforce_order_step', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-semibold text-slate-800 text-sm">
                Bật kiểm tra quy cách khi đặt hàng
              </span>
            </label>

            {/* Live example badge */}
            <div className="flex items-center gap-1.5 text-xs text-emerald-900 bg-white border border-emerald-200 px-3 py-1.5 rounded-xl shadow-2xs">
              <Info size={14} className="text-emerald-700 shrink-0" />
              <span>Ví dụ hợp lệ:</span>
              <strong className="font-mono text-emerald-800">{exampleValidQuantities}</strong>
            </div>
          </div>
        </div>

        {/* Thông tin chung */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-2">Thông tin cơ bản</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className={f.key === 'name' ? 'md:col-span-2' : ''}>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  {f.label}
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={product[f.key] || ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 ${
                    errors[f.key] ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:ring-emerald-500/20'
                  }`}
                />
                {errors[f.key] && <p className="text-rose-600 text-xs mt-1">{errors[f.key]}</p>}
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Mô tả chi tiết</label>
            <textarea
              disabled={!canEdit}
              value={product.description || ''}
              onChange={(e) => setField('description', e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Ghi chú nội bộ</label>
            <textarea
              disabled={!canEdit}
              value={product.notes || ''}
              onChange={(e) => setField('notes', e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {/* Giá vốn & Giá bán */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <h2 className="font-bold text-slate-800 text-base">Giá & Tồn kho</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Giá vốn</label>
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={product.cost_price ?? ''}
                onChange={(e) => setField('cost_price', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Giá nhập cuối</label>
              <input
                type="text"
                disabled
                value={product.last_import_price != null ? money(product.last_import_price) : 'Chưa có'}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono bg-slate-50 text-slate-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Giá bán lẻ</label>
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={product.price_retail ?? ''}
                onChange={(e) => setField('price_retail', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Giá bán sỉ</label>
              <input
                type="number"
                min="0"
                disabled={!canEdit}
                value={product.price_wholesale ?? ''}
                onChange={(e) => setField('price_wholesale', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={product.active !== false}
                onChange={(e) => setField('active', e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium">Đang kinh doanh</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={!!product.track_inventory}
                onChange={(e) => setField('track_inventory', e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="font-medium">Có theo dõi tồn kho</span>
            </label>
          </div>
        </div>

        {/* Giá theo hạng */}
        <div className="pt-2 border-t border-slate-100">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
            Giá theo hạng khách hàng (VIP)
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {tiers.map((t) => (
              <div key={t.code} className="p-2 border border-slate-200/80 rounded-xl bg-slate-50/50">
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">{t.name}</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  disabled={!canEdit}
                  value={tierDrafts[t.code] ?? ''}
                  onChange={(e) => setTierDrafts((d) => ({ ...d, [t.code]: e.target.value }))}
                  placeholder={money(Number(product.price_retail) || 0)}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono bg-white disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Nút lưu */}
        {canEdit && (
          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              onClick={isNew ? handleCreate : handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shadow-xs transition-colors"
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
              <span>{saving ? 'Đang lưu...' : isNew ? 'Tạo sản phẩm' : 'Lưu thay đổi'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Điều chỉnh tồn kho + lịch sử */}
      {!isNew && product.track_inventory && canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <h2 className="font-bold text-slate-800 text-base">Điều chỉnh tồn kho</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              <button
                onClick={() => setInvType('in')}
                className={`px-3 py-1.5 flex items-center gap-1 ${invType === 'in' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}
              >
                <PackagePlus size={14} /> Nhập
              </button>
              <button
                onClick={() => setInvType('out')}
                className={`px-3 py-1.5 flex items-center gap-1 border-l border-slate-200 ${invType === 'out' ? 'bg-rose-600 text-white' : 'bg-white text-slate-600'}`}
              >
                <PackageMinus size={14} /> Xuất
              </button>
              <button
                onClick={() => setInvType('adjust')}
                className={`px-3 py-1.5 flex items-center gap-1 border-l border-slate-200 ${invType === 'adjust' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600'}`}
              >
                <Wrench size={14} /> Điều chỉnh
              </button>
            </div>
            <input
              type="number"
              min={invType === 'adjust' ? undefined : 0}
              step="0.001"
              value={invQty}
              onChange={(e) => setInvQty(e.target.value)}
              placeholder={invType === 'adjust' ? 'vd: -5 hoặc 5' : 'Số lượng'}
              className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono"
            />
            <input
              type="text"
              value={invNote}
              onChange={(e) => setInvNote(e.target.value)}
              placeholder="Ghi chú điều chỉnh..."
              className="flex-1 min-w-[160px] border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
            />
            <button
              onClick={submitInventoryAdjustment}
              disabled={saving}
              className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 disabled:opacity-50"
            >
              Ghi nhận
            </button>
          </div>

          {history.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lịch sử điều chỉnh gần đây</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-xs text-slate-600 py-1.5 border-b border-slate-100 last:border-0">
                    <span className={h.type === 'in' ? 'text-emerald-600 font-semibold' : h.type === 'out' ? 'text-rose-600 font-semibold' : 'text-slate-700 font-semibold'}>
                      {h.type === 'in' ? '+ Nhập' : h.type === 'out' ? '- Xuất' : 'Điều chỉnh'} {h.quantity}
                    </span>
                    <span className="truncate flex-1 mx-3 text-slate-500">{h.note || '—'}</span>
                    <span className="text-slate-400 font-mono">{dt(h.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
