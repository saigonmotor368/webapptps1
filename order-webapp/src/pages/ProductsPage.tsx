import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Truck,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  PlusCircle,
  ArrowRight,
  Printer,
  ChevronDown,
} from 'lucide-react';
import { api, type Product, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface OrderItem {
  product: Product;
  quantity: number;
}

interface OrderTab {
  id: string;
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

const STORAGE_KEY = 'tps1_b2b_pos_tabs_v1';

function getTomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function createDefaultTab(index: number, session: any): OrderTab {
  const defaultShipping = session?.defaultShippingAddress;
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: `Đặt hàng ${index}`,
    items: [],
    note: '',
    deliveryDate: getTomorrowDateStr(),
    deliveryShift: 'Ca sáng sớm (05:00 - 07:00)',
    deliveryName: defaultShipping?.name || session?.name || '',
    deliveryPhone: defaultShipping?.phone || session?.phone || '',
    deliveryAddress: defaultShipping?.address || session?.address || '',
    mode: 'delivery',
  };
}

export default function ProductsPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  // Đa tab đặt hàng KiotViet style
  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [createDefaultTab(1, session)];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id || '');

  // Đảm bảo activeTabId luôn hợp lệ
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId) && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Search Autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  // Submit & Modal state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successOrder, setSuccessOrder] = useState<{ code: string; total: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Phím tắt F3 để focus ô tìm kiếm
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Xử lý tìm kiếm autocomplete (Debounced 150ms)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsDropdownOpen(false);
      return;
    }

    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.products({ search: q });
        setSearchResults(res.products || []);
        setIsDropdownOpen(true);
        setSelectedResultIndex(0);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout();
          navigate('/dang-nhap');
        }
      } finally {
        setSearchLoading(false);
      }
    }, 150);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery, logout, navigate]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !searchInputRef.current?.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Hàm cập nhật tab hiện tại
  const updateActiveTab = useCallback(
    (updater: (prev: OrderTab) => OrderTab) => {
      setTabs((prevTabs) =>
        prevTabs.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab))
      );
    },
    [activeTab.id]
  );

  // Thêm sản phẩm vào giỏ tab hiện tại
  const handleAddProduct = (product: Product, quantityToAdd: number = addQty) => {
    const qty = Math.max(0.1, Number(quantityToAdd) || 1);
    updateActiveTab((tab) => {
      const existingIdx = tab.items.findIndex((item) => item.product.id === product.id);
      if (existingIdx >= 0) {
        const updated = [...tab.items];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: Number((updated[existingIdx].quantity + qty).toFixed(2)),
        };
        return { ...tab, items: updated };
      } else {
        return {
          ...tab,
          items: [...tab.items, { product, quantity: qty }],
        };
      }
    });

    setSearchQuery('');
    setIsDropdownOpen(false);
    setAddQty(1);
    searchInputRef.current?.focus();
  };

  // Cập nhật số lượng của 1 dòng
  const handleUpdateQty = (productId: string, newQty: number) => {
    const qty = Math.max(0.1, Number(newQty) || 1);
    updateActiveTab((tab) => ({
      ...tab,
      items: tab.items.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      ),
    }));
  };

  // Xoá 1 dòng hàng
  const handleRemoveItem = (productId: string) => {
    updateActiveTab((tab) => ({
      ...tab,
      items: tab.items.filter((item) => item.product.id !== productId),
    }));
  };

  // Thêm tab đặt hàng mới
  const handleAddNewTab = () => {
    const nextNum = tabs.length + 1;
    const newT = createDefaultTab(nextNum, session);
    setTabs((prev) => [...prev, newT]);
    setActiveTabId(newT.id);
  };

  // Đóng tab
  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      // Nếu chỉ còn 1 tab thì reset giỏ của tab đó thay vì xoá
      updateActiveTab((t) => ({ ...t, items: [] }));
      return;
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
  };

  // Xử lý phím điều hướng trong dropdown
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedResultIndex]) {
        handleAddProduct(searchResults[selectedResultIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  // Tính toán tổng tiền
  const totalItemsCount = activeTab.items.length;
  const totalQuantity = activeTab.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalAmount = activeTab.items.reduce(
    (sum, item) => sum + item.quantity * (item.product.price || 0),
    0
  );
  const discountAmount = 0; // Áp dụng chiết khấu theo tier nếu có
  const finalTotalAmount = Math.max(0, subtotalAmount - discountAmount);

  // Gửi đơn hàng (Submit Order)
  const handleSubmitOrder = async () => {
    setErrorMessage('');
    if (activeTab.items.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất 1 sản phẩm vào đơn hàng');
      return;
    }
    if (!activeTab.deliveryName.trim() || !activeTab.deliveryPhone.trim() || !activeTab.deliveryAddress.trim()) {
      setErrorMessage('Vui lòng điền đầy đủ Tên người nhận, SĐT và Địa chỉ giao hàng');
      return;
    }

    setSubmitting(true);
    try {
      const fullNote = [
        activeTab.deliveryShift ? `[Giao: ${activeTab.deliveryShift}]` : '',
        activeTab.deliveryDate ? `[Ngày giao: ${activeTab.deliveryDate}]` : '',
        activeTab.note.trim(),
      ]
        .filter(Boolean)
        .join(' - ');

      const res = await api.createOrder({
        items: activeTab.items.map((it) => ({
          productId: it.product.id,
          name: it.product.name,
          quantity: it.quantity,
        })),
        deliveryName: activeTab.deliveryName.trim(),
        deliveryPhone: activeTab.deliveryPhone.trim(),
        deliveryAddress: activeTab.deliveryAddress.trim(),
        note: fullNote,
        idempotencyKey: crypto.randomUUID(),
      });

      setSuccessOrder({ code: res.orderCode, total: finalTotalAmount });

      // Reset items trong tab hiện tại
      updateActiveTab((t) => ({ ...t, items: [], note: '' }));
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Lỗi khi gửi đơn hàng, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ========================================================================= */}
      {/* THANH TOP BAR: Ô TÌM KIẾM HÀNG HÓA F3 & HỆ THỐNG ĐA TAB KIOTVIET */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-[#14231c]/10 shadow-sm p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Khối tìm kiếm F3 */}
        <div className="relative flex-1 max-w-2xl flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#59665f]/50" size={18} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => {
                if (searchResults.length > 0) setIsDropdownOpen(true);
              }}
              placeholder="Tìm hàng hóa theo tên hoặc mã SKU (F3)..."
              className="w-full pl-10 pr-8 py-2.5 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-sm font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0070f3]/25 focus:border-[#0070f3] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#59665f]/40 hover:text-[#59665f] p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Ô nhập số lượng nhanh trước khi chọn */}
          <div className="flex items-center gap-1 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl px-2 py-1.5 shrink-0">
            <span className="text-xs text-[#59665f] font-medium hidden sm:inline">SL:</span>
            <input
              type="number"
              min={0.1}
              step={1}
              value={addQty}
              onChange={(e) => setAddQty(Math.max(0.1, parseFloat(e.target.value) || 1))}
              className="w-12 bg-transparent text-center text-sm font-bold text-[#14231c] focus:outline-none"
            />
          </div>

          {/* DROPDOWN XỔ XUỐNG KHI TÌM KIẾM (KIOTVIET DROPOUT LIST) */}
          {isDropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-2xl border border-[#14231c]/15 z-50 overflow-hidden max-h-[380px] overflow-y-auto"
            >
              {searchLoading ? (
                <div className="py-6 text-center text-sm text-[#59665f] flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#0070f3] border-t-transparent rounded-full animate-spin" />
                  <span>Đang tìm kiếm hàng hóa...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-6 text-center text-sm text-[#59665f]">
                  Không tìm thấy mặt hàng nào khớp với <span className="font-semibold">"{searchQuery}"</span>
                </div>
              ) : (
                <div className="divide-y divide-[#14231c]/5">
                  <div className="bg-[#f8faf7] px-3.5 py-2 text-[11px] font-bold text-[#59665f] uppercase tracking-wider flex justify-between">
                    <span>Mã / Tên sản phẩm</span>
                    <span>ĐVT • Đơn giá</span>
                  </div>
                  {searchResults.map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      onMouseEnter={() => setSelectedResultIndex(idx)}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        idx === selectedResultIndex
                          ? 'bg-[#0070f3]/10 text-[#0070f3]'
                          : 'hover:bg-[#f6f7f4] text-[#14231c]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold bg-[#14231c]/5 px-1.5 py-0.5 rounded text-[#59665f]">
                            {p.sku || 'N/A'}
                          </span>
                          <span className="text-sm font-semibold truncate">{p.name}</span>
                        </div>
                        {p.category && (
                          <span className="text-[11px] text-[#59665f] mt-0.5 block">
                            Nhóm: {p.category}
                          </span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-[#0f6f4b]">
                          {p.priceOnRequest ? (
                            <span className="text-amber-600 text-xs">Liên hệ báo giá</span>
                          ) : (
                            money(p.price)
                          )}
                        </div>
                        <div className="text-xs text-[#59665f] mt-0.5 font-medium">
                          {p.unit || 'Kg'} • <span className="text-emerald-700">Nhận đặt hàng</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hệ thống Tab Đặt hàng 1, Đặt hàng 2, + */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shrink-0 border ${
                  isActive
                    ? 'bg-[#0070f3] text-white border-[#0070f3] shadow-sm shadow-[#0070f3]/30'
                    : 'bg-[#f8faf7] text-[#59665f] border-[#14231c]/10 hover:bg-[#eaece8]'
                }`}
              >
                <span>{tab.title}</span>
                {tab.items.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-white text-[#0070f3]' : 'bg-[#14231c]/10 text-[#14231c]'
                    }`}
                  >
                    {tab.items.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className={`p-0.5 rounded-full hover:bg-black/10 transition-colors ${
                    isActive ? 'text-white/80 hover:text-white' : 'text-[#59665f]'
                  }`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddNewTab}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-[#0070f3] bg-[#0070f3]/10 hover:bg-[#0070f3]/20 transition-colors shrink-0"
            title="Mở thêm tab đặt hàng mới"
          >
            <Plus size={14} />
            <span>Thêm đơn</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VÙNG LÀM VIỆC CHÍNH: 2 CỘT (BẢNG HÀNG HÓA 68% + GIAO HÀNG & CHỐT ĐƠN 32%) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* --------------------------------------------------------------------- */}
        {/* CỘT TRÁI: BẢNG DANH SÁCH MẶT HÀNG DẠNG CỘT KIOTVIET (8/12) */}
        {/* --------------------------------------------------------------------- */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-[#14231c]/10 shadow-sm flex flex-col min-h-[560px] overflow-hidden">
          {/* Header Bảng cột */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[620px]">
              <thead>
                <tr className="bg-[#f8faf7] border-b border-[#14231c]/10 text-[12px] font-bold text-[#59665f] uppercase tracking-wider">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-3 w-28">Mã hàng</th>
                  <th className="py-3 px-3">Tên hàng hóa</th>
                  <th className="py-3 px-3 w-20 text-center">ĐVT</th>
                  <th className="py-3 px-3 w-32 text-center">Số lượng</th>
                  <th className="py-3 px-3 w-28 text-right">Đơn giá</th>
                  <th className="py-3 px-3 w-32 text-right">Thành tiền</th>
                  <th className="py-3 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14231c]/5 text-sm font-medium">
                {activeTab.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-[#59665f]">
                      <div className="w-16 h-16 rounded-full bg-[#f6f7f4] flex items-center justify-center mx-auto mb-3 text-[#59665f]/40">
                        <Search size={28} />
                      </div>
                      <p className="font-semibold text-base text-[#14231c]">
                        Chưa có mặt hàng nào trong đơn này
                      </p>
                      <p className="text-xs text-[#59665f] mt-1 max-w-sm mx-auto">
                        Gõ tên hoặc mã hàng vào ô tìm kiếm ở trên (hoặc bấm <span className="font-bold text-[#0070f3]">F3</span>) để thêm hàng hóa nhanh chóng.
                      </p>
                    </td>
                  </tr>
                ) : (
                  activeTab.items.map((item, idx) => {
                    const lineTotal = item.quantity * (item.product.price || 0);
                    return (
                      <tr
                        key={item.product.id}
                        className="hover:bg-[#fbfcfb] transition-colors group"
                      >
                        {/* STT */}
                        <td className="py-3 px-3 text-center text-xs text-[#59665f] font-mono">
                          {idx + 1}
                        </td>

                        {/* Mã hàng SKU */}
                        <td className="py-3 px-3 text-xs font-mono font-bold text-[#59665f]">
                          {item.product.sku || '—'}
                        </td>

                        {/* Tên hàng hóa */}
                        <td className="py-3 px-3 font-semibold text-[#14231c]">
                          <div className="line-clamp-1">{item.product.name}</div>
                          {item.product.category && (
                            <span className="text-[10px] text-[#59665f] font-normal">
                              {item.product.category}
                            </span>
                          )}
                        </td>

                        {/* ĐVT */}
                        <td className="py-3 px-3 text-center text-xs text-[#59665f] font-semibold">
                          <span className="px-2 py-0.5 bg-[#f6f7f4] rounded-md border border-[#14231c]/5">
                            {item.product.unit || 'Kg'}
                          </span>
                        </td>

                        {/* Số lượng (+ / -) */}
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, item.quantity - 1)}
                              className="w-7 h-7 rounded-lg bg-[#f6f7f4] hover:bg-[#eaece8] text-[#14231c] flex items-center justify-center font-bold text-sm select-none"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={0.1}
                              step={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateQty(item.product.id, parseFloat(e.target.value) || 0)
                              }
                              className="w-14 text-center font-bold py-1 border border-[#14231c]/15 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0070f3]"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, item.quantity + 1)}
                              className="w-7 h-7 rounded-lg bg-[#f6f7f4] hover:bg-[#eaece8] text-[#14231c] flex items-center justify-center font-bold text-sm select-none"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Đơn giá */}
                        <td className="py-3 px-3 text-right font-mono text-sm text-[#59665f]">
                          {item.product.priceOnRequest ? (
                            <span className="text-amber-600 text-xs font-sans">Liên hệ báo giá</span>
                          ) : (
                            money(item.product.price)
                          )}
                        </td>

                        {/* Thành tiền */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-sm text-[#0f6f4b]">
                          {item.product.priceOnRequest ? (
                            <span className="text-xs text-amber-600 font-sans">Tạm tính 0đ</span>
                          ) : (
                            money(lineTotal)
                          )}
                        </td>

                        {/* Xóa dòng */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.product.id)}
                            className="text-[#59665f]/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Xóa mặt hàng này"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Dòng tóm tắt & Ghi chú dưới chân bảng */}
          <div className="bg-[#f8faf7] border-t border-[#14231c]/10 p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Ghi chú đơn hàng */}
            <div className="flex-1">
              <input
                type="text"
                value={activeTab.note}
                onChange={(e) => updateActiveTab((t) => ({ ...t, note: e.target.value }))}
                placeholder="Ghi chú đơn hàng (ví dụ: sơ chế sẵn, chia 2 phần, giao đúng giờ...)"
                className="w-full bg-white border border-[#14231c]/15 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#0070f3]"
              />
            </div>

            {/* Thống kê tiền */}
            <div className="flex items-center gap-6 shrink-0 text-sm">
              <div>
                <span className="text-[#59665f] text-xs">Tổng mặt hàng:</span>{' '}
                <span className="font-bold text-[#14231c]">{totalItemsCount}</span> (
                <span className="font-bold text-[#0f6f4b]">{totalQuantity.toFixed(1)}</span> ĐVT)
              </div>
              <div>
                <span className="text-[#59665f] text-xs">Tổng tiền hàng:</span>{' '}
                <span className="font-mono font-bold text-[#14231c]">{money(subtotalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------------------- */}
        {/* CỘT PHẢI: GIAO HÀNG, THÔNG TIN KHÁCH HÀNG & NÚT ĐẶT HÀNG (4/12) */}
        {/* --------------------------------------------------------------------- */}
        <div className="lg:col-span-4 space-y-3">
          {/* Card Thông tin khách hàng & Giao nhận */}
          <div className="bg-white rounded-2xl border border-[#14231c]/10 shadow-sm p-4 space-y-3.5">
            {/* Header thông tin khách */}
            <div className="flex items-center justify-between pb-3 border-b border-[#14231c]/10">
              <div>
                <span className="text-xs text-[#59665f] font-medium block">Khách hàng đặt</span>
                <p className="font-bold text-sm text-[#14231c] truncate">
                  {session?.name || session?.company || 'Khách hàng VIP'}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 text-xs font-bold border border-emerald-500/20 font-mono">
                {session?.code}
              </span>
            </div>

            {/* Thông tin nhận hàng */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Ngày giao hàng mong muốn
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={15} />
                  <input
                    type="date"
                    value={activeTab.deliveryDate}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryDate: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Khung giờ / Ca giao hàng
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#59665f]/60" size={15} />
                  <select
                    value={activeTab.deliveryShift}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryShift: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white cursor-pointer"
                  >
                    <option value="Ca sáng sớm (05:00 - 07:00)">Ca sáng sớm (05:00 - 07:00)</option>
                    <option value="Ca sáng (07:00 - 09:00)">Ca sáng (07:00 - 09:00)</option>
                    <option value="Ca trưa (09:30 - 11:00)">Ca trưa (09:30 - 11:00)</option>
                    <option value="Ca chiều (14:00 - 16:00)">Ca chiều (14:00 - 16:00)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                    Người nhận
                  </label>
                  <input
                    type="text"
                    value={activeTab.deliveryName}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryName: e.target.value }))}
                    placeholder="Tên người nhận"
                    className="w-full px-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={activeTab.deliveryPhone}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryPhone: e.target.value }))}
                    placeholder="SĐT người nhận"
                    className="w-full px-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#59665f] uppercase tracking-wider mb-1">
                  Địa chỉ giao hàng chi tiết
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 text-[#59665f]/60" size={15} />
                  <textarea
                    rows={2}
                    value={activeTab.deliveryAddress}
                    onChange={(e) => updateActiveTab((t) => ({ ...t, deliveryAddress: e.target.value }))}
                    placeholder="Số nhà, đường, xưởng, bếp ăn..."
                    className="w-full pl-9 pr-3 py-2 bg-[#f8faf7] border border-[#14231c]/15 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Tổng kết tiền đơn hàng */}
            <div className="pt-3 border-t border-[#14231c]/10 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#59665f]">
                <span>Tổng tiền hàng:</span>
                <span className="font-mono font-semibold text-[#14231c]">{money(subtotalAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#59665f]">
                <span>Giảm giá / Chiết khấu:</span>
                <span className="font-mono font-semibold text-[#14231c]">{money(discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#14231c]/10">
                <span className="text-sm font-bold text-[#14231c]">Khách cần trả:</span>
                <span className="text-xl font-black font-mono text-[#0070f3]">
                  {money(finalTotalAmount)}
                </span>
              </div>
              <p className="text-[11px] text-[#59665f]/80 text-right">
                *(Tạm tính — Sale sẽ chốt giá thực tế theo biến động giá tươi trong ngày)
              </p>
            </div>

            {/* Báo lỗi nếu có */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* NÚT ĐẶT HÀNG XANH DƯƠNG CHUẨN KIOTVIET */}
            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={submitting || activeTab.items.length === 0}
              className="w-full py-4 rounded-xl font-black text-base tracking-wider bg-[#0070f3] hover:bg-[#005bb5] text-white shadow-lg shadow-[#0070f3]/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase"
            >
              {submitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>ĐANG GỬI ĐƠN HÀNG...</span>
                </>
              ) : (
                <>
                  <span>ĐẶT HÀNG</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* THANH TRẠNG THÁI CHÂN TRANG (KIOTVIET BOTTOM BAR) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-[#14231c]/10 p-2.5 px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#59665f]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-bold text-[#0070f3]">
            <Truck size={14} /> Bán giao hàng
          </span>
          <span className="text-[#14231c]/20">|</span>
          <span>⚡ Nhận mọi đơn đặt hàng thực phẩm tươi</span>
          <span className="text-[#14231c]/20">|</span>
          <span className="hidden md:inline">Phím tắt: <kbd className="px-1.5 py-0.5 bg-[#f6f7f4] border border-[#14231c]/10 rounded font-mono font-bold">F3</kbd> Tìm hàng hóa</span>
        </div>

        <div className="flex items-center gap-4">
          <span>Hỗ trợ đặt hàng: <strong className="text-[#14231c]">089 890 2222</strong></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL THÔNG BÁO TẠO ĐƠN THÀNH CÔNG */}
      {/* ========================================================================= */}
      {successOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-7 max-w-md w-full shadow-2xl border border-[#14231c]/10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#14231c]">Gửi đơn đặt hàng thành công!</h3>
              <p className="text-sm text-[#59665f] mt-1">
                Mã đơn hàng của bạn:{' '}
                <span className="font-mono font-bold text-[#0070f3] text-base">{successOrder.code}</span>
              </p>
            </div>

            <p className="text-xs text-[#59665f] leading-relaxed bg-[#f8faf7] p-3 rounded-xl border border-[#14231c]/5">
              Đơn hàng đã được chuyển tới bộ phận Bán hàng &amp; Thu mua TPS1 để chuẩn bị và sắp xếp xe lạnh giao theo đúng ca hẹn của bạn.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSuccessOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#14231c]/15 text-[#14231c] text-xs font-bold hover:bg-[#f6f7f4] transition-colors"
              >
                Tiếp tục lên đơn khác
              </button>
              <button
                type="button"
                onClick={() => navigate('/don-hang')}
                className="flex-1 py-2.5 rounded-xl bg-[#0070f3] hover:bg-[#005bb5] text-white text-xs font-bold transition-colors"
              >
                Xem đơn hàng của tôi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
