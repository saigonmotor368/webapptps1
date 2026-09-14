import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { printOrderSlip } from '../lib/printOrder';
import QuickAddProductModal from '../components/QuickAddProductModal';
import {
  Search, Plus, Tag, Truck, RefreshCw, ShoppingCart, User, X, CheckCircle2, AlertTriangle, PlusCircle, ClipboardEdit
} from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

function getImgUrl(url?: string) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://yntgxollwjemyidizhnn.supabase.co/storage/v1/object/public/products/${url}`;
}

interface CartItem {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  image_url?: string;
  // Tồn kho tại thời điểm thêm vào giỏ/tải đơn — dùng để cảnh báo + cho nhập
  // hàng ngay khi xử lý đơn, KHÔNG còn chặn khách đặt hàng hết tồn nữa (yêu
  // cầu 2026-09-11: sale mới là người xử lý hết hàng, không phải khách).
  trackInventory?: boolean;
  stockQty?: number | null;
  lowStock?: boolean;
}

// Giai đoạn C (bổ sung 2026-09-10) — "mở nhiều đơn cùng lúc" như màn Bán
// Hàng KiotViet thật: sale phục vụ nhiều khách/đơn song song bằng các tab
// riêng, chuyển qua lại không mất dữ liệu. Mỗi tab là 1 OrderTab độc lập,
// lưu tạm vào sessionStorage để không mất trắng nếu lỡ F5.
interface OrderTab {
  id: string;
  selectedCustomerId: string;
  customerDebt: number | null;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  note: string;
  cart: CartItem[];
  discountAmount: number;
  voucherCode: string;
  voucherDiscount: number;
  shippingAmount: number;
  // Giao hàng tự vận chuyển (mục 14.2-1 KE_HOACH) — khớp field "Bán giao
  // hàng" của Sale/POS KiotViet thật. Để dạng string cho form, số hoá lúc gửi.
  packageWeightG: string;
  packageDimensions: string;
  assignedDriver: string;
  codCollectAmount: string;
  // 3 chế độ hiển thị của Sale/POS KiotViet thật (mục 14.3-6 KE_HOACH) — cùng
  // 1 OrderTab, chỉ khác mật độ field hiển thị, không phải luồng dữ liệu khác.
  mode: 'quick' | 'normal' | 'delivery';
  // "Xử lý đơn hàng" từ trang Quản lý đơn hàng (2026-09-10) — khớp luồng
  // KiotViet thật: bấm 1 phiếu tạm sẽ mở đúng màn Bán hàng này với đầy đủ dữ
  // liệu đơn, có mã đơn để dễ theo dõi. Có giá trị = đang SỬA đơn có sẵn
  // (submit sẽ chốt lại đơn đó thay vì tạo đơn nháp mới).
  processingOrderId?: string;
  orderCode?: string;
}

function newTab(): OrderTab {
  return {
    id: (crypto as any).randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    selectedCustomerId: '', customerDebt: null,
    deliveryName: '', deliveryPhone: '', deliveryAddress: '', note: '',
    cart: [], discountAmount: 0, voucherCode: '', voucherDiscount: 0, shippingAmount: 0,
    packageWeightG: '', packageDimensions: '', assignedDriver: '', codCollectAmount: '',
    mode: 'normal',
  };
}

const SALE_MODES: { value: OrderTab['mode']; label: string; icon: string }[] = [
  { value: 'quick', label: 'Bán nhanh', icon: '⚡' },
  { value: 'normal', label: 'Bán thường', icon: '🧾' },
  { value: 'delivery', label: 'Bán giao hàng', icon: '🚚' },
];

const TABS_STORAGE_KEY = 'tps1_pos_tabs';

export default function PosCreatePage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingDebt, setLoadingDebt] = useState(false);
  const [loadingProcessOrder, setLoadingProcessOrder] = useState(false);

  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    try {
      const saved = sessionStorage.getItem(TABS_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      // Tab cũ lưu từ trước khi có field mode/kiện hàng — điền giá trị mặc định
      // để không vỡ giao diện khi đọc lại sessionStorage cũ.
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((t: Partial<OrderTab>) => ({ ...newTab(), ...t }));
    } catch { /* ignore */ }
    return [newTab()];
  });
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const updateActiveTab = useCallback((patch: Partial<OrderTab> | ((t: OrderTab) => Partial<OrderTab>)) => {
    setTabs(prev => prev.map(t => t.id !== activeTabId ? t : { ...t, ...(typeof patch === 'function' ? patch(t) : patch) }));
  }, [activeTabId]);

  const addTab = () => {
    const t = newTab();
    setTabs(prev => [...prev, t]);
    setActiveTabId(t.id);
  };
  const closeTab = (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab && (tab.cart.length > 0 || tab.selectedCustomerId) && !confirm('Đóng đơn này? Dữ liệu chưa gửi sẽ bị mất.')) return;
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) { const t = newTab(); return [t]; }
      return next;
    });
    setActiveTabId(prev => {
      if (prev !== id) return prev;
      const remaining = tabs.filter(t => t.id !== id);
      return remaining.length ? remaining[0].id : tabs[0].id;
    });
  };

  // "Xử lý đơn hàng" từ OrdersPage/OrderDetailPage (?processOrderId=...) — mở
  // đúng đơn phiếu tạm ngay trong màn Bán hàng, có mã đơn để dễ theo dõi,
  // khớp luồng KiotViet thật (mục brief 2026-09-10). Chỉ chạy 1 lần khi có
  // param, xoá param sau khi đã nạp xong để F5 không nạp lại tab trùng.
  const loadedProcessOrderRef = useRef<string | null>(null);
  useEffect(() => {
    const processOrderId = searchParams.get('processOrderId');
    if (!processOrderId || loadedProcessOrderRef.current === processOrderId || !token) return;
    loadedProcessOrderRef.current = processOrderId;
    setLoadingProcessOrder(true);
    (async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || '';
        const res = await fetch(`${apiBase}/api/admin/orders?id=${processOrderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!data.ok || !data.order) throw new Error(data.error || 'Không tìm thấy đơn hàng');
        const o = data.order;
        const tab: OrderTab = {
          ...newTab(),
          processingOrderId: o.id,
          orderCode: o.order_code,
          selectedCustomerId: o.customer_id || '',
          customerDebt: null,
          deliveryName: o.delivery_name || '',
          deliveryPhone: o.delivery_phone || '',
          deliveryAddress: o.delivery_address || '',
          note: o.note || '',
          discountAmount: Number(o.discount_amount) || 0,
          shippingAmount: Number(o.shipping_amount) || 0,
          packageWeightG: o.package_weight_g != null ? String(o.package_weight_g) : '',
          packageDimensions: o.package_dimensions || '',
          assignedDriver: o.assigned_driver || '',
          codCollectAmount: o.cod_collect_amount ? String(o.cod_collect_amount) : '',
          mode: o.delivery_address ? 'delivery' : 'normal',
          cart: (o.order_items || []).map((it: any) => ({
            productId: it.product_id, name: it.name, unit: it.unit || 'Kg',
            quantity: Number(it.quantity), price: Number(it.unit_price), image_url: undefined,
            trackInventory: !!it.track_inventory,
            stockQty: it.stock_qty != null ? Number(it.stock_qty) : null,
            lowStock: !!it.low_stock,
          })),
        };
        setTabs(prev => [...prev, tab]);
        setActiveTabId(tab.id);
        if (o.customer_id) {
          fetchCustomerDebt(o.customer_id);
          supabase.from('customer_addresses').select('*').eq('customer_id', o.customer_id).order('is_default', { ascending: false })
            .then(({ data }) => setSavedAddresses(data || []));
        }
      } catch (err: any) {
        alert('Lỗi tải đơn để xử lý: ' + (err.message || 'Không xác định'));
      } finally {
        setLoadingProcessOrder(false);
        setSearchParams((prev) => { prev.delete('processOrderId'); return prev; }, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, token]);

  // Custom product (staging trước khi thêm vào giỏ — dùng chung, không cần tách theo tab)
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState(0);
  const [customQty, setCustomQty] = useState(1);
  const [customUnit, setCustomUnit] = useState('Kg');

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  // Địa chỉ giao đã lưu của khách (mục 14.3-5 KE_HOACH) — chọn nhanh thay vì
  // gõ tay mỗi lần cho khách công ty giao nhiều địa điểm.
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

  const loadCustomers = useCallback(async () => {
    try {
      if (user?.role === 'sale' && user.id && user.id !== 'legacy-admin') {
        // LƯU Ý: cột đúng là "company", không phải "company_name" — trước đây
        // sai tên cột khiến query này lỗi 400 im lặng, sale KHÔNG chọn được
        // khách hàng nào cả (bug Giai đoạn C, 2026-09-10).
        const { data } = await supabase
          .from('vip_accounts')
          .select('id, name, phone, partner_code, company, discount_tier, credit_limit, default_shipping_address, default_shipping_name, default_shipping_phone, verification_status')
          .eq('sales_rep_id', user.id)
          .eq('is_active', true);
        setCustomers(data || []);
      } else {
        const { data } = await supabase.rpc('admin_list_customers');
        setCustomers(data || []);
      }
    } catch (err) {
      console.error('Lỗi tải khách hàng:', err);
    }
  }, [user]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const handleSelectCustomer = (id: string) => {
    const cust = customers.find(c => c.id === id);
    setSavedAddresses([]);
    if (cust) {
      updateActiveTab({
        selectedCustomerId: id,
        deliveryName: cust.name || cust.default_shipping_name || '',
        deliveryPhone: cust.phone || cust.default_shipping_phone || '',
        deliveryAddress: cust.default_shipping_address || '',
        customerDebt: null,
      });
      fetchCustomerDebt(id);
      supabase.from('customer_addresses').select('*').eq('customer_id', id).order('is_default', { ascending: false })
        .then(({ data }) => setSavedAddresses(data || []));
    } else {
      updateActiveTab({ selectedCustomerId: '', deliveryName: '', deliveryPhone: '', deliveryAddress: '', customerDebt: null });
    }
  };

  const applySavedAddress = (addr: any) => {
    updateActiveTab({
      deliveryAddress: addr.address,
      deliveryName: addr.contact_name || activeTab.deliveryName,
      deliveryPhone: addr.contact_phone || activeTab.deliveryPhone,
    });
  };

  // Giai đoạn C: hiện công nợ hiện tại của khách khi chọn (mục 13.5). Chưa có
  // bảng order_payments (Giai đoạn C phần thanh toán tách 3 phần — cần chạy
  // migration riêng), nên đây là số TẠM TÍNH: cộng dồn grand_total của các
  // đơn chưa hủy và chưa đánh dấu "đã thanh toán đủ" (payment_status != 'paid').
  // Sẽ chính xác hơn khi order_payments/debt_amount đi vào hoạt động.
  const fetchCustomerDebt = async (customerId: string) => {
    setLoadingDebt(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('grand_total')
        .eq('customer_id', customerId)
        .neq('status', 'canceled')
        .neq('payment_status', 'paid');
      if (error) throw error;
      const total = (data || []).reduce((s, o: any) => s + (Number(o.grand_total) || 0), 0);
      updateActiveTab({ customerDebt: total });
    } catch (err) {
      console.error('Lỗi tải công nợ khách hàng:', err);
      updateActiveTab({ customerDebt: null });
    } finally {
      setLoadingDebt(false);
    }
  };

  const searchProducts = async () => {
    if (searchTerm.length < 2) return;
    setSearching(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const customerParam = activeTab.selectedCustomerId ? `&customerId=${encodeURIComponent(activeTab.selectedCustomerId)}` : '';
      const res = await fetch(`${apiBase}/api/admin/orders?productSearch=${encodeURIComponent(searchTerm)}${customerParam}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setSearchResults(data.products || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  // Dropdown gợi ý tự tìm khi gõ, giống màn Sale/POS KiotViet thật — không
  // cần bấm "Tìm" nữa (mục brief 2026-09-10).
  useEffect(() => {
    if (searchTerm.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => { searchProducts(); }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, activeTab.selectedCustomerId]);

  const addFromSearch = (p: any) => {
    if (activeTab.cart.some(i => i.productId === p.id)) {
      alert('Sản phẩm đã có trong giỏ, hãy tăng số lượng!'); return;
    }
    updateActiveTab(t => ({
      cart: [...t.cart, {
        productId: p.id, name: p.name, unit: p.unit || 'Kg', quantity: 1, price: Number(p.price), image_url: p.image_url,
        trackInventory: !!p.trackInventory, stockQty: p.stockQty ?? null, lowStock: !!p.lowStock,
      }],
    }));
    setSearchResults([]);
    setSearchTerm('');
  };

  // Nhập hàng vẫn chỉ dành cho thu mua/admin — sale KHÔNG được nhập (một số
  // mặt hàng mới bật theo dõi tồn, hàng tươi/chế biến trong ngày vốn không
  // theo dõi tồn). Sale chỉ thấy cảnh báo thiếu hàng để báo thu mua, không có
  // nút thao tác (đã tắt quyền vừa cấp, yêu cầu 2026-09-11).
  const canStockIn = user?.role === 'admin' || user?.role === 'thu_mua';
  const restockItem = async (idx: number) => {
    const item = activeTab.cart[idx];
    if (!item.productId) return;
    const qtyStr = prompt(`Nhập số lượng "${item.name}" mới nhập kho (đơn vị: ${item.unit}):`, '');
    if (qtyStr === null) return;
    const qty = Number(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) { alert('Số lượng không hợp lệ'); return; }
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: item.productId,
          inventoryAdjustment: { type: 'in', quantity: qty, note: `Nhập khi xử lý đơn${activeTab.orderCode ? ' ' + activeTab.orderCode : ''}` },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không nhập được hàng');
      const newStock = Number(data.product?.stock_qty ?? (Number(item.stockQty) || 0) + qty);
      const newMinStock = Number(data.product?.min_stock ?? 0);
      updateActiveTab(t => ({
        cart: t.cart.map((i, n) => n === idx ? { ...i, stockQty: newStock, lowStock: newStock <= newMinStock } : i),
      }));
      alert(`✅ Đã nhập thêm ${qty} ${item.unit} "${item.name}". Tồn mới: ${newStock}`);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không nhập được hàng'));
    }
  };

  const addCustom = () => {
    if (!customName.trim()) { alert('Vui lòng nhập tên sản phẩm!'); return; }
    updateActiveTab(t => ({ cart: [...t.cart, { productId: null, name: customName.trim(), unit: customUnit, quantity: customQty, price: customPrice }] }));
    setCustomName(''); setCustomPrice(0); setCustomQty(1);
  };

  const updateQty = (idx: number, qty: number) => updateActiveTab(t => ({ cart: t.cart.map((i, n) => n === idx ? { ...i, quantity: Math.max(0.001, qty) } : i) }));
  const updatePrice = (idx: number, price: number) => updateActiveTab(t => ({ cart: t.cart.map((i, n) => n === idx ? { ...i, price: Math.max(0, price) } : i) }));
  const removeItem = (idx: number) => updateActiveTab(t => ({ cart: t.cart.filter((_, n) => n !== idx) }));

  const subtotal = activeTab.cart.reduce((s, i) => s + i.quantity * i.price, 0);
  const total = Math.max(0, subtotal - activeTab.voucherDiscount - activeTab.discountAmount + activeTab.shippingAmount);

  const applyVoucher = async () => {
    const code = activeTab.voucherCode.trim().toUpperCase();
    if (!code) { updateActiveTab({ voucherDiscount: 0 }); return; }
    if (subtotal === 0) { alert('Vui lòng thêm sản phẩm trước khi áp dụng voucher!'); return; }
    setApplyingVoucher(true);
    try {
      const { data: voucher, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .single();
      if (error || !voucher) throw new Error('Mã voucher không hợp lệ hoặc đã hết hạn.');
      if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) throw new Error('Mã voucher đã hết hạn.');
      if (subtotal < (voucher.min_order_value || 0)) throw new Error(`Đơn hàng phải từ ${money(voucher.min_order_value)} để áp dụng mã này.`);
      if (voucher.max_uses_total > 0 && voucher.current_uses_total >= voucher.max_uses_total) throw new Error('Voucher đã hết lượt sử dụng.');
      let discount = 0;
      if (voucher.discount_amount > 0) discount = voucher.discount_amount;
      else if (voucher.discount_percent > 0) {
        discount = (subtotal * voucher.discount_percent) / 100;
        if (voucher.max_discount_value > 0 && discount > voucher.max_discount_value) discount = voucher.max_discount_value;
      }
      if (discount > subtotal) discount = subtotal;
      updateActiveTab({ voucherDiscount: Math.round(discount), voucherCode: code });
      alert(`✅ Áp dụng thành công! Giảm ${money(Math.round(discount))}`);
    } catch (err: any) {
      updateActiveTab({ voucherDiscount: 0 });
      alert('❌ ' + err.message);
    } finally { setApplyingVoucher(false); }
  };

  // Chốt lại đơn CÓ SẴN đang xử lý (từ nút "Xử lý đơn hàng") — dùng chung
  // endpoint chốt giá đã có (admin_finalize_order_v2 / legacy line editor,
  // đúng cái OrderDetailPage đang dùng) ở chế độ "manual_item_price" vì màn
  // Bán hàng cho sửa giá tự do từng dòng, không chọn hạng khách như
  // OrderDetailPage. Không tạo đơn mới, không đụng admin_create_order.
  const submitProcessOrder = async () => {
    const { processingOrderId, orderCode, cart, deliveryAddress, deliveryName, deliveryPhone, note,
      packageWeightG, packageDimensions, assignedDriver, codCollectAmount, discountAmount, shippingAmount } = activeTab;
    if (!processingOrderId) return;
    if (cart.length === 0) { alert('Giỏ hàng đang trống!'); return; }
    if (!confirm(`Xác nhận cập nhật & chốt đơn ${orderCode}?`)) return;
    setSubmitting(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: processingOrderId,
          customerTier: customers.find(c => c.id === activeTab.selectedCustomerId)?.discount_tier || 'VIP0',
          pricingMode: 'manual_item_price',
          orderDiscountPercent: 0,
          shippingAmount,
          items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, finalUnitPrice: i.price, note: '' })),
          verificationNote: '',
          pricingNote: `Xử lý qua màn Bán hàng${discountAmount ? ` — chiết khấu thêm ${money(discountAmount)}` : ''}`,
          actor: user?.name || 'TPS1 Sale App',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || data.warning || 'Không chốt được đơn');

      await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: processingOrderId,
          delivery: {
            packageWeightG: packageWeightG ? Number(packageWeightG) : null,
            packageDimensions: packageDimensions || null,
            assignedDriver: assignedDriver || null,
            codCollectAmount: codCollectAmount ? Number(codCollectAmount) : 0,
            deliveryAddress: deliveryAddress || null,
            deliveryName: deliveryName || null,
            deliveryPhone: deliveryPhone || null,
            note: note || null,
          },
        }),
      }).catch(() => {});

      alert(`✅ Đã chốt đơn ${orderCode} thành công!`);
      if (confirm('In phiếu tạm cho đơn này ngay bây giờ?')) {
        try {
          const fullRes = await fetch(`${apiBase}/api/admin/orders?id=${processingOrderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const fullData = await fullRes.json();
          if (fullData.ok && fullData.order) printOrderSlip(fullData.order);
        } catch { /* ignore */ }
      }
      closeTab(activeTab.id);
      navigate(`/don-hang/${processingOrderId}`);
    } catch (err: any) {
      alert('❌ Lỗi chốt đơn: ' + (err.message || 'Không xác định'));
    } finally { setSubmitting(false); }
  };

  const submitOrder = async () => {
    if (activeTab.processingOrderId) return submitProcessOrder();
    const { selectedCustomerId, cart, customerDebt, deliveryAddress, deliveryName, deliveryPhone, note, voucherCode, packageWeightG, packageDimensions, assignedDriver, codCollectAmount } = activeTab;
    if (!selectedCustomerId) { alert('Vui lòng chọn khách hàng!'); return; }
    if (cart.length === 0) { alert('Giỏ hàng đang trống!'); return; }

    // Giai đoạn C: chặn vượt hạn mức công nợ, trừ khi Trưởng phòng/Admin
    // duyệt (ghi log vào order_history sau khi tạo đơn thành công).
    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    const creditLimit = Number(selectedCustomer?.credit_limit) || 0;
    const projectedDebt = (customerDebt || 0) + total;
    const overLimit = creditLimit > 0 && projectedDebt > creditLimit;
    const canOverride = user?.role === 'admin' || user?.role === 'truong_phong';
    let overrideNote = '';

    if (overLimit && !canOverride) {
      alert(`❌ Đơn này sẽ khiến công nợ khách vượt hạn mức (hạn mức ${money(creditLimit)}, dự kiến công nợ sau đơn ${money(projectedDebt)}). Liên hệ Trưởng phòng để duyệt.`);
      return;
    }
    if (overLimit && canOverride) {
      overrideNote = prompt(`⚠️ Đơn này vượt hạn mức công nợ (hạn mức ${money(creditLimit)}, dự kiến ${money(projectedDebt)}). Nhập lý do để duyệt vượt hạn mức:`, '') || '';
      if (!overrideNote.trim()) { alert('Cần nhập lý do để duyệt vượt hạn mức.'); return; }
    }

    if (!confirm(`Xác nhận tạo đơn nháp cho ${selectedCustomer?.name || 'khách hàng'}?`)) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_order', {
        p_customer_id: selectedCustomerId,
        p_items: cart.map(i => ({
          product_id: i.productId,
          name: i.name,
          unit: i.unit || 'kg',
          quantity: i.quantity,
          base_unit_price: i.price,
        })),
        p_delivery_type: deliveryAddress ? 'shipping' : 'pickup',
        p_delivery_alias: 'Địa chỉ giao hàng',
        p_delivery_name: deliveryName || null,
        p_delivery_phone: deliveryPhone || null,
        p_delivery_address: deliveryAddress || null,
        p_note: note || null,
        p_idempotency_key: `sale-${Date.now()}-${selectedCustomerId}`,
        p_voucher_code: voucherCode || null,
        p_admin_id: user?.id !== 'legacy-admin' ? user?.id : null,
      });
      if (error) throw error;
      const createdOrder = Array.isArray(data) ? data[0] : data;
      const orderCode = createdOrder?.order_code || '';

      // Ghi kèm dữ liệu kiện hàng/người giao nếu sale có nhập (mục 14.2-1) —
      // gọi PATCH riêng sau khi tạo đơn thành công, không sửa admin_create_order
      // vì hàm RPC đó tạo trực tiếp qua Dashboard trước đây, không có migration
      // định nghĩa lại để biết chắc sửa signature có an toàn không.
      if (createdOrder?.id && (packageWeightG || packageDimensions || assignedDriver || codCollectAmount)) {
        try {
          const apiBase = import.meta.env.VITE_API_BASE_URL || '';
          await fetch(`${apiBase}/api/admin/orders`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              orderId: createdOrder.id,
              delivery: {
                packageWeightG: packageWeightG ? Number(packageWeightG) : null,
                packageDimensions: packageDimensions || null,
                assignedDriver: assignedDriver || null,
                codCollectAmount: codCollectAmount ? Number(codCollectAmount) : 0,
              },
            }),
          });
        } catch (deliveryErr) {
          console.error('Lỗi lưu thông tin kiện hàng:', deliveryErr);
        }
      }

      if (overLimit && canOverride && createdOrder?.id) {
        // Ghi log duyệt vượt hạn mức qua API (service-role) — order_history
        // chỉ có policy SELECT cho client, không insert thẳng được. Không
        // chặn tạo đơn nếu bước log lỗi.
        try {
          const apiBase = import.meta.env.VITE_API_BASE_URL || '';
          await fetch(`${apiBase}/api/admin/orders/credit-override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              orderId: createdOrder.id,
              note: `Duyệt vượt hạn mức công nợ (hạn mức ${money(creditLimit)}, dự kiến ${money(projectedDebt)}). Lý do: ${overrideNote}`,
            }),
          });
        } catch (logErr) {
          console.error('Lỗi ghi log duyệt vượt hạn mức:', logErr);
        }
      }

      alert(`✅ Đã tạo đơn nháp ${orderCode} thành công! Khách hàng vào Mini App xác nhận.`);

      // In phiếu tạm ngay sau khi đặt hàng — khớp yêu cầu "khi đặt hàng xong
      // phải có màn hình in phiếu giao hàng tạm" (mục brief 2026-09-10).
      // Lấy lại đơn đầy đủ (kèm order_items + sales_rep_name) từ API vì RPC
      // admin_create_order chỉ trả về hàng orders, chưa có 2 phần này.
      if (createdOrder?.id && confirm('In phiếu tạm cho đơn này ngay bây giờ?')) {
        try {
          const apiBase = import.meta.env.VITE_API_BASE_URL || '';
          const res = await fetch(`${apiBase}/api/admin/orders?id=${createdOrder.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (data.ok && data.order) printOrderSlip(data.order);
        } catch (printErr) {
          console.error('Lỗi tải đơn để in phiếu:', printErr);
        }
      }

      // Đơn xong -> đóng tab này (giống KiotViet đóng tab khi hoàn tất), mở
      // tab mới nếu đây là tab cuối cùng.
      closeTab(activeTab.id);
    } catch (err: any) {
      alert('❌ Lỗi tạo đơn: ' + (err.message || 'Không xác định'));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Tạo đơn hàng (POS)</h1>
        <p className="text-slate-500 text-sm">Tạo đơn nháp cho khách hàng, khách sẽ vào Mini App xác nhận. Mở nhiều tab để phục vụ nhiều khách cùng lúc.</p>
      </header>

      {loadingProcessOrder && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <RefreshCw size={15} className="animate-spin" /> Đang tải đơn để xử lý...
        </div>
      )}
      {activeTab.processingOrderId && (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <ClipboardEdit size={16} /> Đang xử lý đơn <b>{activeTab.orderCode}</b> — sửa xong bấm "Cập nhật & chốt đơn" bên dưới để lưu lại đúng đơn này (không tạo đơn mới).
        </div>
      )}

      {/* Tabs — giống nguyên lý mở nhiều đơn của KiotViet */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t, idx) => {
          const cust = customers.find(c => c.id === t.selectedCustomerId);
          const label = t.orderCode || cust?.name || `Đơn ${idx + 1}`;
          const isActive = t.id === activeTabId;
          return (
            <button key={t.id} onClick={() => setActiveTabId(t.id)}
              className={`shrink-0 flex items-center gap-2 pl-3.5 pr-2 py-2 rounded-xl text-sm font-medium border transition-colors ${isActive ? 'bg-green-600 border-green-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-green-300'}`}>
              <span className="max-w-[120px] truncate">{label}</span>
              {t.cart.length > 0 && (
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${isActive ? 'bg-white/20' : 'bg-green-100 text-green-700'}`}>{t.cart.length}</span>
              )}
              <span onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                className={`rounded-full p-0.5 ${isActive ? 'hover:bg-white/20' : 'hover:bg-slate-100'}`}>
                <X size={13} />
              </span>
            </button>
          );
        })}
        <button onClick={addTab} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-dashed border-slate-300 text-slate-500 hover:border-green-400 hover:text-green-600 transition-colors">
          <PlusCircle size={16} /> Đơn mới
        </button>
      </div>

      {/* Chuyển chế độ Bán nhanh/Bán thường/Bán giao hàng — khớp thanh dưới
          cùng màn Sale/POS KiotViet thật (mục 14.3-6 KE_HOACH) */}
      <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1 w-fit">
        {SALE_MODES.map(m => (
          <button key={m.value} onClick={() => updateActiveTab({ mode: m.value })}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab.mode === m.value ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <span>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customer + Products */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><User size={18} className="text-green-600" />Thông tin khách hàng</h2>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Chọn khách hàng *</label>
              <select value={activeTab.selectedCustomerId} onChange={e => handleSelectCustomer(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20">
                <option value="">-- Chọn Khách Hàng --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone || ''}){c.verification_status && c.verification_status !== 'verified' ? ' — chưa xác thực' : ''}</option>
                ))}
              </select>
            </div>

            {activeTab.selectedCustomerId && (() => {
              const cust = customers.find(c => c.id === activeTab.selectedCustomerId);
              const creditLimit = Number(cust?.credit_limit) || 0;
              const projectedTotal = (activeTab.customerDebt || 0) + total;
              const overLimit = creditLimit > 0 && projectedTotal > creditLimit;
              return (
                <div className={`rounded-xl p-3 text-sm flex flex-wrap gap-x-6 gap-y-1 ${overLimit ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-100'}`}>
                  {cust?.discount_tier && (
                    <span className="text-slate-600">Hạng: <b className="text-slate-800">{cust.discount_tier}</b></span>
                  )}
                  <span className="text-slate-600">
                    Hạn mức công nợ: <b className="text-slate-800">{creditLimit > 0 ? money(creditLimit) : 'Không giới hạn'}</b>
                  </span>
                  <span className="text-slate-600">
                    Công nợ hiện tại: <b className="text-slate-800">{loadingDebt ? '...' : money(activeTab.customerDebt || 0)}</b>
                  </span>
                  {overLimit && (
                    <span className="text-red-600 font-semibold flex items-center gap-1 w-full">
                      <AlertTriangle size={14} /> Đơn này sẽ vượt hạn mức (dự kiến {money(projectedTotal)})
                    </span>
                  )}
                  {cust?.verification_status && cust.verification_status !== 'verified' && (
                    <span className="text-amber-700 font-semibold flex items-center gap-1 w-full">
                      <AlertTriangle size={14} /> Khách hàng chưa xác thực{cust.verification_status === 'rejected' ? ' (đã bị từ chối trước đó)' : ''} — kiểm tra kỹ trước khi lên đơn, hệ thống tự xác thực khi chốt giá đơn này.
                    </span>
                  )}
                </div>
              );
            })()}

            {activeTab.mode !== 'quick' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Người nhận hàng</label>
                    <input type="text" value={activeTab.deliveryName} onChange={e => updateActiveTab({ deliveryName: e.target.value })}
                      placeholder="Tên người nhận..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">SĐT người nhận</label>
                    <input type="text" value={activeTab.deliveryPhone} onChange={e => updateActiveTab({ deliveryPhone: e.target.value })}
                      placeholder="Số điện thoại..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block"><Truck size={13} className="inline mr-1" />Địa chỉ giao hàng</label>
                  {savedAddresses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {savedAddresses.map(a => (
                        <button key={a.id} type="button" onClick={() => applySavedAddress(a)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${activeTab.deliveryAddress === a.address ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-green-300'}`}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <input type="text" value={activeTab.deliveryAddress} onChange={e => updateActiveTab({ deliveryAddress: e.target.value })}
                    placeholder="Để trống = khách nhận tại điểm..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Ghi chú đơn hàng</label>
                  <textarea value={activeTab.note} onChange={e => updateActiveTab({ note: e.target.value })} rows={2}
                    placeholder="Ghi chú giao hàng, yêu cầu đặc biệt..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none" />
                </div>
              </>
            )}

            {/* Kiện hàng tự vận chuyển — luôn hiện ở chế độ "Bán giao hàng",
                hoặc khi đã nhập địa chỉ giao ở chế độ khác (mục 14.2-1) */}
            {(activeTab.mode === 'delivery' || activeTab.deliveryAddress) && activeTab.mode !== 'quick' && (
              <div className="border border-dashed border-slate-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">Kiện hàng &amp; người giao (tự vận chuyển)</p>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" min="0" value={activeTab.packageWeightG} onChange={e => updateActiveTab({ packageWeightG: e.target.value })}
                    placeholder="Khối lượng (gram)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  <input type="text" value={activeTab.packageDimensions} onChange={e => updateActiveTab({ packageDimensions: e.target.value })}
                    placeholder="Kích thước DxRxC (cm)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  <input type="text" value={activeTab.assignedDriver} onChange={e => updateActiveTab({ assignedDriver: e.target.value })}
                    placeholder="Người giao hàng" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  <input type="number" min="0" step="1000" value={activeTab.codCollectAmount} onChange={e => updateActiveTab({ codCollectAmount: e.target.value })}
                    placeholder="Thu hộ COD (đ)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                </div>
              </div>
            )}
          </div>

          {/* Product Search */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Search size={18} className="text-green-600" />Tìm & thêm sản phẩm</h2>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Gõ tên sản phẩm để tìm (tự gợi ý)..."
                className="pl-9 pr-8 py-2.5 w-full border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
              {searching && <RefreshCw size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
            </div>

            {searchTerm.trim().length >= 2 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addFromSearch(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 text-left border-b border-slate-100 last:border-0 transition-colors">
                    {getImgUrl(p.image_url) && <img src={getImgUrl(p.image_url)!} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100" />}
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 text-sm">{p.name}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        {p.categoryLabel || ''} · {p.unit || 'Kg'}
                        {p.trackInventory && (
                          <span className={p.lowStock ? 'text-red-500 font-semibold' : 'text-slate-400'}>
                            · Tồn {p.stockQty ?? 0}{p.lowStock ? ' (sắp hết)' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${p.basePrice != null && p.price !== p.basePrice ? 'text-red-600' : 'text-green-700'}`}>
                        {money(p.price)}
                      </p>
                      <Plus size={16} className="text-green-500 ml-auto" />
                    </div>
                  </button>
                ))}
                {!searching && searchResults.length === 0 && (
                  <p className="px-4 py-3 text-xs text-slate-400">Không tìm thấy — có thể tạo mới vào danh mục bên dưới.</p>
                )}
                <button onClick={() => setShowQuickAddProduct(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-green-700 hover:bg-green-50 border-t border-slate-100">
                  <Plus size={15} /> Thêm "{searchTerm}" vào danh mục hàng hóa (có ảnh, tự sinh mã)
                </button>
              </div>
            )}

            {/* Custom Product */}
            <div className="border border-dashed border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">Thêm sản phẩm ngoài hệ thống</p>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                  placeholder="Tên sản phẩm *" className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                <input type="number" min="0" step="1000" value={customPrice || ''} onChange={e => setCustomPrice(Number(e.target.value))}
                  placeholder="Đơn giá (đ)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                <div className="flex gap-2">
                  <input type="number" min="0.001" step="0.001" value={customQty} onChange={e => setCustomQty(Number(e.target.value))}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  <input type="text" value={customUnit} onChange={e => setCustomUnit(e.target.value)}
                    placeholder="ĐVT" className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                </div>
              </div>
              <button onClick={addCustom} className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 transition-colors">
                <Plus size={16} /> Thêm vào giỏ
              </button>
            </div>
          </div>
        </div>

        {/* Right: Cart */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden sticky top-4">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart size={18} className="text-green-600" />Giỏ hàng</h2>
              <span className="text-sm text-slate-500">{activeTab.cart.length} sản phẩm</span>
            </div>

            {/* Cart Items */}
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {activeTab.cart.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />Giỏ hàng đang trống
                </div>
              ) : activeTab.cart.map((item, idx) => (
                <div key={idx} className="p-3 text-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 leading-tight">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.productId ? item.productId.substring(0, 8) : 'Tùy chỉnh'} | {item.unit}</p>
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors mt-0.5">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e => updateQty(idx, Number(e.target.value))}
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none" />
                    <input type="number" min="0" step="1000" value={item.price} onChange={e => updatePrice(idx, Number(e.target.value))}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none" />
                    <span className="text-xs font-semibold text-slate-700 py-1 min-w-[60px] text-right">{money(item.quantity * item.price)}</span>
                  </div>
                  {/* Khách đặt hàng không bị chặn theo tồn kho nữa — chỉ cảnh
                      báo cho sale biết mà báo thu mua; nút "Nhập hàng" chỉ
                      hiện với admin/thu mua (2026-09-11, tắt quyền của sale). */}
                  {item.trackInventory && (Number(item.stockQty) || 0) < item.quantity && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                      <span className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                        <AlertTriangle size={12} /> Tồn {Number(item.stockQty) || 0}, thiếu {Math.max(0, item.quantity - (Number(item.stockQty) || 0))}
                        {!canStockIn && ' — báo thu mua nhập hàng'}
                      </span>
                      {canStockIn && (
                        <button onClick={() => restockItem(idx)} className="text-[11px] font-semibold text-red-700 hover:underline shrink-0">
                          + Nhập hàng
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Voucher — ẩn ở chế độ Bán nhanh để giảm số field cần điền */}
            {activeTab.mode !== 'quick' && (
              <div className="p-4 border-t border-slate-100 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><Tag size={12} />Mã Voucher</label>
                  <div className="flex gap-2">
                    <input type="text" value={activeTab.voucherCode} onChange={e => updateActiveTab({ voucherCode: e.target.value.toUpperCase() })}
                      placeholder="Nhập mã..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 uppercase" />
                    <button onClick={applyVoucher} disabled={applyingVoucher}
                      className="px-3 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors">
                      {applyingVoucher ? <RefreshCw size={14} className="animate-spin" /> : 'Áp dụng'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Chiết khấu (đ)</label>
                    <input type="number" min="0" step="1000" value={activeTab.discountAmount || ''} onChange={e => updateActiveTab({ discountAmount: Number(e.target.value) })}
                      placeholder="0đ" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1"><Truck size={11} />Phí ship (đ)</label>
                    <input type="number" min="0" step="1000" value={activeTab.shippingAmount || ''} onChange={e => updateActiveTab({ shippingAmount: Number(e.target.value) })}
                      placeholder="0đ" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-2 text-sm">
              <div className="flex justify-between text-slate-500"><span>Tạm tính</span><span>{money(subtotal)}</span></div>
              {activeTab.voucherDiscount > 0 && <div className="flex justify-between text-green-600"><span>Voucher</span><span>-{money(activeTab.voucherDiscount)}</span></div>}
              {activeTab.discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Chiết khấu</span><span>-{money(activeTab.discountAmount)}</span></div>}
              {activeTab.shippingAmount > 0 && <div className="flex justify-between text-slate-500"><span>Phí giao hàng</span><span>+{money(activeTab.shippingAmount)}</span></div>}
              <div className="flex justify-between font-bold text-lg text-slate-800 pt-2 border-t border-slate-200">
                <span>Tổng đơn</span><span className="text-red-600">{money(total)}</span>
              </div>
            </div>

            {/* Submit */}
            <div className="p-4 border-t border-slate-100">
              <button onClick={submitOrder} disabled={submitting || activeTab.cart.length === 0 || (!activeTab.processingOrderId && !activeTab.selectedCustomerId)}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-green-900/20">
                <CheckCircle2 size={20} />
                {submitting
                  ? (activeTab.processingOrderId ? 'Đang chốt đơn...' : 'Đang tạo đơn...')
                  : activeTab.processingOrderId ? `CẬP NHẬT & CHỐT ĐƠN ${activeTab.orderCode}` : 'TẠO ĐƠN HÀNG (NHÁP)'}
              </button>
              <p className="text-center text-xs text-slate-400 mt-2">
                {activeTab.processingOrderId ? 'Chốt lại đơn có sẵn — không tạo đơn mới' : 'Đơn nháp sẽ được gửi cho khách xác nhận qua Mini App'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showQuickAddProduct && (
        <QuickAddProductModal
          apiBase={import.meta.env.VITE_API_BASE_URL || ''}
          token={token}
          initialName={searchTerm}
          onClose={() => setShowQuickAddProduct(false)}
          onCreated={(product) => {
            updateActiveTab(t => ({ cart: [...t.cart, { productId: product.id, name: product.name, unit: product.unit || 'Kg', quantity: 1, price: Number(product.price_retail), image_url: product.image_url || undefined }] }));
            setShowQuickAddProduct(false);
            setSearchTerm('');
            setSearchResults([]);
          }}
        />
      )}
    </div>
  );
}
