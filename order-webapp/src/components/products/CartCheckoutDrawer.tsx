import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Trash2,
  AlertCircle,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { CustomerSession } from '../../lib/api';
import type { OrderTab } from './OrderTabsBar';
import ProductThumbnail from './ProductThumbnail';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface CartCheckoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  session: CustomerSession | null;
  activeTab: OrderTab;
  onUpdateTab: (updater: (prev: OrderTab) => OrderTab) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onUpdateNote: (productId: string, note: string) => void;
  onRemoveItem: (productId: string) => void;
  onSubmitOrder: () => void;
  submitting: boolean;
  errorMessage: string;
}

export default function CartCheckoutDrawer({
  isOpen,
  onClose,
  session,
  activeTab,
  onUpdateTab,
  onUpdateQty,
  onUpdateNote,
  onRemoveItem,
  onSubmitOrder,
  submitting,
  errorMessage,
}: CartCheckoutDrawerProps) {
  const [isDeliveryExpanded, setIsDeliveryExpanded] = useState(true);

  if (!isOpen) return null;

  const totalQuantity = activeTab.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalAmount = activeTab.items.reduce(
    (sum, item) => sum + item.quantity * (item.product.price || 0),
    0
  );

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* Backdrop click area */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Container */}
      <div className="bg-white rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl border-t border-[#17231d]/15 animate-slide-up pb-[env(safe-area-inset-bottom)]">
        {/* Drag handle & Header */}
        <div className="p-4 border-b border-[#17231d]/10 flex items-center justify-between">
          <div>
            <div className="w-10 h-1 rounded-full bg-[#17231d]/15 mx-auto mb-2" />
            <h3 className="font-bold text-base text-[#17231d] flex items-center gap-2">
              <span>{activeTab.title}</span>
              <span className="text-xs font-normal text-[#59665f]">
                ({activeTab.items.length} món · {totalQuantity.toFixed(1)} ĐVT)
              </span>
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#59665f] hover:bg-[#f5f7f3] active:scale-95 transition-colors cursor-pointer"
            aria-label="Đóng bảng giỏ hàng"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Danh sách mặt hàng */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-[#59665f] uppercase tracking-wider">
              Danh sách hàng hóa đặt
            </h4>

            {activeTab.items.length === 0 ? (
              <div className="py-6 text-center text-[#59665f] text-xs">
                Chưa có món nào trong đơn này. Hãy chọn thêm món từ danh sách.
              </div>
            ) : (
              activeTab.items.map((item) => {
                const lineTotal = item.quantity * (item.product.price || 0);
                return (
                  <div
                    key={item.product.id}
                    className="p-3 rounded-2xl border border-[#17231d]/10 bg-[#fbfcfb] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <ProductThumbnail product={item.product} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs text-[#17231d] leading-snug">
                          {item.product.name}
                        </p>
                        <p className="text-[11px] text-[#59665f] mt-0.5">
                          {item.product.unit || 'Kg'} ·{' '}
                          <strong className="text-[#0f7a4f]">
                            {item.product.priceOnRequest ? 'Liên hệ' : money(item.product.price)}
                          </strong>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.product.id)}
                        className="text-[#59665f]/50 hover:text-red-600 p-1.5 rounded-lg active:bg-red-50"
                        title="Xóa món này"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Stepper và tiền dòng */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#17231d]/5">
                      <div className="flex items-center gap-1 bg-[#f5f7f3] p-1 rounded-xl border border-[#17231d]/10">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQty(
                              item.product.id,
                              Math.max(0, Number((item.quantity - 1).toFixed(2)))
                            )
                          }
                          className="w-11 h-11 rounded-lg bg-white font-bold text-sm text-[#17231d] active:scale-95 flex items-center justify-center shadow-xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0.1}
                          step="any"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateQty(item.product.id, isNaN(val) ? 0 : val);
                          }}
                          className="w-14 text-center font-bold text-sm bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQty(
                              item.product.id,
                              Number((item.quantity + 1).toFixed(2))
                            )
                          }
                          className="w-11 h-11 rounded-lg bg-white font-bold text-sm text-[#0f7a4f] active:scale-95 flex items-center justify-center shadow-xs"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-[#59665f] block">Thành tiền</span>
                        <span className="font-mono font-bold text-sm text-[#0f7a4f]">
                          {item.product.priceOnRequest ? 'Tạm tính' : money(lineTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Ghi chú từng dòng */}
                    <div>
                      <input
                        type="text"
                        value={item.note || ''}
                        onChange={(e) => onUpdateNote(item.product.id, e.target.value)}
                        placeholder="Ghi chú quy cách (vd: sơ chế, thái lát...)"
                        className="w-full text-xs py-1.5 px-2.5 bg-white border border-[#17231d]/15 rounded-lg text-[#17231d] placeholder:text-[#59665f]/50 focus:outline-none focus:border-[#0f7a4f]"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Ghi chú chung */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider">
              Ghi chú toàn đơn
            </label>
            <input
              type="text"
              value={activeTab.note}
              onChange={(e) => onUpdateTab((t) => ({ ...t, note: e.target.value }))}
              placeholder="Ghi chú thêm cho bộ phận giao nhận..."
              className="w-full text-xs py-2 px-3 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-[#17231d] focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
            />
          </div>

          {/* Thông tin giao hàng */}
          <div className="border border-[#17231d]/10 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsDeliveryExpanded(!isDeliveryExpanded)}
              className="w-full p-3 bg-[#f8faf7] flex items-center justify-between text-xs font-bold text-[#17231d]"
            >
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-[#0f7a4f]" />
                <span>Địa chỉ và thời gian nhận hàng</span>
              </span>
              {isDeliveryExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {isDeliveryExpanded && (
              <div className="p-3.5 space-y-3 bg-white text-xs">
                {/* Ngày giao & Ca giao */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                      Ngày giao
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={14} />
                      <input
                        type="date"
                        min={new Date().toLocaleDateString('en-CA')}
                        value={activeTab.deliveryDate}
                        onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryDate: e.target.value }))}
                        className="w-full pl-8 pr-2.5 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                      Ca giao
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={14} />
                      <select
                        value={activeTab.deliveryShift}
                        onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryShift: e.target.value }))}
                        className="w-full pl-8 pr-2.5 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                      >
                        <option value="Ca sáng sớm (05:00 - 07:00)">Ca sáng sớm (05:00 - 07:00)</option>
                        <option value="Ca sáng (07:00 - 09:00)">Ca sáng (07:00 - 09:00)</option>
                        <option value="Ca trưa (09:30 - 11:00)">Ca trưa (09:30 - 11:00)</option>
                        <option value="Ca chiều (14:00 - 16:00)">Ca chiều (14:00 - 16:00)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Người nhận & SĐT */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                      Người nhận
                    </label>
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={13} />
                      <input
                        type="text"
                        value={activeTab.deliveryName}
                        onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryName: e.target.value }))}
                        placeholder="Tên người nhận"
                        className="w-full pl-8 pr-2 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                      SĐT nhận
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={13} />
                      <input
                        type="tel"
                        value={activeTab.deliveryPhone}
                        onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryPhone: e.target.value }))}
                        placeholder="SĐT người nhận"
                        className="w-full pl-8 pr-2 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                      />
                    </div>
                  </div>
                </div>

                {/* Địa chỉ nhận */}
                <div>
                  <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                    Địa chỉ chi tiết
                  </label>
                  <textarea
                    rows={2}
                    value={activeTab.deliveryAddress}
                    onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryAddress: e.target.value }))}
                    placeholder="Số nhà, đường, xưởng, bếp ăn..."
                    className="w-full px-3 py-2 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f] resize-none"
                  />
                </div>

                {session?.defaultShippingAddress?.address && (
                  <button
                    type="button"
                    onClick={() => {
                      const d = session.defaultShippingAddress!;
                      onUpdateTab((t) => ({
                        ...t,
                        deliveryName: d.name || t.deliveryName,
                        deliveryPhone: d.phone || t.deliveryPhone,
                        deliveryAddress: d.address || t.deliveryAddress,
                      }));
                    }}
                    className="text-[11px] text-[#0f7a4f] hover:underline font-semibold flex items-center gap-1"
                  >
                    <MapPin size={12} />
                    <span>Dùng địa chỉ mặc định của công ty</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer: Tổng tiền & Nút Gửi đơn */}
        <div className="p-4 border-t border-[#17231d]/10 bg-[#fbfcfb] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-[#59665f] block">Tạm tính đơn hàng</span>
              <p className="text-[10px] text-[#59665f] flex items-center gap-1">
                <Info size={11} className="text-[#e0742f]" />
                <span>TPS1 sẽ xác nhận lại mặt hàng cần báo giá hoặc có điều chỉnh</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-black font-mono text-[#0f7a4f]">
                {money(subtotalAmount)}
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onSubmitOrder}
            disabled={submitting || activeTab.items.length === 0}
            className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-wider bg-[#0f7a4f] hover:bg-[#0b4f34] text-white shadow-lg shadow-[#0f7a4f]/25 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase touch-target"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Đang gửi đơn hàng...</span>
              </>
            ) : (
              <>
                <span>Gửi đơn đặt hàng</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
