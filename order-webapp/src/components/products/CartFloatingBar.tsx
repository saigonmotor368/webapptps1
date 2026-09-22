import { ShoppingBag, ArrowRight } from 'lucide-react';
import type { OrderTab } from './OrderTabsBar';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface CartFloatingBarProps {
  activeTab: OrderTab;
  onOpenDrawer: () => void;
}

export default function CartFloatingBar({ activeTab, onOpenDrawer }: CartFloatingBarProps) {
  const count = activeTab.items.length;
  if (count === 0) return null;

  const totalQuantity = activeTab.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = activeTab.items.reduce(
    (sum, item) => sum + item.quantity * (item.product.price || 0),
    0
  );

  return (
    <div
      className="lg:hidden fixed bottom-[60px] inset-x-2 z-20 pb-[env(safe-area-inset-bottom)] pointer-events-none"
    >
      <div
        onClick={onOpenDrawer}
        className="pointer-events-auto bg-[#0b4f34] text-white rounded-2xl p-3 px-4 shadow-2xl shadow-black/30 border border-white/20 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 text-white relative">
            <ShoppingBag size={20} />
            <span className="absolute -top-1.5 -right-1.5 bg-[#e0742f] text-white text-[10px] font-mono font-bold w-5 h-5 rounded-full flex items-center justify-center shadow">
              {count}
            </span>
          </div>

          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight flex items-center gap-1.5">
              <span>{activeTab.title}</span>
              <span className="text-[11px] font-normal text-emerald-200/80">
                ({totalQuantity.toFixed(1)} ĐVT)
              </span>
            </p>
            <p className="font-mono font-extrabold text-sm text-emerald-200">
              {money(subtotal)}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="px-3.5 py-2 rounded-xl bg-white text-[#0b4f34] font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-sm"
        >
          <span>Xem &amp; Gửi đơn</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
