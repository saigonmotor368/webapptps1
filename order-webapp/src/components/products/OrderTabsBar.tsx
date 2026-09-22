import React from 'react';
import { Plus, X, ShoppingBag } from 'lucide-react';

export interface OrderItem {
  product: import('../../lib/api').Product;
  quantity: number;
  note?: string;
}

export interface OrderTab {
  id: string;
  idempotencyKey: string;
  title: string;
  items: OrderItem[];
  note: string;
  deliveryDate: string;
  deliveryShift: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  mode: 'delivery' | 'pickup';
}

interface OrderTabsBarProps {
  tabs: OrderTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string, e: React.MouseEvent) => void;
}

export default function OrderTabsBar({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
}: OrderTabsBarProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const count = tab.items.length;
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shrink-0 border ${
              isActive
                ? 'bg-[#0f7a4f] text-white border-[#0f7a4f] shadow-sm shadow-[#0f7a4f]/25'
                : 'bg-white text-[#59665f] border-[#17231d]/10 hover:bg-[#eaece8] hover:text-[#17231d]'
            }`}
          >
            <ShoppingBag size={13} className={isActive ? 'text-white' : 'text-[#0f7a4f]'} />
            <span>{tab.title}</span>

            {count > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  isActive ? 'bg-white text-[#0f7a4f]' : 'bg-[#0f7a4f]/10 text-[#0f7a4f]'
                }`}
              >
                {count}
              </span>
            )}

            <button
              type="button"
              onClick={(e) => onCloseTab(tab.id, e)}
              className={`p-0.5 rounded-full transition-colors cursor-pointer ${
                isActive
                  ? 'text-white/70 hover:text-white hover:bg-white/20'
                  : 'text-[#59665f]/60 hover:text-red-600 hover:bg-red-50'
              }`}
              title={tabs.length > 1 ? 'Đóng tab này' : 'Làm trống đơn này'}
              aria-label="Đóng đơn"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAddTab}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#0f7a4f] bg-[#0f7a4f]/10 hover:bg-[#0f7a4f]/18 border border-[#0f7a4f]/20 transition-all active:scale-95 shrink-0 cursor-pointer"
        title="Thêm đơn hàng mới cho bếp khác hoặc ca khác"
      >
        <Plus size={14} strokeWidth={2.5} />
        <span>Thêm đơn</span>
      </button>
    </div>
  );
}
