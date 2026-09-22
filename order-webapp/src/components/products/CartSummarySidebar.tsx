import { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Trash2,
  AlertCircle,
  ArrowRight,
  ShoppingBag,
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

interface CartSummarySidebarProps {
  session: CustomerSession | null;
  activeTab: OrderTab;
  onUpdateTab: (updater: (prev: OrderTab) => OrderTab) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onSubmitOrder: () => void;
  submitting: boolean;
  errorMessage: string;
}

export default function CartSummarySidebar({
  session,
  activeTab,
  onUpdateTab,
  onUpdateQty,
  onRemoveItem,
  onSubmitOrder,
  submitting,
  errorMessage,
}: CartSummarySidebarProps) {
  const [isDeliveryExpanded, setIsDeliveryExpanded] = useState(true);

  const totalItemsCount = activeTab.items.length;
  const totalQuantity = activeTab.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalAmount = activeTab.items.reduce(
    (sum, item) => sum + item.quantity * (item.product.price || 0),
    0
  );

  return (
    <aside className="space-y-3 sticky top-[136px] z-20">
      <div className="bg-white rounded-2xl border border-[#17231d]/10 shadow-sm overflow-hidden flex flex-col">
        {/* Header: Tab title & Item Count */}
        <div className="p-3.5 sm:p-4 border-b border-[#17231d]/10 bg-gradient-to-r from-[#0b4f34]/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#0f7a4f] text-white flex items-center justify-center">
              <ShoppingBag size={16} />
            </span>
            <div>
              <h3 className="font-bold text-sm text-[#17231d] leading-tight">
                {activeTab.title}
              </h3>
              <p className="text-[11px] text-[#59665f]">
                {totalItemsCount} mặt hàng ({totalQuantity.toFixed(1)} ĐVT)
              </p>
            </div>
          </div>

          <span className="font-mono font-bold text-sm text-[#0f7a4f]">
            {money(subtotalAmount)}
          </span>
        </div>

        {/* Danh sách các món trong đơn (scrollable) */}
        <div className="divide-y divide-[#17231d]/5 max-h-[300px] overflow-y-auto p-2 space-y-1">
          {activeTab.items.length === 0 ? (
            <div className="py-8 text-center text-[#59665f] space-y-1">
              <p className="text-xs font-semibold text-[#17231d]">Đơn hàng này chưa có món</p>
              <p className="text-[11px] text-[#59665f]">Chọn từ danh mục hoặc tìm kiếm để thêm vào đơn.</p>
            </div>
          ) : (
            activeTab.items.map((item) => {
              const lineTotal = item.quantity * (item.product.price || 0);
              return (
                <div
                  key={item.product.id}
                  className="p-2 rounded-xl hover:bg-[#f8faf7] transition-colors space-y-1.5 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <ProductThumbnail product={item.product} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs text-[#17231d] truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[10px] text-[#59665f]">
                        {item.product.unit || 'Kg'} ·{' '}
                        {item.product.priceOnRequest ? (
                          <span className="text-[#e0742f]">Báo giá</span>
                        ) : (
                          money(item.product.price)
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.product.id)}
                      className="text-[#59665f]/40 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                      title="Xóa món"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Số lượng stepper và thành tiền dòng */}
                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1 bg-[#f5f7f3] p-0.5 rounded-lg border border-[#17231d]/10">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateQty(
                            item.product.id,
                            Math.max(0, Number((item.quantity - 1).toFixed(2)))
                          )
                        }
                        className="w-6 h-6 rounded bg-white font-bold text-xs hover:bg-rose-50 hover:text-rose-600 text-[#17231d] flex items-center justify-center cursor-pointer select-none"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0.1}
                        step="any"
                        value={item.quantity}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          onUpdateQty(item.product.id, isNaN(v) ? 0 : v);
                        }}
                        className="w-11 text-center font-bold text-xs bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateQty(
                            item.product.id,
                            Number((item.quantity + 1).toFixed(2))
                          )
                        }
                        className="w-6 h-6 rounded bg-white font-bold text-xs hover:bg-[#0f7a4f] hover:text-white text-[#0f7a4f] flex items-center justify-center cursor-pointer select-none"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right font-mono font-bold text-xs text-[#0f7a4f]">
                      {item.product.priceOnRequest ? 'Tạm tính 0đ' : money(lineTotal)}
                    </div>
                  </div>

                  {/* Ghi chú từng dòng (nếu có) */}
                  {item.note && (
                    <p className="text-[10px] text-[#0f7a4f] bg-[#0f7a4f]/5 px-2 py-0.5 rounded border border-[#0f7a4f]/15 italic">
                      📝 {item.note}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Ghi chú chung cho toàn bộ đơn hàng */}
        <div className="p-3 border-t border-[#17231d]/10 bg-[#fbfcfb]">
          <input
            type="text"
            value={activeTab.note}
            onChange={(e) => onUpdateTab((t) => ({ ...t, note: e.target.value }))}
            placeholder="Ghi chú đơn (sơ chế, giao sớm, chia bao...)"
            className="w-full bg-white border border-[#17231d]/15 rounded-xl px-3 py-2 text-xs text-[#17231d] placeholder:text-[#59665f]/60 focus:outline-none focus:border-[#0f7a4f]"
          />
        </div>

        {/* Thông tin giao nhận (Collapsible) */}
        <div className="border-t border-[#17231d]/10">
          <button
            type="button"
            onClick={() => setIsDeliveryExpanded(!isDeliveryExpanded)}
            className="w-full p-3 bg-[#f8faf7] flex items-center justify-between text-xs font-bold text-[#17231d] hover:bg-[#f3f6f3] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <MapPin size={14} className="text-[#0f7a4f]" />
              <span>Thông tin nhận hàng</span>
            </span>
            {isDeliveryExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {isDeliveryExpanded && (
            <div className="p-3.5 space-y-3 bg-white text-xs">
              {/* Ngày & Ca giao hàng */}
              <div>
                <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Ngày giao mong muốn
                </label>
                <div className="relative">
                  <Calendar
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/60"
                    size={14}
                  />
                    <input
                      type="date"
                      min={new Date().toLocaleDateString('en-CA')}
                    value={activeTab.deliveryDate}
                    onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryDate: e.target.value }))}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Khung giờ / Ca giao
                </label>
                <div className="relative">
                  <Clock
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/60"
                    size={14}
                  />
                  <select
                    value={activeTab.deliveryShift}
                    onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryShift: e.target.value }))}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-[#0f7a4f] cursor-pointer"
                  >
                    <option value="Ca sáng sớm (05:00 - 07:00)">Ca sáng sớm (05:00 - 07:00)</option>
                    <option value="Ca sáng (07:00 - 09:00)">Ca sáng (07:00 - 09:00)</option>
                    <option value="Ca trưa (09:30 - 11:00)">Ca trưa (09:30 - 11:00)</option>
                    <option value="Ca chiều (14:00 - 16:00)">Ca chiều (14:00 - 16:00)</option>
                  </select>
                </div>
              </div>

              {/* Tên & SĐT người nhận */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                    Người nhận
                  </label>
                  <div className="relative">
                    <User className="absolute left-2 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={13} />
                    <input
                      type="text"
                      value={activeTab.deliveryName}
                      onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryName: e.target.value }))}
                      placeholder="Tên người nhận"
                      className="w-full pl-7 pr-2 py-1.5 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                    SĐT nhận
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-2 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={13} />
                    <input
                      type="tel"
                      value={activeTab.deliveryPhone}
                      onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryPhone: e.target.value }))}
                      placeholder="SĐT người nhận"
                      className="w-full pl-7 pr-2 py-1.5 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f]"
                    />
                  </div>
                </div>
              </div>

              {/* Địa chỉ giao hàng */}
              <div>
                <label className="block text-[11px] font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Địa chỉ giao hàng
                </label>
                <textarea
                  rows={2}
                  value={activeTab.deliveryAddress}
                  onChange={(e) => onUpdateTab((t) => ({ ...t, deliveryAddress: e.target.value }))}
                  placeholder="Số nhà, đường, xưởng, bếp ăn..."
                  className="w-full px-2.5 py-1.5 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#0f7a4f] resize-none"
                />
              </div>

              {/* Nút dùng địa chỉ mặc định */}
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
                  className="text-[11px] text-[#0f7a4f] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <MapPin size={12} />
                  <span>Nạp lại địa chỉ mặc định của công ty</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tổng tiền & Báo lỗi & Nút Đặt hàng */}
        <div className="p-3.5 sm:p-4 bg-[#fbfcfb] border-t border-[#17231d]/10 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#59665f]">
              <span>Tổng tiền hàng:</span>
              <span className="font-mono font-semibold text-[#17231d]">{money(subtotalAmount)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-[#17231d]/10">
              <span className="text-sm font-bold text-[#17231d]">Tạm tính:</span>
              <span className="text-xl font-black font-mono text-[#0f7a4f]">
                {money(subtotalAmount)}
              </span>
            </div>
            <p className="text-[10px] text-[#59665f] flex items-center gap-1 leading-tight pt-1">
              <Info size={12} className="text-[#e0742f] shrink-0" />
              <span>Giá hiển thị theo bảng giá hiện tại. TPS1 sẽ xác nhận lại các mặt hàng cần báo giá hoặc có điều chỉnh.</span>
            </p>
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
            disabled={submitting || totalItemsCount === 0}
            className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wider bg-[#0f7a4f] hover:bg-[#0b4f34] text-white shadow-lg shadow-[#0f7a4f]/25 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer touch-target uppercase"
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
    </aside>
  );
}
