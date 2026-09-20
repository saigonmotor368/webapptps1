import { useState } from 'react';
import { X, Upload } from 'lucide-react';

// Thêm sản phẩm nhanh ngay trong lúc bán/xử lý đơn — khớp "+Thêm mới hàng
// hóa" trong dropdown tìm hàng của Sale/POS: điền tên + đơn vị +
// giá, có thể up ảnh, mã hàng (SKU) tự sinh ở backend (POST /api/admin/products,
// slugifySku()). Dùng chung cho PosCreatePage và OrderDetailPage.
export interface QuickAddedProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  price_retail: number;
  image_url?: string | null;
}

export default function QuickAddProductModal({
  apiBase, token, initialName = '', onClose, onCreated,
}: {
  apiBase: string;
  token: string | null;
  initialName?: string;
  onClose: () => void;
  onCreated: (product: QuickAddedProduct) => void;
}) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState('Kg');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('Vui lòng nhập tên sản phẩm'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          unit: unit || 'Kg',
          category: category || undefined,
          priceRetail: Number(price) || 0,
          priceWholesale: Number(price) || 0,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không tạo được sản phẩm');
      let product: QuickAddedProduct = data.product;

      if (image) {
        const form = new FormData();
        form.append('file', image);
        form.append('productId', product.id);
        const uploadRes = await fetch(`${apiBase}/api/admin/products/upload-image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.ok) product = { ...product, image_url: uploadData.imageUrl };
      }

      onCreated(product);
    } catch (err: any) {
      setError(err.message || 'Không tạo được sản phẩm');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Thêm sản phẩm mới</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-400">Mã hàng (SKU) sẽ được hệ thống tự sinh từ tên sản phẩm.</p>

        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Tên sản phẩm *" autoFocus
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
        <div className="grid grid-cols-2 gap-3">
          <input type="text" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Đơn vị tính (Kg, Hộp...)"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
          <input type="number" min="0" step="1000" value={price} onChange={e => setPrice(e.target.value)} placeholder="Giá bán (đ)"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
        </div>
        <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="Nhóm hàng (không bắt buộc)"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />

        <label className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-pointer hover:border-green-400">
          <Upload size={16} />
          {image ? image.name : 'Chọn ảnh sản phẩm (không bắt buộc)'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => setImage(e.target.files?.[0] || null)} />
        </label>

        {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {saving ? 'Đang tạo...' : 'Tạo & thêm vào đơn'}
          </button>
        </div>
      </div>
    </div>
  );
}
