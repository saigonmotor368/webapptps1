import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, ShoppingCart, Plus, Minus, X, Upload, ImageOff, CheckCircle2, Trash2, ChevronRight, PlusCircle, Truck,
} from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

interface Product {
  id: string; sku: string; name: string; category: string | null;
  unit: string; imageUrl: string | null; price: number; priceOnRequest?: boolean; available: boolean;
}
interface CartLine { product: Product; quantity: number }

// Nhiều khách (đặc biệt tổ bếp/nhà máy) cần đặt NHIỀU đơn riêng biệt cùng
// lúc (VD: đơn cho bếp sáng, đơn cho bếp trưa...) — trước đây chỉ có 1 giỏ
// hàng duy nhất. Giờ dùng đúng khái niệm "tab đơn hàng" như màn Bán hàng của
// nhân viên (PosCreatePage) để khách tự quản lý nhiều đơn cùng lúc.
interface OrderTab {
  id: string;
  cart: Record<string, CartLine>;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  note: string;
}

// Khách B2B chỉ giao tới địa chỉ đã ký hợp đồng — nạp sẵn tên/SĐT người nhận
// + địa chỉ mặc định của khách vào mỗi tab đơn mới, không để trống bắt gõ
// tay như trước (yêu cầu 2026-09-11).
function newTab(defaultName: string, defaultPhone: string, defaultAddress = ''): OrderTab {
  return {
    id: (crypto as any).randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    cart: {},
    deliveryName: defaultName,
    deliveryPhone: defaultPhone,
    deliveryAddress: defaultAddress,
    note: '',
  };
}

const TABS_STORAGE_KEY = 'tps1_customer_order_tabs';

// Giai đoạn E — trang "Đặt hàng" cho khách hàng tự lên đơn trực tiếp trong
// sale-webapp. Bố cục 3 cột + nhiều tab đơn giống hệt màn Bán hàng (POS) của
// nhân viên (PosCreatePage) để khách quen tay dễ nhìn, đặt được nhiều đơn
// cùng lúc (yêu cầu 2026-09-11: "khách này tổ bếp nên có thể đặt nhiều đơn
// giống nhân viên luôn"). Theo đúng theme thật của TPS1 (xanh rêu đậm
// #0f6f4b, nền kem, font Be Vietnam Pro).
export default function DatHangPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 24;

  const defaultShipping = user?.defaultShippingAddress;
  const newTabForUser = useCallback(
    () => newTab(defaultShipping?.name || user?.name || '', defaultShipping?.phone || user?.phone || '', defaultShipping?.address || ''),
    [defaultShipping, user?.name, user?.phone]
  );

  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    try {
      const saved = sessionStorage.getItem(TABS_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((t: Partial<OrderTab>) => ({ ...newTabForUser(), ...t }));
    } catch { /* ignore */ }
    return [newTabForUser()];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const updateActiveTab = useCallback((patch: Partial<OrderTab> | ((t: OrderTab) => Partial<OrderTab>)) => {
    setTabs((prev) => prev.map((t) => (t.id !== activeTabId ? t : { ...t, ...(typeof patch === 'function' ? patch(t) : patch) })));
  }, [activeTabId]);

  const addTab = () => {
    const t = newTabForUser();
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  };
  const closeTab = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab && Object.keys(tab.cart).length > 0 && !confirm('Đóng đơn này? Sản phẩm đã chọn sẽ bị mất.')) return;
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) { const t = newTabForUser(); return [t]; }
      return next;
    });
    setActiveTabId((prev) => {
      if (prev !== id) return prev;
      const remaining = tabs.filter((t) => t.id !== id);
      return remaining.length ? remaining[0].id : tabs[0].id;
    });
  };

  const [submitting, setSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState('');

  useEffect(() => {
    fetch(`${apiBase}/api/customer/products?meta=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { if (data.ok) setCategories(data.categories || []); });
  }, [apiBase, token]);

  // Trước đây lỗi (vd phiên hết hạn) bị nuốt âm thầm, chỉ hiện "không có sản
  // phẩm nào" khiến khách tưởng hệ thống trống hàng — giờ hiện rõ lỗi thật,
  // và tự đăng xuất nếu phiên hết hạn để khách đăng nhập lại ngay.
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      const res = await fetch(`${apiBase}/api/customer/products?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) {
        setProducts(data.products || []);
        setTotal(data.total || 0);
      } else if (res.status === 401) {
        alert(data.error || 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
        logout();
      } else {
        setLoadError(data.error || 'Không tải được sản phẩm');
      }
    } catch {
      setLoadError('Không kết nối được tới máy chủ, vui lòng thử lại');
    } finally { setLoading(false); }
  }, [apiBase, token, page, search, category, logout]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // B2B thường đặt số lượng lớn ngay từ đầu (vd 50kg) — cho gõ số lượng
  // TRƯỚC khi thêm thay vì bấm + từng đơn vị một (yêu cầu 2026-09-11).
  const [pendingQty, setPendingQty] = useState<Record<string, number>>({});
  const getPendingQty = (productId: string) => pendingQty[productId] ?? 1;
  const setPendingQtyFor = (productId: string, qty: number) => setPendingQty((prev) => ({ ...prev, [productId]: Math.max(1, qty) }));

  const addToCart = (p: Product, qty = 1) => {
    updateActiveTab((t) => {
      const existing = t.cart[p.id];
      return { cart: { ...t.cart, [p.id]: { product: p, quantity: (existing?.quantity || 0) + qty } } };
    });
    setPendingQty((prev) => ({ ...prev, [p.id]: 1 }));
  };
  const setQty = (productId: string, qty: number) => {
    updateActiveTab((t) => {
      if (qty <= 0) { const next = { ...t.cart }; delete next[productId]; return { cart: next }; }
      return { cart: { ...t.cart, [productId]: { ...t.cart[productId], quantity: qty } } };
    });
  };

  const cartLines = Object.values(activeTab.cart);
    // const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartTotal = useMemo(() => cartLines.reduce((s, l) => s + l.quantity * l.product.price, 0), [cartLines]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const submitOrder = async () => {
    const { deliveryName, deliveryPhone, deliveryAddress, note } = activeTab;
    if (!deliveryAddress.trim() || !deliveryName.trim() || !deliveryPhone.trim()) {
      alert('Vui lòng nhập đầy đủ tên, số điện thoại và địa chỉ giao hàng'); return;
    }
    if (cartLines.length === 0) { alert('Vui lòng chọn sản phẩm'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/customer/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'zalo_mini_app', // dùng chung đường token-trong-body, xem app/api/customer/order/route.ts
          orderSessionToken: token,
          items: cartLines.map((l) => ({ productId: l.product.id, name: l.product.name, quantity: l.quantity })),
          deliveryType: 'shipping',
          deliveryAlias: 'Địa chỉ giao hàng',
          deliveryName, deliveryPhone, deliveryAddress,
          note,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSuccessCode(data.orderCode);
      // Đơn xong -> đóng tab này (giống nhân viên đóng tab khi hoàn tất).
      closeTab(activeTab.id);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không đặt được đơn hàng'));
    } finally { setSubmitting(false); }
  };

  if (successCode) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-lg border border-[#14231c]/10 p-10 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#0f6f4b]/10 text-[#0f6f4b] flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="text-xl font-bold text-[#14231c]">Đặt hàng thành công!</h2>
          <p className="text-[#59665f]">Mã đơn <span className="font-semibold text-[#0f6f4b]">{successCode}</span> đã được gửi tới TPS1. Nhân viên sẽ liên hệ xác nhận giá và thời gian giao hàng.</p>
          <div className="flex gap-3 justify-center pt-2">
            <button onClick={() => setSuccessCode('')} className="px-5 py-2.5 rounded-xl border border-[#14231c]/15 text-[#14231c] font-medium hover:bg-[#f6f7f4]">
              Đặt thêm đơn khác
            </button>
            <button onClick={() => navigate('/don-hang-cua-toi')} className="px-5 py-2.5 rounded-xl bg-[#0f6f4b] text-white font-medium hover:bg-[#0b5a3c]">
              Xem đơn hàng của tôi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-brand" style={{ fontFamily: 'var(--font-brand)' }}>
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#14231c]">Đặt hàng</h1>
          <p className="text-[#59665f] text-sm">
            Xin chào {user?.name}{user?.tier ? ` · Hạng ${user.tier}` : ''} — có thể mở nhiều đơn cùng lúc như bên dưới
          </p>
        </div>
        <button onClick={() => navigate('/dat-hang/excel')}
          className="px-4 py-2.5 rounded-xl border border-[#0f6f4b]/30 text-[#0f6f4b] font-medium hover:bg-[#0f6f4b]/5 flex items-center gap-2 text-sm self-start">
          <Upload size={16} /> Đặt hàng từ Excel
        </button>
      </header>

      {/* Tabs — mở nhiều đơn cùng lúc, giống màn Bán hàng của nhân viên */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t, idx) => {
          const count = Object.values(t.cart).reduce((s, l) => s + l.quantity, 0);
          const isActive = t.id === activeTabId;
          return (
            <button key={t.id} onClick={() => setActiveTabId(t.id)}
              className={`shrink-0 flex items-center gap-2 pl-3.5 pr-2 py-2 rounded-xl text-sm font-medium border transition-colors ${isActive ? 'bg-[#0f6f4b] border-[#0f6f4b] text-white shadow-sm' : 'bg-white border-[#14231c]/10 text-[#59665f] hover:border-[#0f6f4b]/40'}`}>
              <span className="max-w-[100px] truncate">Đơn {idx + 1}</span>
              {count > 0 && (
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${isActive ? 'bg-white/20' : 'bg-[#0f6f4b]/10 text-[#0f6f4b]'}`}>{count}</span>
              )}
              <span onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                className={`rounded-full p-0.5 ${isActive ? 'hover:bg-white/20' : 'hover:bg-[#14231c]/5'}`}>
                <X size={13} />
              </span>
            </button>
          );
        })}
        <button onClick={addTab} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-dashed border-[#14231c]/20 text-[#59665f] hover:border-[#0f6f4b]/50 hover:text-[#0f6f4b] transition-colors">
          <PlusCircle size={16} /> Đơn mới
        </button>
      </div>

      {/* 3 cột như màn Bán hàng nhân viên: tìm sản phẩm (2 cột) + giỏ hàng/giao hàng (1 cột) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Search + categories */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#59665f]" size={18} />
              <input
                type="text" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Tìm sản phẩm..."
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-[#14231c]/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20 focus:border-[#0f6f4b]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <button onClick={() => { setCategory(''); setPage(0); }}
                className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${category === '' ? 'bg-[#0f6f4b] text-white border-[#0f6f4b]' : 'bg-white text-[#59665f] border-[#14231c]/10 hover:border-[#0f6f4b]/40'}`}>
                Tất cả
              </button>
              {categories.map((c) => (
                <button key={c} onClick={() => { setCategory(c); setPage(0); }}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${category === c ? 'bg-[#0f6f4b] text-white border-[#0f6f4b]' : 'bg-white text-[#59665f] border-[#14231c]/10 hover:border-[#0f6f4b]/40'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Danh sách sản phẩm dạng list (không phải lưới ảnh) — dễ nhìn/dễ
              quét hơn khi cần chọn nhiều mặt hàng, giống đúng kiểu tìm & thêm
              sản phẩm bên màn Bán hàng của nhân viên (mục brief 2026-09-11). */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-[#14231c]/8 divide-y divide-[#14231c]/5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse bg-[#f6f7f4]/60" />
              ))}
            </div>
          ) : loadError ? (
            <div className="bg-white rounded-2xl border border-[#c7372f]/20 py-16 text-center space-y-3">
              <p className="text-[#c7372f] text-sm">{loadError}</p>
              <button onClick={fetchProducts} className="px-4 py-2 rounded-xl bg-[#0f6f4b] text-white text-sm font-medium hover:bg-[#0b5a3c]">Thử lại</button>
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#14231c]/8 py-20 text-center text-[#59665f]">Không tìm thấy sản phẩm nào</div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-[#14231c]/8 divide-y divide-[#14231c]/5 overflow-hidden">
                {products.map((p) => {
                  const inCart = activeTab.cart[p.id]?.quantity || 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f6f7f4]/60 transition-colors">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-11 h-11 rounded-lg object-cover shrink-0 border border-[#14231c]/8" />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-[#f6f7f4] shrink-0 flex items-center justify-center text-[#59665f]/40"><ImageOff size={18} /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#14231c] truncate">{p.name}</p>
                        <p className="text-xs text-[#59665f]">{p.unit}</p>
                      </div>
                      <div className="text-right shrink-0 w-24">
                        {p.priceOnRequest ? (
                          <span className="font-semibold text-[#f5c84c] bg-[#14231c] inline-block px-2 py-0.5 rounded-md text-[11px]">Liên hệ giá</span>
                        ) : (
                          <span className="font-bold text-[#0f6f4b] text-sm">{money(p.price)}</span>
                        )}
                      </div>
                      <div className="shrink-0 flex justify-end">
                        {inCart > 0 ? (
                          <div className="flex items-center gap-1.5 bg-[#f6f7f4] rounded-lg p-1">
                            <button onClick={() => setQty(p.id, inCart - 1)} className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-[#0f6f4b] shadow-sm"><Minus size={12} /></button>
                            <span className="w-6 text-center text-sm font-semibold text-[#14231c]">{inCart}</span>
                            <button onClick={() => setQty(p.id, inCart + 1)} className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-[#0f6f4b] shadow-sm"><Plus size={12} /></button>
                          </div>
                        ) : (
                          // Không chặn theo tồn kho: khách cứ đặt bình thường
                          // kể cả hết hàng, sale sẽ thấy cảnh báo + nhập hàng
                          // ngay khi xử lý đơn (yêu cầu 2026-09-11). Có ô nhập
                          // SL trước khi thêm vì là khách B2B, hay đặt số
                          // lượng lớn ngay từ đầu, không muốn bấm + nhiều lần.
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min="1" step="1" value={getPendingQty(p.id)}
                              onChange={(e) => setPendingQtyFor(p.id, Math.round(Number(e.target.value)) || 1)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-14 border border-[#14231c]/15 rounded-lg px-1.5 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20" />
                            <button onClick={() => addToCart(p, getPendingQty(p.id))}
                              className="px-3 py-1.5 rounded-lg bg-[#0f6f4b] text-white text-xs font-medium hover:bg-[#0b5a3c] flex items-center justify-center gap-1">
                              <Plus size={13} /> Thêm
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1.5 rounded-lg border border-[#14231c]/10 text-sm text-[#59665f] disabled:opacity-40">Trước</button>
                  <span className="text-sm text-[#59665f]">Trang {page + 1}/{totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 rounded-lg border border-[#14231c]/10 text-sm text-[#59665f] disabled:opacity-40">Sau</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Cột giỏ hàng + giao hàng — luôn hiện, không phải drawer trượt ra nữa */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-[#14231c]/8 overflow-hidden sticky top-4">
            <div className="p-4 border-b border-[#14231c]/8 flex items-center justify-between">
              <h2 className="font-bold text-[#14231c] flex items-center gap-2"><ShoppingCart size={18} className="text-[#0f6f4b]" /> Giỏ hàng</h2>
              <span className="text-sm text-[#59665f]">{cartLines.length} sản phẩm</span>
            </div>

            <div className="divide-y divide-[#14231c]/5 max-h-80 overflow-y-auto">
              {cartLines.length === 0 ? (
                <div className="py-10 text-center text-[#59665f]/60 text-sm">
                  <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />Giỏ hàng đang trống
                </div>
              ) : cartLines.map((l) => (
                <div key={l.product.id} className="p-3 flex items-center gap-3">
                  {l.product.imageUrl ? (
                    <img src={l.product.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-[#f6f7f4] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#14231c] truncate">{l.product.name}</p>
                    {l.product.priceOnRequest ? (
                      <p className="text-xs text-[#f5c84c] font-semibold">Liên hệ báo giá</p>
                    ) : (
                      <p className="text-xs text-[#0f6f4b] font-semibold">{money(l.product.price)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setQty(l.product.id, l.quantity - 1)} className="w-6 h-6 rounded-md bg-[#f6f7f4] flex items-center justify-center text-[#0f6f4b]"><Minus size={12} /></button>
                    <span className="w-6 text-center text-sm">{l.quantity}</span>
                    <button onClick={() => setQty(l.product.id, l.quantity + 1)} className="w-6 h-6 rounded-md bg-[#f6f7f4] flex items-center justify-center text-[#0f6f4b]"><Plus size={12} /></button>
                  </div>
                  <button onClick={() => setQty(l.product.id, 0)} className="text-[#c7372f]/60 hover:text-[#c7372f] shrink-0"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>

            {/* Thông tin giao hàng */}
            <div className="p-4 border-t border-[#14231c]/8 space-y-3">
              <p className="text-xs font-semibold text-[#59665f] uppercase flex items-center gap-1.5"><Truck size={13} /> Thông tin giao hàng</p>
              <input type="text" value={activeTab.deliveryName} onChange={(e) => updateActiveTab({ deliveryName: e.target.value })} placeholder="Tên người nhận *"
                className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20" />
              <input type="text" value={activeTab.deliveryPhone} onChange={(e) => updateActiveTab({ deliveryPhone: e.target.value })} placeholder="Số điện thoại *"
                className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20" />
              <textarea value={activeTab.deliveryAddress} onChange={(e) => updateActiveTab({ deliveryAddress: e.target.value })} placeholder="Địa chỉ giao hàng *" rows={2}
                className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20 resize-none" />
              <textarea value={activeTab.note} onChange={(e) => updateActiveTab({ note: e.target.value })} placeholder="Ghi chú (không bắt buộc)" rows={2}
                className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20 resize-none" />
            </div>

            {/* Summary + submit */}
            <div className="p-4 bg-[#f6f7f4] border-t border-[#14231c]/8 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#59665f]">Tạm tính</span>
                <span className="text-lg font-bold text-[#0f6f4b]">{money(cartTotal)}</span>
              </div>
              <button onClick={submitOrder} disabled={submitting || cartLines.length === 0}
                className="w-full py-3.5 rounded-xl bg-[#0f6f4b] text-white font-semibold hover:bg-[#0b5a3c] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm">
                {submitting ? 'Đang gửi đơn...' : 'Đặt hàng'} <ChevronRight size={18} />
              </button>
              <p className="text-[10px] text-[#59665f] text-center">Giá tạm tính, sale sẽ xác nhận lại sau khi đặt hàng.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
