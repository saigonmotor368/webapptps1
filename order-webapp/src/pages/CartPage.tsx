import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../lib/api';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

export default function CartPage() {
  const { lines, total, setQty, removeItem, clear } = useCart();
  const { session } = useAuth();
  const navigate = useNavigate();

  const defaultShipping = session?.defaultShippingAddress;
  const [useDefault, setUseDefault] = useState(Boolean(defaultShipping?.address));
  const [deliveryAlias, setDeliveryAlias] = useState(defaultShipping?.alias || '');
  const [deliveryAddress, setDeliveryAddress] = useState(defaultShipping?.address || '');
  const [deliveryName, setDeliveryName] = useState(defaultShipping?.name || session?.name || '');
  const [deliveryPhone, setDeliveryPhone] = useState(defaultShipping?.phone || session?.phone || '');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successCode, setSuccessCode] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());

  const submitOrder = async () => {
    setError('');
    if (lines.length === 0) {
      setError('Giỏ hàng đang trống');
      return;
    }
    if (!deliveryAddress.trim() || !deliveryName.trim() || !deliveryPhone.trim()) {
      setError('Vui lòng nhập đầy đủ tên, số điện thoại và địa chỉ giao hàng');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createOrder({
        items: lines.map((l) => ({ productId: l.product.id, name: l.product.name, quantity: l.quantity })),
        deliveryAlias,
        deliveryAddress,
        deliveryName,
        deliveryPhone,
        note,
        idempotencyKey: idempotencyKey.current,
      });
      setSuccessCode(res.orderCode);
      clear();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đặt được đơn hàng, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  if (successCode) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="tps1-rise bg-white rounded-3xl shadow-xl shadow-black/5 border border-[#14231c]/10 p-10 max-w-md w-full text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0f6f4b]/15 to-[#0f6f4b]/5 text-[#0f6f4b] flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-xl font-bold text-[#14231c]">Đặt hàng thành công!</h2>
          <p className="text-[#59665f]">
            Mã đơn <span className="font-semibold text-[#0f6f4b]">{successCode}</span> đã được gửi tới TPS1. Nhân
            viên sẽ liên hệ xác nhận giá và thời gian giao hàng.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => {
                setSuccessCode('');
                navigate('/');
              }}
              className="px-5 py-2.5 rounded-xl border border-[#14231c]/15 text-[#14231c] font-medium hover:bg-[#f6f7f4] transition-colors"
            >
              Đặt thêm đơn khác
            </button>
            <button
              onClick={() => navigate('/don-hang')}
              className="px-5 py-2.5 rounded-xl bg-[#0f6f4b] text-white font-medium hover:bg-[#0b5a3c] transition-colors"
            >
              Xem đơn hàng của tôi
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 bg-white rounded-3xl border border-[#14231c]/10">
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-[#f6f7f4] flex items-center justify-center">
          <ShoppingCart className="text-[#59665f]/40" size={28} />
        </div>
        <p className="text-[#59665f] mb-4">Giỏ hàng đang trống</p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 bg-[#0f6f4b] text-white rounded-xl font-medium hover:bg-[#0b5a3c] transition-colors"
        >
          Chọn sản phẩm
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#14231c]">Giỏ hàng của bạn</h1>

      <div className="space-y-2.5">
        {lines.map(({ product, quantity }) => (
          <div key={product.id} className="flex items-center justify-between gap-3 bg-white border border-[#14231c]/10 rounded-xl p-3.5">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-[#14231c] truncate">{product.name}</p>
              <p className="text-xs text-[#59665f]">{money(product.price)}/{product.unit}</p>
            </div>
            <input
              type="number"
              min={0.1}
              step="any"
              value={quantity}
              onChange={(e) => setQty(product.id, parseFloat(e.target.value) || 0)}
              className="w-16 border border-[#14231c]/15 rounded-lg py-1.5 px-2 text-sm"
            />
            <button onClick={() => removeItem(product.id)} className="text-red-500 hover:text-red-600 p-1.5">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#14231c]/10 rounded-2xl p-4">
        <div className="flex justify-between font-bold text-lg">
          <span>Tạm tính</span>
          <span className="text-[#0f6f4b]">{money(total)}</span>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mt-2">
          Đơn giá cuối cùng chỉ có hiệu lực sau khi sale TPS1 xác nhận đơn.
        </p>
      </div>

      {defaultShipping?.address && (
        <label className="flex gap-2.5 items-start p-3.5 bg-[#0f6f4b]/5 border border-[#0f6f4b]/20 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={useDefault}
            onChange={(e) => {
              const checked = e.target.checked;
              setUseDefault(checked);
              if (checked) {
                setDeliveryAlias(defaultShipping.alias || '');
                setDeliveryAddress(defaultShipping.address || '');
                setDeliveryName(defaultShipping.name || '');
                setDeliveryPhone(defaultShipping.phone || '');
              }
            }}
            className="mt-0.5"
          />
          <span className="text-sm">
            <strong className="text-[#14231c]">Dùng địa chỉ giao mặc định</strong>
            <br />
            <span className="text-[#59665f]">{defaultShipping.address}</span>
          </span>
        </label>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">Tên địa chỉ</label>
          <input
            value={deliveryAlias}
            onChange={(e) => {
              setUseDefault(false);
              setDeliveryAlias(e.target.value);
            }}
            placeholder="Vd: Kho chính, Bếp ăn"
            className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">Địa chỉ giao hàng</label>
          <textarea
            value={deliveryAddress}
            onChange={(e) => {
              setUseDefault(false);
              setDeliveryAddress(e.target.value);
            }}
            rows={2}
            placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố"
            className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">Người nhận</label>
            <input
              value={deliveryName}
              onChange={(e) => {
                setUseDefault(false);
                setDeliveryName(e.target.value);
              }}
              className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">SĐT nhận hàng</label>
            <input
              type="tel"
              value={deliveryPhone}
              onChange={(e) => {
                setUseDefault(false);
                setDeliveryPhone(e.target.value);
              }}
              className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Ghi chú thêm cho đơn hàng (nếu có)"
            className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      <button
        onClick={submitOrder}
        disabled={submitting}
        className="w-full bg-[#0f6f4b] hover:bg-[#0b5a3c] text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50"
      >
        {submitting ? 'Đang gửi đơn...' : 'Đặt hàng'}
      </button>
    </div>
  );
}
