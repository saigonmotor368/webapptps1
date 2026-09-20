import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProductSearchBox, { resolveThumbnailUrl } from '../components/ProductSearchBox';
import {
  ShoppingCart, Plus, Minus, X, Upload, CheckCircle2, PlusCircle, Package, Trash2, ChevronRight, Truck,
  Clock, AlertTriangle, Calendar, Star, FileText
} from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

function formatMinutesLeft(mins: number) {
  if (mins <= 0) return 'đã qua giờ chốt';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `còn ${h}h${m > 0 ? m + 'p' : ''}` : `còn ${m} phút`;
}

interface Product {
  id: string; sku: string; name: string; category: string | null;
  unit: string; imageUrl: string | null; thumb_url?: string | null; price: number; priceOnRequest?: boolean; available: boolean;
}
interface CartLine {
  product: Product;
  quantity: number;
  note?: string; // Ghi chú / quy cách từng dòng (WP3)
}

export interface CustomerAddress {
  id: string;
  label: string;
  address: string;
  contactName: string;
  contactPhone: string;
  isDefault: boolean;
}

export interface OrderConfigInfo {
  serverNow: string;
  earliestDate: string;
  cutoffAt: string;
  cutoffTimeStr: string;
  minutesLeft: number;
  isLate: boolean;
}

// Nhiều khách (đặc biệt tổ bếp/nhà máy) cần đặt NHIỀU đơn riêng biệt cùng
// lúc (VD: đơn cho bếp sáng, đơn cho bếp trưa...) — mỗi tab là 1 đơn riêng.
interface OrderTab {
  id: string;
  idempotencyKey: string; // Khóa chống trùng lặp đơn (WP3/F1)
  cart: Record<string, CartLine>;
  deliveryDate: string; // Ngày giao (D1-D4)
  deliveryAddressId: string; // ID điểm giao từ customer_addresses (D3)
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  isLate?: boolean;
  minutesLeft?: number;
  cutoffTimeStr?: string;
  note: string;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function newTab(defaultName = '', defaultPhone = '', defaultAddress = '', defaultDate = '', defaultAddressId = ''): OrderTab {
  return {
    id: generateUuid(),
    idempotencyKey: generateUuid(),
    cart: {},
    deliveryDate: defaultDate,
    deliveryAddressId: defaultAddressId,
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
  const location = useLocation();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 24;

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orderConfig, setOrderConfig] = useState<OrderConfigInfo | null>(null);
  const [frequentItems, setFrequentItems] = useState<any[]>([]);
  const [reorderMessage, setReorderMessage] = useState('');

  const defaultShipping = user?.defaultShippingAddress;
  const newTabForUser = useCallback(
    () => newTab(
      defaultShipping?.name || user?.name || '',
      defaultShipping?.phone || user?.phone || '',
      defaultShipping?.address || '',
      orderConfig?.earliestDate || '',
      addresses.find(a => a.isDefault)?.id || addresses[0]?.id || ''
    ),
    [defaultShipping, user?.name, user?.phone, orderConfig?.earliestDate, addresses]
  );

  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    try {
      const saved = sessionStorage.getItem(TABS_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t: Partial<OrderTab>) => ({
          ...newTab(),
          ...t,
          idempotencyKey: t.idempotencyKey || generateUuid(),
        }));
      }
    } catch { /* ignore */ }
    return [newTab()];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const updateActiveTab = useCallback((patch: Partial<OrderTab> | ((t: OrderTab) => Partial<OrderTab>)) => {
    setTabs((prev) => prev.map((t) => (t.id !== activeTabId ? t : { ...t, ...(typeof patch === 'function' ? patch(t) : patch) })));
  }, [activeTabId]);

  // 1. Tải order-config (nguồn giờ chốt và địa chỉ khách)
  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/api/customer/order-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setOrderConfig({
            serverNow: data.serverNow,
            earliestDate: data.earliestDate,
            cutoffAt: data.cutoffAt,
            cutoffTimeStr: data.cutoffTimeStr || '16:30',
            minutesLeft: Number(data.minutesLeft) || 0,
            isLate: Boolean(data.isLate),
          });
          const addrs: CustomerAddress[] = data.addresses || [];
          setAddresses(addrs);
          const defaultAddr = addrs.find((a) => a.isDefault) || addrs[0];

          setTabs((prev) =>
            prev.map((t) => ({
              ...t,
              deliveryDate: t.deliveryDate || data.earliestDate,
              deliveryAddressId: t.deliveryAddressId || defaultAddr?.id || '',
              deliveryAddress: t.deliveryAddress || defaultAddr?.address || '',
              deliveryName: t.deliveryName || defaultAddr?.contactName || user?.name || '',
              deliveryPhone: t.deliveryPhone || defaultAddr?.contactPhone || user?.phone || '',
              cutoffTimeStr: data.cutoffTimeStr || '16:30',
              minutesLeft: Number(data.minutesLeft) || 0,
              isLate: Boolean(data.isLate),
            }))
          );
        }
      })
      .catch((err) => console.warn('Lỗi lấy order-config:', err));
  }, [apiBase, token, user]);

  // 2. Cập nhật giờ chốt khi đổi ngày giao ở tab hiện tại
  useEffect(() => {
    if (!token || !activeTab.deliveryDate) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/customer/order-config?deliveryDate=${encodeURIComponent(activeTab.deliveryDate)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.ok) {
          updateActiveTab({
            isLate: Boolean(data.isLate),
            minutesLeft: Number(data.minutesLeft) || 0,
            cutoffTimeStr: data.cutoffTimeStr || '16:30',
          });
        }
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [activeTab.deliveryDate, apiBase, token, updateActiveTab]);

  // 3. Tải danh sách mặt hàng hay đặt (WP3)
  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/api/customer/frequent-items`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.items)) {
          setFrequentItems(data.items);
        }
      })
      .catch((err) => console.warn('Lỗi lấy frequent-items:', err));
  }, [apiBase, token]);

  // 4. Nhận đơn đặt lại từ MyOrdersPage (WP3)
  const reorderHandledRef = useRef(false);
  useEffect(() => {
    if (reorderHandledRef.current) return;
    const reorder = (location.state as any)?.reorderItems;
    if (Array.isArray(reorder) && reorder.length > 0) {
      reorderHandledRef.current = true;
      const reorderCart: Record<string, CartLine> = {};
      for (const item of reorder) {
        if (!item.productId) continue;
        reorderCart[item.productId] = {
          product: {
            id: item.productId,
            sku: item.sku || '',
            name: item.name,
            category: null,
            unit: item.unit || 'Kg',
            imageUrl: item.imageUrl || null,
            thumb_url: item.thumb_url || null,
            price: Number(item.price) || 0,
            priceOnRequest: false,
            available: true,
          },
          quantity: Number(item.quantity) || 1,
          note: item.note || item.customerNote || '',
        };
      }
      const t = {
        ...newTabForUser(),
        cart: reorderCart,
      };
      setTabs((prev) => [...prev, t]);
      setActiveTabId(t.id);
      setReorderMessage(`Đã nạp ${Object.keys(reorderCart).length} mặt hàng từ đơn cũ vào tab mới! Vui lòng chọn ngày giao.`);
    }
  }, [location.state, newTabForUser]);

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

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (category) params.set('category', category);
      const res = await fetch(`${apiBase}/api/customer/products?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) {
        const mapped = (data.products || []).map((p: any) => ({
          id: p.id,
          sku: p.sku || '',
          name: p.name,
          category: p.category || null,
          unit: p.unit || 'Kg',
          imageUrl: p.imageUrl || p.image_url || null,
          thumb_url: p.thumb_url || null,
          price: Number(p.price || 0),
          priceOnRequest: Boolean(p.priceOnRequest || p.price === 0),
          available: p.available !== false,
        }));
        setProducts(mapped);
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
  }, [apiBase, token, page, category, logout]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // B2B: số lượng thập phân (hàng kg), cho nhập trước khi thêm
  const [pendingQty, setPendingQty] = useState<Record<string, number>>({});
  const getPendingQty = (productId: string) => pendingQty[productId] ?? 1;
  const setPendingQtyFor = (productId: string, qty: number) =>
    setPendingQty((prev) => ({ ...prev, [productId]: Math.max(0.1, Math.round(qty * 100) / 100) }));

  const addToCart = (p: Product, qty = 1, note = '') => {
    updateActiveTab((t) => {
      const existing = t.cart[p.id];
      const newQty = (existing?.quantity || 0) + qty;
      return {
        cart: {
          ...t.cart,
          [p.id]: {
            product: p,
            quantity: Math.round(newQty * 100) / 100,
            note: note || existing?.note || '',
          },
        },
      };
    });
    setPendingQty((prev) => ({ ...prev, [p.id]: 1 }));
  };

  const setQty = (productId: string, qty: number) => {
    updateActiveTab((t) => {
      if (qty <= 0.001) {
        const next = { ...t.cart };
        delete next[productId];
        return { cart: next };
      }
      return {
        cart: {
          ...t.cart,
          [productId]: {
            ...t.cart[productId],
            quantity: Math.round(qty * 100) / 100,
          },
        },
      };
    });
  };

  const updateItemNote = (productId: string, note: string) => {
    updateActiveTab((t) => {
      const existing = t.cart[productId];
      if (!existing) return t;
      return { cart: { ...t.cart, [productId]: { ...existing, note } } };
    });
  };

  const handleSelectAddress = (addressId: string) => {
    const sel = addresses.find((a) => a.id === addressId);
    if (!sel) return;
    updateActiveTab({
      deliveryAddressId: sel.id,
      deliveryAddress: sel.address,
      deliveryName: sel.contactName || activeTab.deliveryName,
      deliveryPhone: sel.contactPhone || activeTab.deliveryPhone,
    });
  };

  const cartLines = Object.values(activeTab.cart);
  const cartTotal = useMemo(() => cartLines.reduce((s, l) => s + l.quantity * l.product.price, 0), [cartLines]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const submitOrder = async () => {
    const { deliveryDate, deliveryAddressId, deliveryName, deliveryPhone, deliveryAddress, note, idempotencyKey } = activeTab;
    if (addresses.length === 0) {
      alert('Tài khoản của bạn chưa có địa chỉ giao hàng. Vui lòng liên hệ TPS1 để bổ sung địa chỉ giao hàng trước khi đặt.');
      return;
    }
    if (!deliveryAddressId) {
      alert('Vui lòng chọn điểm giao hàng');
      return;
    }
    if (!deliveryDate) {
      alert('Vui lòng chọn ngày giao hàng');
      return;
    }
    if (cartLines.length === 0) { alert('Vui lòng chọn sản phẩm'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/customer/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'website',
          orderSessionToken: token,
          deliveryDate,
          addressId: deliveryAddressId,
          idempotencyKey: idempotencyKey || generateUuid(),
          items: cartLines.map((l) => ({
            productId: l.product.id,
            name: l.product.name,
            quantity: l.quantity,
            note: l.note || '',
          })),
          deliveryType: 'shipping',
          deliveryAlias: addresses.find((a) => a.id === deliveryAddressId)?.label || 'Địa chỉ giao hàng',
          deliveryName,
          deliveryPhone,
          deliveryAddress,
          note,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi đặt hàng');
      setSuccessCode(data.orderCode);
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

      {/* Thông báo nạp đơn cũ */}
      {reorderMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-emerald-600 shrink-0" />
            <span>{reorderMessage}</span>
          </div>
          <button onClick={() => setReorderMessage('')} className="text-emerald-600 hover:text-emerald-900 p-1 rounded-lg">
            <X size={16} />
          </button>
        </div>
      )}

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
            <ProductSearchBox
              apiBase={apiBase}
              token={token}
              showCategoryFilter={false}
              placeholder="Tìm nhanh sản phẩm (thumbnail 64px, tô đậm từ khoá, Enter để chọn)..."
              onSelectProduct={(sp) => {
                addToCart({
                  id: sp.id,
                  sku: sp.sku,
                  name: sp.name,
                  category: sp.category,
                  unit: sp.unit,
                  imageUrl: sp.image_url || null,
                  thumb_url: sp.thumb_url || null,
                  price: sp.price,
                  priceOnRequest: sp.price === 0,
                  available: true,
                }, 1);
              }}
            />
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

          {/* Section Mặt hàng hay đặt (WP3) */}
          {category === '' && frequentItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#14231c]/8 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#14231c] flex items-center gap-1.5">
                  <Star size={16} className="text-amber-500 fill-amber-500" />
                  Sản phẩm hay đặt ({frequentItems.length})
                </h3>
                <span className="text-xs text-[#59665f]">Bấm để thêm nhanh</span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
                {frequentItems.map((fi: any) => {
                  const thumb = resolveThumbnailUrl(fi.thumb_url, fi.imageUrl);
                  return (
                    <div
                      key={fi.id}
                      className="shrink-0 w-36 bg-[#f6f7f4]/80 rounded-xl p-2.5 border border-[#14231c]/8 flex flex-col justify-between"
                    >
                      <div className="w-full h-20 rounded-lg overflow-hidden bg-white relative flex items-center justify-center mb-1.5">
                        {thumb ? (
                          <img src={thumb} alt={fi.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package size={24} className="text-[#0f6f4b]/40" />
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[#14231c] line-clamp-1" title={fi.name}>{fi.name}</p>
                      <p className="text-[11px] text-[#0f6f4b] font-bold mt-0.5">
                        {fi.priceOnRequest ? 'Liên hệ' : money(fi.price)}/{fi.unit || 'Kg'}
                      </p>
                      <button
                        onClick={() => addToCart({
                          id: fi.id,
                          sku: fi.sku || '',
                          name: fi.name,
                          category: fi.category || null,
                          unit: fi.unit || 'Kg',
                          imageUrl: fi.imageUrl || null,
                          thumb_url: fi.thumb_url || null,
                          price: Number(fi.price) || 0,
                          priceOnRequest: Boolean(fi.priceOnRequest),
                          available: true,
                        }, 1)}
                        className="mt-2 w-full py-1 bg-[#0f6f4b] text-white rounded-lg text-xs font-medium hover:bg-[#0b5a3c] flex items-center justify-center gap-1"
                      >
                        <Plus size={12} /> Thêm
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Danh sách sản phẩm */}
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
                  const thumb = resolveThumbnailUrl(p.thumb_url, p.imageUrl);
                  const isKg = p.unit?.toLowerCase() === 'kg';
                  const step = isKg ? 0.5 : 1;
                  return (
                    <div key={p.id} className="flex items-center gap-3.5 px-4 py-3 hover:bg-[#f6f7f4]/60 transition-colors">
                      {/* Thumbnail 64px x 64px với Fallback TPS1 Placeholder */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-[#14231c]/8 bg-[#f6f7f4] relative flex items-center justify-center">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={p.name}
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                              const fb = (e.target as HTMLElement).nextElementSibling;
                              if (fb) (fb as HTMLElement).style.display = 'flex';
                            }}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                        <div className={`w-full h-full flex flex-col items-center justify-center text-[#0f6f4b] bg-[#0f6f4b]/5 ${thumb ? 'hidden' : 'flex'}`}>
                          <Package size={22} className="opacity-50" />
                          <span className="text-[8px] font-bold tracking-wider uppercase opacity-50 mt-0.5">TPS1</span>
                        </div>
                      </div>
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
                          <div className="flex items-center gap-1 bg-[#f6f7f4] rounded-lg p-1">
                            <button
                              onClick={() => setQty(p.id, inCart - step)}
                              className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-[#0f6f4b] shadow-xs"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-10 text-center text-xs font-semibold text-[#14231c]">{inCart}</span>
                            <button
                              onClick={() => setQty(p.id, inCart + step)}
                              className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-[#0f6f4b] shadow-xs"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0.1"
                              step={isKg ? '0.1' : '1'}
                              value={getPendingQty(p.id)}
                              onChange={(e) => setPendingQtyFor(p.id, Number(e.target.value) || 1)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-16 border border-[#14231c]/15 rounded-lg px-1.5 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20"
                            />
                            <button
                              onClick={() => addToCart(p, getPendingQty(p.id))}
                              className="px-3 py-1.5 rounded-lg bg-[#0f6f4b] text-white text-xs font-medium hover:bg-[#0b5a3c] flex items-center justify-center gap-1"
                            >
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

        {/* Cột giỏ hàng + giao hàng */}
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
              ) : cartLines.map((l) => {
                const isKg = l.product.unit?.toLowerCase() === 'kg';
                const step = isKg ? 0.5 : 1;
                return (
                  <div key={l.product.id} className="p-3 space-y-1.5">
                    <div className="flex items-center gap-3">
                      {l.product.imageUrl ? (
                        <img src={l.product.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#f6f7f4] shrink-0 flex items-center justify-center text-[#0f6f4b]/40">
                          <Package size={18} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#14231c] truncate">{l.product.name}</p>
                        {l.product.priceOnRequest ? (
                          <p className="text-xs text-[#f5c84c] font-semibold">Liên hệ báo giá</p>
                        ) : (
                          <p className="text-xs text-[#0f6f4b] font-semibold">{money(l.product.price)}/{l.product.unit}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setQty(l.product.id, l.quantity - step)} className="w-6 h-6 rounded-md bg-[#f6f7f4] flex items-center justify-center text-[#0f6f4b]"><Minus size={12} /></button>
                        <span className="w-8 text-center text-xs font-semibold">{l.quantity}</span>
                        <button onClick={() => setQty(l.product.id, l.quantity + step)} className="w-6 h-6 rounded-md bg-[#f6f7f4] flex items-center justify-center text-[#0f6f4b]"><Plus size={12} /></button>
                      </div>
                      <button onClick={() => setQty(l.product.id, 0)} className="text-[#c7372f]/60 hover:text-[#c7372f] shrink-0" title="Xóa"><Trash2 size={15} /></button>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={l.note || ''}
                        onChange={(e) => updateItemNote(l.product.id, e.target.value)}
                        placeholder="Ghi chú quy cách: thái mỏng, chia túi..."
                        className="w-full text-[11px] px-2.5 py-1 bg-[#f6f7f4]/80 border border-[#14231c]/10 rounded-lg text-slate-700 placeholder:text-slate-400 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Thông tin giao hàng (WP3/D3/D4) */}
            <div className="p-4 border-t border-[#14231c]/8 space-y-3">
              <p className="text-xs font-semibold text-[#59665f] uppercase flex items-center gap-1.5"><Truck size={13} /> Thông tin giao hàng</p>

              {/* Ngày giao hàng */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar size={13} className="text-[#0f6f4b]" />
                  Ngày giao hàng *
                </label>
                <input
                  type="date"
                  value={activeTab.deliveryDate}
                  min={orderConfig?.earliestDate || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => updateActiveTab({ deliveryDate: e.target.value })}
                  className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20"
                />
                {activeTab.isLate ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5 flex items-center gap-1.5 font-medium">
                    <Clock size={13} className="shrink-0 text-amber-600" />
                    <span>Đơn trễ giờ chốt — Vận hành sẽ xác nhận lại, có thể không kịp giao</span>
                  </p>
                ) : activeTab.minutesLeft != null ? (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 mt-1.5 flex items-center gap-1.5 font-medium">
                    <Clock size={13} className="shrink-0 text-emerald-600" />
                    <span>Còn {formatMinutesLeft(activeTab.minutesLeft)} để chốt đơn (trước {activeTab.cutoffTimeStr || '16:30'})</span>
                  </p>
                ) : null}
              </div>

              {/* Điểm giao hàng chọn từ customer_addresses (D3) */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Điểm giao hàng *
                </label>
                {addresses.length === 0 ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <AlertTriangle size={13} /> Chưa có địa chỉ giao hàng
                    </p>
                    <p>Vui lòng liên hệ TPS1 để bổ sung địa chỉ giao hàng trước khi đặt.</p>
                  </div>
                ) : (
                  <>
                    <select
                      value={activeTab.deliveryAddressId}
                      onChange={(e) => handleSelectAddress(e.target.value)}
                      className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20 bg-white"
                    >
                      <option value="">-- Chọn điểm giao --</option>
                      {addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label ? `${a.label} — ` : ''}{a.address} {a.isDefault ? '(Mặc định)' : ''}
                        </option>
                      ))}
                    </select>
                    {activeTab.deliveryAddress && (
                      <div className="mt-2 p-2.5 bg-[#f6f7f4] rounded-lg text-xs space-y-0.5 text-slate-600 border border-[#14231c]/5">
                        <p><span className="font-medium text-slate-700">Người nhận:</span> {activeTab.deliveryName} - {activeTab.deliveryPhone}</p>
                        <p><span className="font-medium text-slate-700">Địa chỉ:</span> {activeTab.deliveryAddress}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Ghi chú đơn hàng
                </label>
                <textarea
                  value={activeTab.note}
                  onChange={(e) => updateActiveTab({ note: e.target.value })}
                  placeholder="Ghi chú chung cho toàn bộ đơn hàng..."
                  rows={2}
                  className="w-full border border-[#14231c]/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/20 resize-none"
                />
              </div>
            </div>

            {/* Summary + submit */}
            <div className="p-4 bg-[#f6f7f4] border-t border-[#14231c]/8 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#59665f]">Tạm tính</span>
                <span className="text-lg font-bold text-[#0f6f4b]">{money(cartTotal)}</span>
              </div>
              <button
                onClick={submitOrder}
                disabled={submitting || cartLines.length === 0 || addresses.length === 0}
                className="w-full py-3.5 rounded-xl bg-[#0f6f4b] text-white font-semibold hover:bg-[#0b5a3c] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {submitting ? 'Đang gửi đơn...' : 'Đặt hàng'} <ChevronRight size={18} />
              </button>
              {addresses.length === 0 ? (
                <p className="text-[11px] text-red-600 text-center font-medium">Cần bổ sung địa chỉ giao hàng trước khi đặt.</p>
              ) : (
                <p className="text-[10px] text-[#59665f] text-center">Giá tạm tính, sale sẽ xác nhận lại sau khi đặt hàng.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
