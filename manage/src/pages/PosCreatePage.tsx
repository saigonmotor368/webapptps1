import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { printOrderSlip } from '../lib/printOrder';
import QuickAddProductModal from '../components/QuickAddProductModal';
import ProductSearchBox, { type SearchProductItem } from '../components/ProductSearchBox';
import { getApiBase } from '../lib/apiBase';
import {
  Search, Plus, Tag, Truck, RefreshCw, ShoppingCart, User, X, CheckCircle2, AlertTriangle, PlusCircle, ClipboardEdit,
  Calendar, Clock, MapPin
} from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

function normalizeSearch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

interface CartItem {
  productId: string | null;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  note?: string; // Ghi chú từng dòng (quy cách, thái mỏng, đóng gói...)
  orderedQty?: number | null; // Số lượng khách đặt ban đầu (WP6)
  changeReason?: string; // Lý do điều chỉnh (Hết hàng / Khách yêu cầu...) (WP6)
  agreedWithCustomer?: boolean; // Đã thống nhất với khách (WP6)
  image_url?: string;
  trackInventory?: boolean;
  stockQty?: number | null;
  lowStock?: boolean;
}

export interface DeletedOriginalItem {
  productId: string | null;
  name: string;
  unit: string;
  orderedQty: number;
  reason: string;
  agreedWithCustomer?: boolean;
}

export interface CutoffInfo {
  isLate: boolean;
  minutesLeft: number;
  cutoffTimeStr: string;
  earliestDate?: string;
}

// Đơn hàng POS hỗ trợ ngày giao, điểm giao và ghi chú dòng.
interface OrderTab {
  id: string;
  idempotencyKey: string; // Khóa chống trùng lặp đơn (UUID sinh 1 lần/tab, gửi lên server)
  selectedCustomerId: string;
  customerDebt: number | null;
  deliveryDate: string; // Ngày giao (lấy từ order-cutoff endpoint)
  cutoffInfo: CutoffInfo | null;
  deliveryAddressId: string; // ID điểm giao từ customer_addresses
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  saveNewAddress?: boolean;
  note: string;
  cart: CartItem[];
  deletedOriginalItems?: DeletedOriginalItem[]; // WP6: danh sách mặt hàng đã xóa khỏi đơn cũ
  discountAmount: number;
  voucherCode: string;
  voucherDiscount: number;
  shippingAmount: number;
  packageWeightG: string;
  packageDimensions: string;
  assignedDriver: string;
  codCollectAmount: string;
  mode: 'quick' | 'normal' | 'delivery';
  processingOrderId?: string;
  orderCode?: string;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function newTab(defaultDeliveryDate = ''): OrderTab {
  return {
    id: generateUuid(),
    idempotencyKey: generateUuid(),
    selectedCustomerId: '', customerDebt: null,
    deliveryDate: defaultDeliveryDate,
    cutoffInfo: null,
    deliveryAddressId: '',
    deliveryName: '', deliveryPhone: '', deliveryAddress: '',
    saveNewAddress: false,
    note: '',
    cart: [],
    deletedOriginalItems: [],
    discountAmount: 0, voucherCode: '', voucherDiscount: 0, shippingAmount: 0,
    packageWeightG: '', packageDimensions: '', assignedDriver: '', codCollectAmount: '',
    mode: 'normal',
  };
}

function formatMinutesLeft(mins: number) {
  if (mins <= 0) return 'đã qua giờ chốt';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `còn ${h}h${m > 0 ? m + 'p' : ''} để chốt` : `còn ${m} phút để chốt`;
}

const SALE_MODES: { value: OrderTab['mode']; label: string; icon: string }[] = [
  { value: 'quick', label: 'Bán nhanh', icon: '⚡' },
  { value: 'normal', label: 'Bán thường', icon: '🧾' },
  { value: 'delivery', label: 'Bán giao hàng', icon: '🚚' },
];

const TABS_STORAGE_KEY = 'tps1_pos_tabs';
const CUSTOMER_CACHE_TTL_MS = 2 * 60 * 1000;
const customerCache = new Map<string, { data: any[]; expiresAt: number }>();
const customerLoads = new Map<string, Promise<any[]>>();

export default function PosCreatePage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState<any[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(0);
  const [loadingDebt, setLoadingDebt] = useState(false);
  const [loadingProcessOrder, setLoadingProcessOrder] = useState(false);

  const [earliestDeliveryDate, setEarliestDeliveryDate] = useState<string>('');

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
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const updateActiveTab = useCallback((patch: Partial<OrderTab> | ((t: OrderTab) => Partial<OrderTab>)) => {
    setTabs(prev => prev.map(t => t.id !== activeTabId ? t : { ...t, ...(typeof patch === 'function' ? patch(t) : patch) }));
  }, [activeTabId]);

  // 1. Lấy thông tin cutoff và earliestDate từ server ngay khi mount
  useEffect(() => {
    if (!token) return;
    const apiBase = getApiBase();
    fetch(`${apiBase}/api/admin/order-cutoff`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.earliestDate) {
          setEarliestDeliveryDate(data.earliestDate);
          setTabs(prev =>
            prev.map(t => (!t.deliveryDate ? { ...t, deliveryDate: data.earliestDate } : t))
          );
        }
      })
      .catch(err => console.warn('Lỗi lấy thông tin cutoff:', err));
  }, [token]);

  // 2. Cập nhật thông tin cutoff khi deliveryDate của activeTab thay đổi (debounce 250ms)
  useEffect(() => {
    if (!token || !activeTab.deliveryDate) return;
    const timer = setTimeout(async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(
          `${apiBase}/api/admin/order-cutoff?deliveryDate=${encodeURIComponent(activeTab.deliveryDate)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.ok) {
          updateActiveTab({
            cutoffInfo: {
              isLate: Boolean(data.isLate),
              minutesLeft: Number(data.minutesLeft) || 0,
              cutoffTimeStr: data.cutoffTimeStr || '16:30',
              earliestDate: data.earliestDate,
            },
          });
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra giờ chốt:', err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [activeTab.deliveryDate, token, updateActiveTab]);

  const addTab = () => {
    const t = newTab(earliestDeliveryDate);
    setTabs(prev => [...prev, t]);
    setActiveTabId(t.id);
  };
  const closeTab = (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab && (tab.cart.length > 0 || tab.selectedCustomerId) && !confirm('Đóng đơn này? Dữ liệu chưa gửi sẽ bị mất.')) return;
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) { const t = newTab(earliestDeliveryDate); return [t]; }
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
  // khớp luồng xử lý đơn của TPS1. Chỉ chạy 1 lần khi có
  // param, xoá param sau khi đã nạp xong để F5 không nạp lại tab trùng.
  const loadedProcessOrderRef = useRef<string | null>(null);
  useEffect(() => {
    const processOrderId = searchParams.get('processOrderId');
    if (!processOrderId || loadedProcessOrderRef.current === processOrderId || !token) return;
    loadedProcessOrderRef.current = processOrderId;
    setLoadingProcessOrder(true);
    (async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/admin/orders?id=${processOrderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Máy chủ phản hồi không đúng (${res.status}): ${text.slice(0, 100)}`);
        }
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
          deletedOriginalItems: [],
          cart: (o.order_items || []).map((it: any) => ({
            productId: it.product_id,
            name: it.name,
            unit: it.unit || 'Kg',
            quantity: Number(it.quantity),
            price: Number(it.unit_price),
            orderedQty: it.ordered_quantity != null ? Number(it.ordered_quantity) : Number(it.quantity),
            note: it.customer_note || it.pricing_note || '',
            image_url: undefined,
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
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  // Địa chỉ giao đã lưu của khách (mục 14.3-5 KE_HOACH) — chọn nhanh thay vì
  // gõ tay mỗi lần cho khách công ty giao nhiều địa điểm.
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

  const loadCustomers = useCallback(async (force = false) => {
    if (!token || !user?.id) return;
    const cacheKey = `${user.role || 'staff'}:${user.id}`;
    const cached = force ? undefined : customerCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setCustomers(cached.data);
      setCustomersError('');
      return;
    }

    setCustomersLoading(true);
    setCustomersError('');
    try {
      let request = customerLoads.get(cacheKey);
      if (!request) {
        request = (async () => {
          // RPC admin_list_customers đã bị khóa theo migration bảo mật. Luôn đi
          // qua API có xác thực JWT: Admin thấy toàn bộ khách; Sale chỉ nhận
          // khách được phân công theo kiểm tra role ở backend.
          const apiBase = getApiBase();
          const response = await fetch(`${apiBase}/api/admin/customers/list?all=1`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không tải được danh sách khách hàng');
          return (payload.customers || [])
            .filter((customer: any) => customer.is_active !== false)
            .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
        })().finally(() => customerLoads.delete(cacheKey));
        customerLoads.set(cacheKey, request);
      }

      const data = await request;
      customerCache.set(cacheKey, { data, expiresAt: Date.now() + CUSTOMER_CACHE_TTL_MS });
      setCustomers(data);
    } catch (err: any) {
      console.error('Lỗi tải khách hàng:', err);
      setCustomers([]);
      setCustomersError(err?.message || 'Không tải được danh sách khách hàng');
    } finally {
      setCustomersLoading(false);
    }
  }, [token, user]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const selectedCustomer = useMemo(
    () => customers.find(customer => customer.id === activeTab.selectedCustomerId) || null,
    [customers, activeTab.selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    const query = normalizeSearch(customerSearch);
    const rows = query
      ? customers.filter(customer => normalizeSearch([
          customer.partner_code,
          customer.name,
          customer.company,
          customer.phone,
        ].filter(Boolean).join(' ')).includes(query))
      : customers;
    return rows.slice(0, 30);
  }, [customers, customerSearch]);

  useEffect(() => {
    if (!selectedCustomer) {
      if (activeTab.selectedCustomerId) setCustomerSearch('');
      return;
    }
    setCustomerSearch([selectedCustomer.partner_code, selectedCustomer.name].filter(Boolean).join(' · '));
  }, [activeTab.id, activeTab.selectedCustomerId, selectedCustomer]);

  useEffect(() => { setHighlightedCustomerIndex(0); }, [customerSearch]);

  const handleSelectCustomer = (id: string) => {
    const cust = customers.find(c => c.id === id);
    setSavedAddresses([]);
    if (cust) {
      setCustomerSearch([cust.partner_code, cust.name].filter(Boolean).join(' · '));
      setCustomerPickerOpen(false);
      updateActiveTab({
        selectedCustomerId: id,
        deliveryName: cust.name || cust.default_shipping_name || '',
        deliveryPhone: cust.phone || cust.default_shipping_phone || '',
        deliveryAddress: cust.default_shipping_address || '',
        deliveryAddressId: '',
        customerDebt: null,
      });
      fetchCustomerDebt(id);
      supabase.from('customer_addresses').select('*').eq('customer_id', id).order('is_default', { ascending: false })
        .then(({ data }) => {
          const list = data || [];
          setSavedAddresses(list);
          const def = list.find((a: any) => a.is_default) || list[0];
          if (def) {
            updateActiveTab(t => ({
              ...t,
              deliveryAddressId: def.id,
              deliveryAddress: def.address || t.deliveryAddress,
              deliveryName: def.contact_name || t.deliveryName,
              deliveryPhone: def.contact_phone || t.deliveryPhone,
            }));
          }
        });
    } else {
      setCustomerSearch('');
      setCustomerPickerOpen(false);
      updateActiveTab({ selectedCustomerId: '', deliveryName: '', deliveryPhone: '', deliveryAddress: '', deliveryAddressId: '', customerDebt: null });
    }
  };

  const handleCustomerSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!customerPickerOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setCustomerPickerOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedCustomerIndex(index => Math.min(index + 1, filteredCustomers.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedCustomerIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && filteredCustomers[highlightedCustomerIndex]) {
      event.preventDefault();
      handleSelectCustomer(filteredCustomers[highlightedCustomerIndex].id);
    } else if (event.key === 'Escape') {
      setCustomerPickerOpen(false);
    }
  };

  const applySavedAddress = (addr: any) => {
    updateActiveTab({
      deliveryAddressId: addr.id,
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

  const addFromSearch = (p: SearchProductItem) => {
    if (activeTab.cart.some(i => i.productId === p.id)) {
      alert('Sản phẩm đã có trong giỏ, hãy tăng số lượng!'); return;
    }
    updateActiveTab(t => ({
      cart: [...t.cart, {
        productId: p.id,
        name: p.name,
        unit: p.unit || 'Kg',
        quantity: 1,
        price: Number(p.price),
        image_url: p.thumb_url || p.image_url || undefined,
        trackInventory: !!p.trackInventory,
        stockQty: p.stockQty ?? null,
        lowStock: !!p.lowStock,
      }],
    }));
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
      const apiBase = getApiBase();
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
  const updateItemNote = (idx: number, note: string) => updateActiveTab(t => ({ cart: t.cart.map((i, n) => n === idx ? { ...i, note } : i) }));
  const updateItemChangeReason = (idx: number, changeReason: string) => updateActiveTab(t => ({ cart: t.cart.map((i, n) => n === idx ? { ...i, changeReason } : i) }));
  const updateItemAgreed = (idx: number, agreedWithCustomer: boolean) => updateActiveTab(t => ({ cart: t.cart.map((i, n) => n === idx ? { ...i, agreedWithCustomer } : i) }));

  const removeItem = (idx: number) => {
    const item = activeTab.cart[idx];
    if (activeTab.processingOrderId && item && item.orderedQty != null) {
      const reason = prompt(`Xóa mặt hàng "${item.name}" (khách đặt ${item.orderedQty} ${item.unit}). Nhập lý do xóa:`, 'Hết hàng');
      if (reason === null) return;
      updateActiveTab(t => ({
        cart: t.cart.filter((_, n) => n !== idx),
        deletedOriginalItems: [
          ...(t.deletedOriginalItems || []),
          {
            productId: item.productId,
            name: item.name,
            unit: item.unit,
            orderedQty: item.orderedQty!,
            reason: reason.trim() || 'Xóa theo yêu cầu',
            agreedWithCustomer: true,
          }
        ]
      }));
      return;
    }
    updateActiveTab(t => ({ cart: t.cart.filter((_, n) => n !== idx) }));
  };

  const restoreDeletedItem = (delIdx: number) => {
    const del = (activeTab.deletedOriginalItems || [])[delIdx];
    if (!del) return;
    updateActiveTab(t => ({
      deletedOriginalItems: (t.deletedOriginalItems || []).filter((_, i) => i !== delIdx),
      cart: [
        ...t.cart,
        {
          productId: del.productId,
          name: del.name,
          unit: del.unit,
          quantity: del.orderedQty,
          price: 0,
          orderedQty: del.orderedQty,
          note: '',
          changeReason: '',
        }
      ]
    }));
  };

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

    // WP6: Kiểm tra lý do điều chỉnh cho các mặt hàng bị đổi SL hoặc thêm mới
    for (const it of cart) {
      if (it.orderedQty != null && Math.abs(it.quantity - it.orderedQty) > 0.0001 && !it.changeReason) {
        alert(`Vui lòng chọn lý do điều chỉnh số lượng cho "${it.name}" (khách đặt: ${it.orderedQty}, số lượng mới: ${it.quantity})`);
        return;
      }
      if (it.orderedQty == null) {
        if (!it.changeReason) {
          alert(`Vui lòng chọn lý do thêm mặt hàng "${it.name}" vào đơn`);
          return;
        }
        if (!it.agreedWithCustomer) {
          alert(`Vui lòng xác nhận "Đã thống nhất với khách" cho mặt hàng thêm mới "${it.name}"`);
          return;
        }
      }
    }

    if (!confirm(`Xác nhận cập nhật & chốt đơn ${orderCode}?`)) return;
    setSubmitting(true);
    try {
      const apiBase = getApiBase();

      // WP6: Ghi vết thay đổi vào order_history trước khi finalize
      const itemChanges: any[] = [];
      for (const it of cart) {
        if (it.orderedQty == null) {
          itemChanges.push({
            type: 'added',
            productName: it.name,
            newQty: it.quantity,
            reason: it.changeReason || 'Thêm mặt hàng mới',
            agreedWithCustomer: !!it.agreedWithCustomer,
          });
        } else if (Math.abs(it.quantity - it.orderedQty) > 0.0001) {
          itemChanges.push({
            type: 'qty',
            productName: it.name,
            orderedQty: it.orderedQty,
            oldQty: it.orderedQty,
            newQty: it.quantity,
            reason: it.changeReason || 'Điều chỉnh số lượng',
            agreedWithCustomer: !!it.agreedWithCustomer,
          });
        }
      }
      for (const del of (activeTab.deletedOriginalItems || [])) {
        itemChanges.push({
          type: 'removed',
          productName: del.name,
          orderedQty: del.orderedQty,
          oldQty: del.orderedQty,
          newQty: 0,
          reason: del.reason || 'Xóa mặt hàng',
          agreedWithCustomer: !!del.agreedWithCustomer,
        });
      }

      if (itemChanges.length > 0) {
        await fetch(`${apiBase}/api/admin/orders/track-adjustment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            orderId: processingOrderId,
            itemChanges,
            actor: user?.name || 'Nhân viên Vận hành',
          }),
        }).catch(err => console.warn('Lỗi ghi track-adjustment:', err));
      }

      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: processingOrderId,
          customerTier: customers.find(c => c.id === activeTab.selectedCustomerId)?.discount_tier || 'VIP0',
          pricingMode: 'manual_item_price',
          orderDiscountPercent: 0,
          shippingAmount,
          items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, finalUnitPrice: i.price, note: i.note || '' })),
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
    const {
      selectedCustomerId, cart, customerDebt,
      deliveryDate, deliveryAddressId, deliveryAddress, deliveryName, deliveryPhone, saveNewAddress,
      note, voucherCode, packageWeightG, packageDimensions, assignedDriver, codCollectAmount
    } = activeTab;

    if (!selectedCustomerId) { alert('Vui lòng chọn khách hàng!'); return; }
    if (cart.length === 0) { alert('Giỏ hàng đang trống!'); return; }

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
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/admin/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          idempotencyKey: activeTab.idempotencyKey,
          items: cart.map(i => ({
            productId: i.productId,
            name: i.name,
            unit: i.unit || 'Kg',
            quantity: i.quantity,
            price: i.price,
            note: i.note || null,
          })),
          deliveryDate: deliveryDate || earliestDeliveryDate || '',
          deliveryAddressId: deliveryAddressId || null,
          deliveryName: deliveryName || null,
          deliveryPhone: deliveryPhone || null,
          deliveryAddress: deliveryAddress || null,
          deliveryAlias: 'Địa chỉ giao hàng',
          saveNewAddress: !!saveNewAddress,
          note: note || null,
          voucherCode: voucherCode || null,
          packageWeightG: packageWeightG ? Number(packageWeightG) : null,
          packageDimensions: packageDimensions || null,
          assignedDriver: assignedDriver || null,
          codCollectAmount: codCollectAmount ? Number(codCollectAmount) : null,
          creditOverrideNote: overrideNote || null,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không tạo được đơn hàng');

      const orderCode = data.orderCode || '';
      const orderId = data.orderId;

      if (data.warnings && data.warnings.length > 0) {
        alert(`✅ Đơn hàng ${orderCode} đã tạo thành công! (Lưu ý: chưa lưu đủ thông tin giao hàng, kiểm tra lại ở chi tiết đơn). Khách hàng vào Mini App xác nhận.`);
      } else {
        alert(`✅ Đã tạo đơn nháp ${orderCode} thành công! Khách hàng vào Mini App xác nhận.`);
      }

      // In phiếu tạm ngay sau khi đặt hàng (nếu có nhu cầu)
      if (orderId && confirm('In phiếu tạm cho đơn này ngay bây giờ?')) {
        try {
          const fullRes = await fetch(`${apiBase}/api/admin/orders?id=${orderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const fullData = await fullRes.json();
          if (fullData.ok && fullData.order) printOrderSlip(fullData.order);
        } catch (printErr) {
          console.error('Lỗi tải đơn để in phiếu:', printErr);
        }
      }

      // Đơn xong -> đóng tab này, mở tab mới nếu đây là tab cuối
      closeTab(activeTab.id);
    } catch (err: any) {
      alert('❌ Lỗi tạo đơn: ' + (err.message || 'Không xác định'));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-green-700">Bán hàng</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tạo đơn hàng (POS)</h1>
          <p className="mt-1 text-sm text-slate-500">Chọn khách, tìm hàng và tạo đơn nháp trên cùng một màn hình.</p>
        </div>
        <p className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm lg:block">Rê chuột vào thanh menu để mở rộng</p>
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

      {/* Các tab để xử lý nhiều đơn đồng thời */}
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

      {/* Chuyển chế độ Bán nhanh/Bán thường/Bán giao hàng */}
      <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1 w-fit">
        {SALE_MODES.map(m => (
          <button key={m.value} onClick={() => updateActiveTab({ mode: m.value })}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab.mode === m.value ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <span>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_430px] xl:gap-6">
        {/* Left: Customer + Products */}
        <div className="min-w-0 space-y-5">
          {/* Customer Selection & Delivery Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50"><User size={17} className="text-green-600" /></span>Khách hàng &amp; giao hàng</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">Bước 1</span>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.85fr)]">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-500">Tìm và chọn khách hàng *</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void loadCustomers(true)} disabled={customersLoading}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-green-700 disabled:opacity-50" title="Làm mới danh sách khách hàng">
                      <RefreshCw size={12} className={customersLoading ? 'animate-spin' : ''} /> Làm mới
                    </button>
                    <button type="button" onClick={() => window.open('/khach-hang/moi', '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 hover:text-green-800">
                      <Plus size={13} /> Khách hàng mới
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <div className={`flex items-center rounded-xl border bg-white transition-shadow ${customerPickerOpen ? 'border-green-500 ring-2 ring-green-500/15' : 'border-slate-200'}`}>
                    <Search size={17} className="ml-3 shrink-0 text-slate-400" />
                    <input
                      value={customerSearch}
                      onChange={event => { setCustomerSearch(event.target.value); setCustomerPickerOpen(true); }}
                      onFocus={event => { event.currentTarget.select(); setCustomerPickerOpen(true); }}
                      onBlur={() => window.setTimeout(() => setCustomerPickerOpen(false), 160)}
                      onKeyDown={handleCustomerSearchKeyDown}
                      disabled={customersLoading}
                      placeholder={customersLoading ? 'Đang tải danh sách khách hàng...' : 'Gõ mã KH, tên, công ty hoặc SĐT...'}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-medium outline-none placeholder:font-normal placeholder:text-slate-400"
                    />
                    {(customerSearch || activeTab.selectedCustomerId) && (
                      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => handleSelectCustomer('')}
                        className="mr-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Bỏ chọn khách hàng">
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {customerPickerOpen && !customersLoading && (
                    <div className="absolute z-40 mt-2 max-h-[430px] w-full min-w-[520px] max-w-[760px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl max-sm:min-w-full">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-2 py-2 text-[11px] text-slate-400">
                        <span>{filteredCustomers.length < customers.length ? `Hiển thị ${filteredCustomers.length} kết quả phù hợp` : `${customers.length} khách hàng đang hoạt động`}</span>
                        <span>↑↓ chọn · Enter xác nhận</span>
                      </div>
                      {filteredCustomers.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-slate-500">
                          <p>Không tìm thấy khách hàng phù hợp.</p>
                          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => window.open('/khach-hang/moi', '_blank', 'noopener,noreferrer')}
                            className="mt-2 font-bold text-green-700 hover:underline">+ Tạo khách hàng mới</button>
                        </div>
                      ) : filteredCustomers.map((customer, index) => (
                        <button type="button" key={customer.id}
                          onMouseDown={event => event.preventDefault()}
                          onMouseEnter={() => setHighlightedCustomerIndex(index)}
                          onClick={() => handleSelectCustomer(customer.id)}
                          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${index === highlightedCustomerIndex ? 'border-green-200 bg-green-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
                          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xs font-extrabold text-emerald-700">
                            {String(customer.name || 'KH').trim().slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 space-y-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="whitespace-normal break-words text-sm font-extrabold leading-snug text-slate-900">{customer.name || 'Chưa có tên'}</span>
                              {customer.verification_status && customer.verification_status !== 'verified' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">CHƯA XÁC THỰC</span>}
                            </span>
                            {customer.company && <span className="block whitespace-normal break-words text-xs font-medium leading-snug text-slate-600">{customer.company}</span>}
                            <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                              <span>Mã KH: <b className="text-slate-700">{customer.partner_code || '—'}</b></span>
                              <span>SĐT: <b className="text-slate-700">{customer.phone || 'Chưa cập nhật'}</b></span>
                            </span>
                          </span>
                          {activeTab.selectedCustomerId === customer.id && <CheckCircle2 size={17} className="shrink-0 text-green-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {customersError && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">
                    <span>{customersError}</span>
                    <button type="button" onClick={() => void loadCustomers(true)} className="shrink-0 font-bold underline">Tải lại</button>
                  </div>
                )}
                {selectedCustomer && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-green-100 bg-green-50/70 px-3 py-2.5 text-xs">
                    <span className="font-bold text-green-800">Đã chọn: {selectedCustomer.name || 'Chưa có tên'}</span>
                    <span className="text-slate-600">{selectedCustomer.partner_code || 'Chưa có mã KH'}</span>
                    {selectedCustomer.company && <span className="text-slate-600">{selectedCustomer.company}</span>}
                    {selectedCustomer.phone && <span className="font-medium text-slate-700">{selectedCustomer.phone}</span>}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                  <Calendar size={13} className="text-green-600" />
                  Ngày giao hàng *
                </label>
                <input type="date" value={activeTab.deliveryDate} onChange={e => updateActiveTab({ deliveryDate: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                {activeTab.cutoffInfo?.isLate ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5 flex items-center gap-1.5 font-medium">
                    <Clock size={13} className="shrink-0 text-amber-600" />
                    <span>Đơn sau giờ chốt ({activeTab.cutoffInfo.cutoffTimeStr || '16:30'} ngày {activeTab.deliveryDate}) — hệ thống sẽ đánh cờ trễ giờ</span>
                  </p>
                ) : activeTab.cutoffInfo ? (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 mt-1.5 flex items-center gap-1.5 font-medium">
                    <Clock size={13} className="shrink-0 text-emerald-600" />
                    <span>Hạn chốt {activeTab.cutoffInfo.cutoffTimeStr} ({formatMinutesLeft(activeTab.cutoffInfo.minutesLeft)})</span>
                  </p>
                ) : null}
              </div>
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <MapPin size={13} className="text-red-500" />
                      Điểm giao hàng
                    </label>
                    {savedAddresses.length > 0 && (
                      <span className="text-[11px] text-slate-400">Chọn nhanh từ sổ địa chỉ khách:</span>
                    )}
                  </div>
                  {savedAddresses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {savedAddresses.map(a => (
                        <button key={a.id} type="button" onClick={() => applySavedAddress(a)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors flex items-center gap-1 ${activeTab.deliveryAddressId === a.id || activeTab.deliveryAddress === a.address ? 'bg-green-600 border-green-600 text-white font-medium shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-green-300'}`}>
                          <span>{a.label || 'Địa chỉ'}</span>
                          {a.is_default && <span className="text-[9px] bg-white/30 rounded px-1">Mặc định</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <input type="text" value={activeTab.deliveryAddress}
                    onChange={e => updateActiveTab({ deliveryAddress: e.target.value, deliveryAddressId: '' })}
                    placeholder="Để trống = khách nhận tại điểm..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  {activeTab.deliveryAddress && !savedAddresses.some(a => a.address === activeTab.deliveryAddress) && (
                    <label className="flex items-center gap-2 mt-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={!!activeTab.saveNewAddress} onChange={e => updateActiveTab({ saveNewAddress: e.target.checked })}
                        className="rounded border-slate-300 text-green-600 focus:ring-green-500/20" />
                      <span>Lưu địa chỉ này vào sổ địa chỉ của khách để lần sau chọn nhanh</span>
                    </label>
                  )}
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
            
            <ProductSearchBox
              apiBase={getApiBase()}
              token={token}
              customerId={activeTab.selectedCustomerId}
              placeholder="Gõ tên hoặc mã sản phẩm (tự tìm, Enter để chọn)..."
              onSelectProduct={(p) => addFromSearch(p)}
              onQuickAddProduct={(initialName) => {
                setSearchTerm(initialName);
                setShowQuickAddProduct(true);
              }}
            />

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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-slate-800 leading-tight">{item.name}</p>
                        {activeTab.processingOrderId && item.orderedQty == null && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded">Mặt hàng mới</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-slate-400">{item.productId ? item.productId.substring(0, 8) : 'Tùy chỉnh'} | {item.unit}</p>
                        {activeTab.processingOrderId && item.orderedQty != null && (
                          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Khách đặt: {item.orderedQty} {item.unit}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors mt-0.5" title="Xóa mặt hàng">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="w-20">
                      <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e => updateQty(idx, Number(e.target.value))}
                        title="Số lượng (hỗ trợ số thập phân)"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none font-medium" />
                    </div>
                    <div className="flex-1">
                      <input type="number" min="0" step="1000" value={item.price} onChange={e => updatePrice(idx, Number(e.target.value))}
                        title="Đơn giá"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none font-medium" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 py-1 min-w-[65px] text-right">{money(item.quantity * item.price)}</span>
                  </div>

                  {/* WP6: Lý do điều chỉnh khi số lượng khác số khách đặt ban đầu */}
                  {activeTab.processingOrderId && item.orderedQty != null && Math.abs(item.quantity - item.orderedQty) > 0.0001 && (
                    <div className="mt-1.5 p-2 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1">
                      <p className="text-[11px] text-amber-900 font-medium">
                        ⚠️ Đổi số lượng: {item.orderedQty} → {item.quantity} {item.unit}
                      </p>
                      <select
                        value={item.changeReason || ''}
                        onChange={e => updateItemChangeReason(idx, e.target.value)}
                        className="w-full border border-amber-300 rounded px-2 py-1 text-xs bg-white text-slate-700 focus:outline-none"
                      >
                        <option value="">-- Chọn lý do điều chỉnh * --</option>
                        <option value="Hết hàng">Hết hàng</option>
                        <option value="Khách yêu cầu">Khách yêu cầu</option>
                        <option value="Thay thế đã thống nhất KH">Thay thế đã thống nhất KH</option>
                        <option value="Khác">Khác</option>
                      </select>
                      {item.changeReason === 'Thay thế đã thống nhất KH' && (
                        <label className="flex items-center gap-1.5 text-xs text-amber-900 cursor-pointer pt-0.5">
                          <input
                            type="checkbox"
                            checked={!!item.agreedWithCustomer}
                            onChange={e => updateItemAgreed(idx, e.target.checked)}
                          />
                          Đã thống nhất với khách *
                        </label>
                      )}
                    </div>
                  )}

                  {/* WP6: Lý do khi thêm mặt hàng mới vào đơn cũ */}
                  {activeTab.processingOrderId && item.orderedQty == null && (
                    <div className="mt-1.5 p-2 bg-blue-50/80 border border-blue-200 rounded-lg space-y-1">
                      <p className="text-[11px] font-semibold text-blue-900">➕ Mặt hàng thêm mới</p>
                      <select
                        value={item.changeReason || ''}
                        onChange={e => updateItemChangeReason(idx, e.target.value)}
                        className="w-full border border-blue-300 rounded px-2 py-1 text-xs bg-white text-slate-700 focus:outline-none"
                      >
                        <option value="">-- Chọn lý do thêm hàng * --</option>
                        <option value="Khách yêu cầu thêm">Khách yêu cầu thêm</option>
                        <option value="Thay thế đã thống nhất KH">Thay thế đã thống nhất KH</option>
                        <option value="Gợi ý bán thêm">Gợi ý bán thêm</option>
                        <option value="Khác">Khác</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-blue-900 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          checked={!!item.agreedWithCustomer}
                          onChange={e => updateItemAgreed(idx, e.target.checked)}
                        />
                        Đã thống nhất với khách *
                      </label>
                    </div>
                  )}

                  {/* Ghi chú từng dòng (quy cách, thái mỏng, chia túi...) */}
                  <div className="mt-1.5">
                    <input type="text" value={item.note || ''} onChange={e => updateItemNote(idx, e.target.value)}
                      placeholder="Ghi chú dòng: quy cách, thái mỏng, đóng gói..."
                      className="w-full border border-slate-200/80 bg-slate-50/70 rounded-lg px-2.5 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-green-400 focus:outline-none transition-colors" />
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

              {/* WP6: Hiển thị các mặt hàng đã xóa khỏi đơn cũ */}
              {activeTab.processingOrderId && (activeTab.deletedOriginalItems || []).length > 0 && (
                <div className="p-3 bg-red-50/70 border-t border-red-100 space-y-2">
                  <p className="text-xs font-bold text-red-800">
                    Mặt hàng đã xóa ({activeTab.deletedOriginalItems!.length}):
                  </p>
                  {activeTab.deletedOriginalItems!.map((del, dIdx) => (
                    <div key={dIdx} className="flex items-center justify-between text-xs text-red-700 bg-white p-2 rounded-lg border border-red-200 shadow-2xs">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-medium line-through truncate">{del.name}</p>
                        <p className="text-[10px] text-slate-500">Khách đặt: {del.orderedQty} {del.unit} · Lý do: {del.reason}</p>
                      </div>
                      <button
                        onClick={() => restoreDeletedItem(dIdx)}
                        className="text-[11px] text-green-700 font-semibold hover:underline px-2 py-1 bg-green-50 rounded border border-green-200 shrink-0"
                      >
                        Khôi phục
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
          apiBase={getApiBase()}
          token={token}
          initialName={searchTerm}
          onClose={() => setShowQuickAddProduct(false)}
          onCreated={(product) => {
            updateActiveTab(t => ({ cart: [...t.cart, { productId: product.id, name: product.name, unit: product.unit || 'Kg', quantity: 1, price: Number(product.price_retail), image_url: product.image_url || undefined }] }));
            setShowQuickAddProduct(false);
            setSearchTerm('');
          }}
        />
      )}
    </div>
  );
}
