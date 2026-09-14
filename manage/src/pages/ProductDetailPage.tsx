import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Upload, RefreshCw, PackagePlus, PackageMinus, Wrench, ImageOff } from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }
function dt(v: string) { return v ? new Date(v).toLocaleString('vi-VN') : '—'; }

const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Tên sản phẩm' },
  { key: 'category', label: 'Nhóm hàng' },
  { key: 'sub_category', label: 'Nhóm hàng phụ' },
  { key: 'unit', label: 'Đơn vị tính' },
  { key: 'pack_size', label: 'Quy cách đóng gói' },
  { key: 'supplier', label: 'Nhà cung cấp' },
  { key: 'origin', label: 'Xuất xứ' },
  { key: 'tags', label: 'Thẻ (phân cách bởi dấu phẩy)' },
];

// Trang chi tiết sản phẩm (Giai đoạn B, tiếp theo trang Hàng hóa) — bấm vào
// 1 sản phẩm ở trang Hàng hóa sẽ mở trang này để sửa TOÀN BỘ thông tin (ảnh,
// mô tả, giá gốc, giá theo hạng, tồn kho...), chỉ admin/thu_mua sửa được.
// Cũng dùng chung trang này cho "Thêm sản phẩm mới" (id === 'moi').
export default function ProductDetailPage() {
  const { id } = useParams();
  const isNew = id === 'moi';
  const navigate = useNavigate();
  const { token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [tiers, setTiers] = useState<{ code: string; name: string }[]>([]);
  const [product, setProduct] = useState<Record<string, any>>({ name: '', unit: 'Kg' });
  const [tierDrafts, setTierDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [invType, setInvType] = useState<'in' | 'out' | 'adjust'>('in');
  const [invQty, setInvQty] = useState('');
  const [invNote, setInvNote] = useState('');

  const fetchMeta = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/admin/products?meta=1`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.ok) setTiers(data.tiers || []);
  }, [apiBase, token]);

  const fetchProduct = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/products?productId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.ok) { alert('Lỗi: ' + data.error); navigate('/hang-hoa'); return; }
      setProduct(data.product);
      setCanEdit(!!data.canEdit);
      setHistory(data.inventoryHistory || []);
      const drafts: Record<string, string> = {};
      for (const t of tiers.length ? tiers : [{ code: 'VIP0' }, { code: 'VIP1' }, { code: 'VIP2' }, { code: 'VIP3' }]) {
        drafts[t.code] = data.product.tierPrices?.[t.code] != null ? String(data.product.tierPrices[t.code]) : '';
      }
      setTierDrafts(drafts);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token, id, isNew, navigate, tiers]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchProduct(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isNew) setCanEdit(true);
  }, [isNew]);

  const setField = (key: string, value: any) => setProduct((p) => ({ ...p, [key]: value }));

  const handleCreate = async () => {
    if (!product.name?.trim()) { alert('Vui lòng nhập tên sản phẩm'); return; }
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
      if (!data.ok) throw new Error(data.error);
      alert(`✅ Đã tạo sản phẩm, mã hàng: ${data.product.sku}`);
      navigate(`/hang-hoa/${data.product.id}`, { replace: true });
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không tạo được sản phẩm'));
    } finally { setSaving(false); }
  };

  const handleSave = async () => {
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
      if (!data.ok) throw new Error(data.error);
      alert('✅ Đã lưu thay đổi');
      fetchProduct();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không lưu được'));
    } finally { setSaving(false); }
  };

  const handleUploadImage = async (file: File) => {
    if (!id || isNew) { alert('Lưu sản phẩm trước khi tải ảnh'); return; }
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
      if (!data.ok) throw new Error(data.error);
      setField('image_url', data.imageUrl);
    } catch (err: any) {
      alert('Lỗi tải ảnh: ' + (err.message || 'Không tải lên được'));
    } finally { setUploading(false); }
  };

  const submitInventoryAdjustment = async () => {
    const qty = Number(invQty);
    if (!qty || (invType !== 'adjust' && qty <= 0)) { alert('Nhập số lượng hợp lệ' + (invType !== 'adjust' ? ' (> 0)' : '')); return; }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId: id, inventoryAdjustment: { type: invType, quantity: qty, note: invNote || undefined } }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setInvQty(''); setInvNote('');
      await fetchProduct();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không lưu được'));
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-500"><RefreshCw className="animate-spin mr-2" size={20} /> Đang tải...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate('/hang-hoa')} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{isNew ? 'Thêm sản phẩm mới' : product.name}</h1>
          {!isNew && <p className="text-xs text-slate-400 font-mono">{product.sku}</p>}
        </div>
        {!canEdit && <span className="ml-auto text-xs text-slate-400 px-2 py-1 bg-slate-100 rounded-full">Chỉ xem</span>}
      </header>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
        {/* Ảnh sản phẩm */}
        {!isNew && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-2">Ảnh sản phẩm</label>
            <div className="flex items-center gap-4">
              {product.image_url ? (
                <img src={product.image_url} alt="" className="w-24 h-24 rounded-xl object-cover border border-slate-200" />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                  <ImageOff size={24} />
                </div>
              )}
              {canEdit && (
                <label className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-2">
                  {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? 'Đang tải...' : 'Tải ảnh lên'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading}
                    onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0])} />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Thông tin chung */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key} className={f.key === 'name' ? 'md:col-span-2' : ''}>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">{f.label}</label>
              <input type="text" disabled={!canEdit} value={product[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
            </div>
          ))}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Mô tả chi tiết</label>
          <textarea disabled={!canEdit} value={product.description || ''} onChange={(e) => setField('description', e.target.value)} rows={4}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Ghi chú nội bộ</label>
          <textarea disabled={!canEdit} value={product.notes || ''} onChange={(e) => setField('notes', e.target.value)} rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
        </div>

        {/* Giá gốc */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Giá vốn</label>
            <input type="number" min="0" disabled={!canEdit} value={product.cost_price ?? ''} onChange={(e) => setField('cost_price', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Giá nhập cuối</label>
            <input type="text" disabled value={product.last_import_price != null ? money(product.last_import_price) : 'Chưa có'}
              title="Tự động cập nhật khi nhập kho hoặc nhập bảng giá có ghi kèm đơn giá — không sửa tay ở đây"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Giá bán lẻ</label>
            <input type="number" min="0" disabled={!canEdit} value={product.price_retail ?? ''} onChange={(e) => setField('price_retail', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Giá bán sỉ</label>
            <input type="number" min="0" disabled={!canEdit} value={product.price_wholesale ?? ''} onChange={(e) => setField('price_wholesale', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" disabled={!canEdit} checked={product.active !== false} onChange={(e) => setField('active', e.target.checked)} />
              Đang kinh doanh
            </label>
          </div>
        </div>

        {!isNew && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-slate-50">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Định mức tồn tối thiểu</label>
                <input type="number" min="0" disabled={!canEdit} value={product.min_stock ?? ''} onChange={(e) => setField('min_stock', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Định mức tồn tối đa</label>
                <input type="number" min="0" disabled={!canEdit} value={product.max_stock ?? ''} onChange={(e) => setField('max_stock', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" disabled={!canEdit} checked={!!product.track_inventory} onChange={(e) => setField('track_inventory', e.target.checked)} />
                  Có theo dõi tồn kho
                </label>
              </div>
            </div>
            {product.track_inventory && (
              <p className="text-sm text-slate-500">Tồn kho hiện tại: <span className="font-semibold text-slate-800">{product.stock_qty ?? 0}</span></p>
            )}
          </>
        )}

        {/* Giá theo hạng */}
        <div className="pt-2 border-t border-slate-50">
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-2">Giá theo hạng khách</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {tiers.map((t) => (
              <div key={t.code}>
                <label className="text-[10px] text-slate-400">{t.name}</label>
                <input type="number" min="0" step="1000" disabled={!canEdit} value={tierDrafts[t.code] ?? ''}
                  onChange={(e) => setTierDrafts((d) => ({ ...d, [t.code]: e.target.value }))}
                  placeholder={money(Number(product.price_retail) || 0)}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50" />
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end pt-2 border-t border-slate-50">
            <button onClick={isNew ? handleCreate : handleSave} disabled={saving}
              className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Đang lưu...' : isNew ? 'Tạo sản phẩm' : 'Lưu thay đổi'}
            </button>
          </div>
        )}
      </div>

      {/* Điều chỉnh tồn kho + lịch sử */}
      {!isNew && product.track_inventory && canEdit && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-slate-800">Điều chỉnh tồn kho</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              <button onClick={() => setInvType('in')} className={`px-3 py-1.5 flex items-center gap-1 ${invType === 'in' ? 'bg-green-600 text-white' : 'bg-white text-slate-600'}`}>
                <PackagePlus size={14} /> Nhập
              </button>
              <button onClick={() => setInvType('out')} className={`px-3 py-1.5 flex items-center gap-1 border-l border-slate-200 ${invType === 'out' ? 'bg-red-600 text-white' : 'bg-white text-slate-600'}`}>
                <PackageMinus size={14} /> Xuất
              </button>
              <button onClick={() => setInvType('adjust')} className={`px-3 py-1.5 flex items-center gap-1 border-l border-slate-200 ${invType === 'adjust' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600'}`}>
                <Wrench size={14} /> Điều chỉnh
              </button>
            </div>
            <input type="number" min={invType === 'adjust' ? undefined : 0} step="0.001" value={invQty} onChange={(e) => setInvQty(e.target.value)}
              placeholder={invType === 'adjust' ? 'vd: -5 hoặc 5' : 'Số lượng'} className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
            <input type="text" value={invNote} onChange={(e) => setInvNote(e.target.value)}
              placeholder="Ghi chú" className="flex-1 min-w-[160px] border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
            <button onClick={submitInventoryAdjustment} disabled={saving}
              className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-900 disabled:opacity-50">
              Ghi nhận
            </button>
          </div>

          {history.length > 0 && (
            <div className="pt-3 border-t border-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Lịch sử gần đây</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-xs text-slate-500 py-1 border-b border-slate-50 last:border-0">
                    <span className={h.type === 'in' ? 'text-green-600' : h.type === 'out' ? 'text-red-600' : 'text-slate-600'}>
                      {h.type === 'in' ? '+ Nhập' : h.type === 'out' ? '- Xuất' : 'Điều chỉnh'} {h.quantity}
                    </span>
                    <span className="truncate flex-1 mx-2">{h.note || '—'}</span>
                    <span>{dt(h.created_at)}</span>
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
