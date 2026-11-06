import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  ArrowRight,
  Info,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../lib/api';
import ProductThumbnail from '../components/products/ProductThumbnail';
import { useLanguage } from '../contexts/LanguageContext';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

function getTomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CartPage() {
  const { t, errorText, productName, productUnit } = useLanguage();
  const { lines, total, setQty, setNote: setLineNote, removeItem, clear } = useCart();
  const { session } = useAuth();
  const navigate = useNavigate();

  const defaultShipping = session?.defaultShippingAddress;
  const [useDefault, setUseDefault] = useState(Boolean(defaultShipping?.address));
  const [deliveryAlias, setDeliveryAlias] = useState(defaultShipping?.alias || '');
  const [deliveryAddress, setDeliveryAddress] = useState(defaultShipping?.address || '');
  const [deliveryName, setDeliveryName] = useState(defaultShipping?.name || session?.name || '');
  const [deliveryPhone, setDeliveryPhone] = useState(defaultShipping?.phone || session?.phone || '');
  const [deliveryDate, setDeliveryDate] = useState(getTomorrowDateStr());
  const [earliestDate, setEarliestDate] = useState('');
  const [cutoffTimeStr, setCutoffTimeStr] = useState('');
  const [deliveryShift, setDeliveryShift] = useState('Ca sáng sớm (05:00 - 07:00)');
  const [generalNote, setGeneralNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successCode, setSuccessCode] = useState('');
  const [submittedPendingPriceCount, setSubmittedPendingPriceCount] = useState(0);
  const idempotencyKey = useRef(crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    api.orderConfig().then(info => {
      if (!alive) return;
      setEarliestDate(info.earliestDate);
      setCutoffTimeStr(info.cutoffTimeStr);
      setDeliveryDate(current => current < info.earliestDate ? info.earliestDate : current);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const submitOrder = async () => {
    setError('');
    if (lines.length === 0) {
      setError('Giỏ hàng đang trống');
      return;
    }
    if (!navigator.onLine) { setError(t('Không có kết nối mạng. Giỏ hàng của bạn đã được lưu.')); return; }
    if (earliestDate && deliveryDate < earliestDate) { setError(t('Đã quá giờ chốt đơn. Vui lòng chọn ngày giao mới.')); setDeliveryDate(earliestDate); return; }
    if (!deliveryAddress.trim() || !deliveryName.trim() || !deliveryPhone.trim()) {
      setError('Vui lòng nhập đầy đủ Tên người nhận, SĐT và Địa chỉ nhận hàng');
      return;
    }

    setSubmitting(true);
    try {
      const lineNotesFormatted = lines
        .filter((l) => l.note?.trim())
        .map((l) => `[${l.product.name}: ${l.note!.trim()}]`)
        .join('; ');

      const fullNote = [
        deliveryShift ? `[Ca: ${deliveryShift}]` : '',
        deliveryDate ? `[Ngày giao: ${deliveryDate}]` : '',
        lineNotesFormatted,
        generalNote.trim(),
      ]
        .filter(Boolean)
        .join(' - ');

      const res = await api.createOrder({
        items: lines.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          quantity: l.quantity,
          note: l.note?.trim() || undefined,
        })),
        deliveryAlias: deliveryAlias.trim() || undefined,
        deliveryAddress: deliveryAddress.trim(),
        deliveryName: deliveryName.trim(),
        deliveryPhone: deliveryPhone.trim(),
        deliveryDate,
        note: fullNote,
        idempotencyKey: idempotencyKey.current,
      });

      setSuccessCode(res.orderCode);
      setSubmittedPendingPriceCount(res.pendingPriceCount || 0);
      idempotencyKey.current = crypto.randomUUID();
      clear();
    } catch (err) {
      setError(
        err instanceof ApiError ? errorText(err) : t('Không gửi được đơn hàng, vui lòng thử lại sau.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (successCode) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl shadow-black/5 border border-[#17231d]/10 p-8 sm:p-10 max-w-md w-full text-center space-y-4 animate-scale-up">
          <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 text-[#0f7a4f] flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 size={42} />
          </div>
          <h2 className="text-2xl font-black text-[#17231d]">{t('Gửi đơn đặt hàng thành công!')}</h2>
          <p className="text-sm text-[#59665f] leading-relaxed">
            {t('Mã đơn hàng:')}{' '}
            <strong className="text-[#0f7a4f] font-mono text-base px-2 py-0.5 bg-[#0f7a4f]/10 rounded-lg">
              {successCode}
            </strong>
            . {t('TPS1 sẽ liên hệ xác nhận giá và lịch giao hàng.')}
          </p>
          {session?.verificationStatus === 'pending' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('Đã gửi đơn, chờ TPS1 xác minh tài khoản và xác nhận đơn.')}</p>}
          {submittedPendingPriceCount > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('Có mặt hàng đang chờ sale báo giá. Sale sẽ nhập giá hoặc bỏ mặt hàng không có hàng trước khi xác nhận đơn.')}</p>}

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
            <button
              onClick={() => {
                setSuccessCode('');
                navigate('/');
              }}
              className="px-5 py-3 rounded-xl border border-[#17231d]/15 text-[#17231d] font-bold text-xs hover:bg-[#f5f7f3] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ShoppingBag size={15} />
              <span>{t('Tiếp tục đặt đơn')}</span>
            </button>
            <button
              onClick={() => navigate('/don-hang')}
              className="px-5 py-3 rounded-xl bg-[#0f7a4f] hover:bg-[#0b4f34] text-white font-bold text-xs shadow-md shadow-[#0f7a4f]/25 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>{t('Đơn hàng của tôi')}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-6 bg-white rounded-3xl border border-[#17231d]/10 shadow-sm space-y-4 my-8">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-[#f5f7f3] flex items-center justify-center text-[#59665f]/40">
          <ShoppingCart size={36} />
        </div>
        <div>
          <h2 className="font-bold text-lg text-[#17231d]">Giỏ hàng của bạn đang trống</h2>
          <p className="text-xs text-[#59665f] mt-1">
            Chưa có mặt hàng nào được chọn. Hãy vào danh mục sản phẩm để bắt đầu lên đơn.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#0f7a4f] hover:bg-[#0b4f34] text-white rounded-xl font-bold text-xs shadow-md shadow-[#0f7a4f]/20 transition-all cursor-pointer touch-target"
        >
          <ShoppingBag size={16} />
          <span>Chọn sản phẩm ngay</span>
        </Link>
      </div>
    );
  }

  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  const pendingPriceCount = lines.filter(line => line.product.priceOnRequest || line.product.price <= 0).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#17231d]">Giỏ hàng đặt hàng</h1>
          <p className="text-xs text-[#59665f] mt-0.5">
            {lines.length} mặt hàng ({totalQuantity.toFixed(1)} ĐVT)
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-[#59665f] hover:text-red-600 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#17231d]/10 bg-white cursor-pointer"
        >
          <Trash2 size={13} />
          <span>Làm trống giỏ</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* Danh sách mặt hàng (Card layout) */}
        <div className="space-y-3">
          {lines.map(({ product, quantity, note }) => {
            const lineTotal = quantity * (product.price || 0);
            return (
              <div
                key={product.id}
                className="bg-white border border-[#17231d]/10 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <ProductThumbnail product={product} size="md" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {product.sku && (
                          <span className="text-[10px] font-mono font-bold text-[#59665f] bg-[#17231d]/5 px-1.5 py-0.2 rounded">
                            {product.sku}
                          </span>
                        )}
                        <h3 className="font-bold text-sm text-[#17231d] mt-0.5 leading-snug">
                          {productName(product.name)}
                        </h3>
                        {productName(product.name) !== product.name && <p className="text-[11px] text-[#59665f]">{product.name}</p>}
                      </div>

                      <button
                        onClick={() => removeItem(product.id)}
                        className="text-[#59665f]/40 hover:text-red-600 p-1.5 rounded-lg active:bg-red-50 transition-colors cursor-pointer"
                        title="Xóa mặt hàng này"
                        aria-label={`Xóa ${product.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <p className="text-xs text-[#59665f] mt-1 font-medium">
                      {t('ĐVT:')} <strong className="text-[#17231d]">{productUnit(product.unit || 'Kg')}</strong> ·{' '}
                      Đơn giá:{' '}
                      <strong className="text-[#0f7a4f]">
                        {product.priceOnRequest ? t('Chờ sale báo giá') : money(product.price)}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* Bộ Stepper số lượng & Thành tiền dòng */}
                <div className="flex items-center justify-between pt-2 border-t border-[#17231d]/5">
                  <div className="flex items-center gap-1.5 bg-[#f5f7f3] p-1 rounded-xl border border-[#17231d]/10">
                    <button
                      type="button"
                      onClick={() =>
                        setQty(product.id, Math.max(0, Number((quantity - 1).toFixed(2))))
                      }
                      className="w-8 h-8 rounded-lg bg-white font-bold text-sm text-[#17231d] active:scale-95 flex items-center justify-center shadow-xs cursor-pointer select-none"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={0.1}
                      step="any"
                      value={quantity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setQty(product.id, isNaN(val) ? 0 : val);
                      }}
                      className="w-16 text-center font-bold text-sm text-[#0b4f34] bg-transparent focus:outline-none"
                      aria-label={`Số lượng ${product.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => setQty(product.id, Number((quantity + 1).toFixed(2)))}
                      className="w-8 h-8 rounded-lg bg-white font-bold text-sm text-[#0f7a4f] active:scale-95 flex items-center justify-center shadow-xs cursor-pointer select-none"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-[#59665f] block">Thành tiền</span>
                    <span className="font-mono font-bold text-sm sm:text-base text-[#0f7a4f]">
                      {product.priceOnRequest ? t('Chờ sale báo giá') : money(lineTotal)}
                    </span>
                  </div>
                </div>

                {/* Ghi chú quy cách theo dòng */}
                <div>
                  <input
                    type="text"
                    value={note || ''}
                    onChange={(e) => setLineNote(product.id, e.target.value)}
                    placeholder="Ghi chú quy cách sơ chế riêng cho món này (vd: cắt khúc, bỏ đầu...)"
                    className="w-full text-xs py-2 px-3 bg-[#f8faf7] border border-[#17231d]/12 rounded-xl text-[#17231d] placeholder:text-[#59665f]/55 focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Thông tin giao hàng & Xác nhận đặt hàng */}
        <div className="space-y-3 sticky top-[68px]">
          {/* Card Thông tin nhận hàng */}
          <div className="bg-white rounded-2xl border border-[#17231d]/10 p-4 shadow-xs space-y-3.5 text-xs">
            <h3 className="font-bold text-sm text-[#17231d] flex items-center gap-2 pb-2 border-b border-[#17231d]/10">
              <MapPin size={16} className="text-[#0f7a4f]" />
              <span>Thông tin nhận hàng</span>
            </h3>

            {/* Dùng địa chỉ mặc định checkbox */}
            {defaultShipping?.address && (
              <label className="flex gap-2.5 items-start p-3 bg-[#0f7a4f]/5 border border-[#0f7a4f]/20 rounded-xl cursor-pointer">
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
                  className="mt-0.5 accent-[#0f7a4f] w-4 h-4 rounded"
                />
                <div className="text-xs">
                  <strong className="text-[#17231d] block">Dùng địa chỉ công ty mặc định</strong>
                  <span className="text-[#59665f] line-clamp-2 mt-0.5">
                    {defaultShipping.address}
                  </span>
                </div>
              </label>
            )}

            {/* Ngày giao & Ca giao */}
            <div className="space-y-2.5">
              <div>
                <label className="block font-bold text-[#59665f] uppercase tracking-wider mb-1 text-[11px]">
                  Ngày giao mong muốn
                </label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={14} />
                    <input
                      type="date"
                      min={earliestDate}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                  />
                </div>
                {earliestDate && <p className="mt-1 text-[11px] text-[#59665f]">{t('Ngày giao sớm nhất')}: {earliestDate}{cutoffTimeStr ? ` · ${t('Giờ chốt đơn')}: ${cutoffTimeStr}` : ''}</p>}
              </div>

              <div>
                <label className="block font-bold text-[#59665f] uppercase tracking-wider mb-1 text-[11px]">
                  Khung giờ / Ca giao
                </label>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={14} />
                  <select
                    value={deliveryShift}
                    onChange={(e) => setDeliveryShift(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-[#0f7a4f] cursor-pointer"
                  >
                    <option value="Ca sáng sớm (05:00 - 07:00)">{t('Ca sáng sớm (05:00 - 07:00)')}</option>
                    <option value="Ca sáng (07:00 - 09:00)">{t('Ca sáng (07:00 - 09:00)')}</option>
                    <option value="Ca trưa (09:30 - 11:00)">{t('Ca trưa (09:30 - 11:00)')}</option>
                    <option value="Ca chiều (14:00 - 16:00)">{t('Ca chiều (14:00 - 16:00)')}</option>
                  </select>
                </div>
              </div>

              {/* Tên & SĐT người nhận */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-[#59665f] uppercase tracking-wider mb-1 text-[11px]">
                    Người nhận
                  </label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={13} />
                    <input
                      type="text"
                      value={deliveryName}
                      onChange={(e) => {
                        setUseDefault(false);
                        setDeliveryName(e.target.value);
                      }}
                      placeholder="Tên người nhận"
                      className="w-full pl-8 pr-2 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-[#59665f] uppercase tracking-wider mb-1 text-[11px]">
                    SĐT nhận
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={13} />
                    <input
                      type="tel"
                      value={deliveryPhone}
                      onChange={(e) => {
                        setUseDefault(false);
                        setDeliveryPhone(e.target.value);
                      }}
                      placeholder="SĐT người nhận"
                      className="w-full pl-8 pr-2 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                    />
                  </div>
                </div>
              </div>

              {/* Địa chỉ giao */}
              <div>
                <label className="block font-bold text-[#59665f] uppercase tracking-wider mb-1 text-[11px]">
                  Địa chỉ giao hàng chi tiết
                </label>
                <textarea
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => {
                    setUseDefault(false);
                    setDeliveryAddress(e.target.value);
                  }}
                  placeholder="Số nhà, đường, xưởng, bếp ăn..."
                  className="w-full px-3 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f] resize-none"
                  required
                />
              </div>

              {/* Ghi chú toàn đơn */}
              <div>
                <label className="block font-bold text-[#59665f] uppercase tracking-wider mb-1 text-[11px]">
                  Ghi chú đơn hàng
                </label>
                <textarea
                  rows={2}
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="Ghi chú thêm cho bộ phận giao nhận (nếu có)..."
                  className="w-full px-3 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f] resize-none"
                />
              </div>
            </div>
          </div>

          {/* Card Tóm tắt tiền & Nút Đặt */}
          <div className="bg-white rounded-2xl border border-[#17231d]/10 p-4 shadow-xs space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs text-[#59665f]">
                <span>Tổng tiền hàng:</span>
                <span className="font-mono font-semibold text-[#17231d]">{money(total)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#17231d]/10">
                <span className="font-bold text-sm text-[#17231d]">Tạm tính:</span>
                <span className="text-xl font-black font-mono text-[#0f7a4f]">{money(total)}</span>
              </div>
              <p className="text-[11px] text-[#59665f] flex items-start gap-1.5 pt-1 leading-normal">
                <Info size={13} className="text-[#e0742f] shrink-0 mt-0.5" />
                <span>
                  Giá hiển thị theo bảng giá hiện tại. TPS1 sẽ xác nhận lại các mặt hàng cần báo giá hoặc có điều chỉnh.
                </span>
              </p>
              {pendingPriceCount > 0 && <p className="rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-800">{t('Tạm tính chưa gồm hàng chờ giá')} ({pendingPriceCount}). {t('Sale sẽ nhập giá hoặc bỏ mặt hàng không có hàng trước khi xác nhận đơn.')}</p>}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={submitOrder}
              disabled={submitting || lines.length === 0}
              className="w-full bg-[#0f7a4f] hover:bg-[#0b4f34] text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-[#0f7a4f]/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase text-xs sm:text-sm tracking-wider touch-target cursor-pointer"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang gửi đơn...</span>
                </>
              ) : (
                <>
                  <span>Xác nhận đặt hàng</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
