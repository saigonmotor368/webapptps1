import React from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import type { Product } from '../../lib/api';
import ProductThumbnail from './ProductThumbnail';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface ProductSearchBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  addQty: number;
  onAddQtyChange: (val: number) => void;
  searchResults: Product[];
  searchLoading: boolean;
  isDropdownOpen: boolean;
  onOpenDropdown: () => void;
  onCloseDropdown: () => void;
  selectedResultIndex: number;
  onSelectIndex: (idx: number) => void;
  onAddProduct: (product: Product, qty?: number) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export default function ProductSearchBar({
  searchQuery,
  onSearchChange,
  addQty,
  onAddQtyChange,
  searchResults,
  searchLoading,
  isDropdownOpen,
  onOpenDropdown,
  selectedResultIndex,
  onSelectIndex,
  onAddProduct,
  searchInputRef,
  dropdownRef,
  onKeyDown,
}: ProductSearchBarProps) {
  return (
    <div className="relative flex-1 flex items-center gap-2">
      {/* Ô tìm kiếm hàng hóa */}
      <div className="relative flex-1">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#59665f]/50 pointer-events-none"
          size={18}
        />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onOpenDropdown}
          placeholder="Tìm hàng hóa theo tên, mã SKU, nhóm hàng (F3)..."
          className="w-full pl-10 pr-9 py-2.5 bg-[#f8faf7] border border-[#17231d]/12 rounded-xl text-sm font-medium text-[#17231d] placeholder:text-[#59665f]/55 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0f7a4f]/25 focus:border-[#0f7a4f] transition-all"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/50 hover:text-[#17231d] p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Xóa tìm kiếm"
          >
            <X size={15} />
          </button>
        ) : (
          <kbd className="hidden sm:inline absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#17231d]/5 text-[#59665f]/60 border border-[#17231d]/10 pointer-events-none">
            F3
          </kbd>
        )}
      </div>

      {/* Ô nhập số lượng nhanh trước khi chọn */}
      <div
        className="flex items-center gap-1 bg-[#f8faf7] border border-[#17231d]/12 rounded-xl px-2 py-1.5 shrink-0"
        title="Số lượng mặc định khi bấm Enter hoặc chọn sản phẩm"
      >
        <span className="text-xs text-[#59665f] font-semibold hidden sm:inline">SL:</span>
        <input
          type="number"
          min={0.1}
          step="any"
          value={addQty}
          onChange={(e) => onAddQtyChange(Math.max(0.1, parseFloat(e.target.value) || 1))}
          className="w-12 bg-transparent text-center text-sm font-bold text-[#17231d] focus:outline-none"
          aria-label="Số lượng thêm nhanh"
        />
      </div>

      {/* Dropdown kết quả tìm kiếm */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-[#17231d]/15 z-50 overflow-hidden max-h-[380px] overflow-y-auto"
        >
          {searchLoading ? (
            <div className="py-7 text-center text-sm text-[#59665f] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 text-[#0f7a4f] animate-spin" />
              <span>Đang tra cứu danh mục hàng hóa...</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-7 px-4 text-center text-sm text-[#59665f]">
              Không tìm thấy sản phẩm nào khớp với <span className="font-bold text-[#17231d]">"{searchQuery}"</span>
            </div>
          ) : (
            <div className="divide-y divide-[#17231d]/5">
              <div className="bg-[#f8faf7] px-3.5 py-2 text-[11px] font-bold text-[#59665f] uppercase tracking-wider flex justify-between">
                <span>Hình ảnh • Mã SKU • Tên mặt hàng</span>
                <span>ĐVT • Giá khách hàng</span>
              </div>
              {searchResults.map((p, idx) => {
                const isSelected = idx === selectedResultIndex;
                return (
                  <div
                    key={p.id}
                    onClick={() => onAddProduct(p, addQty)}
                    onMouseEnter={() => onSelectIndex(idx)}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#0f7a4f]/10 text-[#0b4f34]'
                        : 'hover:bg-[#f5f7f3] text-[#17231d]'
                    }`}
                  >
                    <ProductThumbnail product={p} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {p.sku && (
                          <span className="text-xs font-mono font-bold bg-[#17231d]/5 px-1.5 py-0.5 rounded text-[#59665f]">
                            {p.sku}
                          </span>
                        )}
                        <span className="text-sm font-semibold truncate">{p.name}</span>
                      </div>
                      {p.category && (
                        <span className="text-[11px] text-[#59665f] mt-0.5 block">
                          Nhóm: {p.category}
                        </span>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-[#0f7a4f]">
                        {p.priceOnRequest ? (
                          <span className="text-[#e0742f] text-xs font-semibold">Liên hệ báo giá</span>
                        ) : (
                          money(p.price)
                        )}
                      </div>
                      <div className="text-xs text-[#59665f] mt-0.5 font-medium">
                        {p.unit || 'Kg'} • <span className="text-emerald-700 font-semibold">Nhận đặt</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
