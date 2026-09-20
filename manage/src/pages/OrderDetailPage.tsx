import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, User, Phone, MapPin, RefreshCw, CheckCircle2,
  Clock, Package, FileText, Plus, Trash2, Save, Search as SearchIcon, Wallet, Truck, Printer, FileSpreadsheet, ClipboardEdit, Receipt
} from 'lucide-react';
import { printOrderSlip } from '../lib/printOrder';
import QuickAddProductModal from '../components/QuickAddProductModal';

// Thực tế TPS1 chỉ có 2 hình thức thanh toán: COD (trả ngay khi giao) và
// công nợ (trả sau) — không dùng tiền mặt/chuyển khoản như 2 mục riêng.
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: 'COD (trả ngay)', debt_collection: 'Thu công nợ (trả sau)',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Đơn nháp', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận',
  preparing: 'Đang chuẩn bị', shipping: 'Đang giao', completed: 'Hoàn thành', canceled: 'Đã hủy',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700', preparing: 'bg-purple-100 text-purple-700',
  shipping: 'bg-sky-100 text-sky-700', completed: 'bg-green-100 text-green-700', canceled: 'bg-red-100 text-red-700',
};
const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý', cod: 'COD', paid: 'Đã thanh toán', failed: 'Thất bại', refunded: 'Đã hoàn tiền',
};
const PRICING_MODES = [
  { value: 'tier', label: 'Theo hạng khách hàng' },
  { value: 'order_discount', label: 'Chiết khấu riêng toàn đơn' },
  { value: 'manual_item_price', label: 'Đơn giá thủ công từng sản phẩm' },
];

function money(v: number | string) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }
function dt(v: string) { return v ? new Date(v).toLocaleString('vi-VN') : '—'; }

interface LineItem {
  itemId?: string;
  productId?: string;
  name: string;
  sku?: string;
  unit: string;
  quantity: number;
  base_unit_price: number;
  unit_price: number;
  pricing_note?: string;
  isNew?: boolean;
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<any[]>([]);

  // Thông tin hạng khách & giá hợp đồng (auto-load từ vip_accounts khi mở đơn)
  const [customerInfo, setCustomerInfo] = useState<{
    discount_tier: string;
    contract_discount_percent: number | null;
    tier_expiry_date: string | null;
  } | null>(null);
  const [contractPrices, setContractPrices] = useState<Record<string, number>>({}); // productId -> price

  // Pricing editor state
  const [selectedTier, setSelectedTier] = useState('VIP0');
  const [pricingMode, setPricingMode] = useState('tier');
  const [orderDiscountPercent, setOrderDiscountPercent] = useState(0);
  const [shippingAmount, setShippingAmount] = useState(0);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [verificationNote, setVerificationNote] = useState('');
  const [pricingNote, setPricingNote] = useState('');

  // Product search for add item
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Giao hàng tự vận chuyển (mục 14.2-1 KE_HOACH) — khối lượng/kích thước
  // kiện hàng, tài xế nội bộ, số tiền thu hộ khi giao. Cần migration
  // 20260910f_delivery_fulfillment_lastprice.sql đã chạy mới có cột này.
  const [deliveryForm, setDeliveryForm] = useState({ packageWeightG: '', packageDimensions: '', assignedDriver: '', codCollectAmount: '' });
  const [savingDelivery, setSavingDelivery] = useState(false);
  // Số lượng đã giao thực tế theo dòng (mục 14.2-2) — theo dõi giao thiếu/dư.
  const [itemDelivered, setItemDelivered] = useState<Record<string, string>>({});
  const [savingFulfillment, setSavingFulfillment] = useState(false);

  // Giai đoạn C: ghi nhận thanh toán tách 3 phần (order_payments — cần
  // migration 20260910d_order_payments.sql). Nếu migration CHƯA chạy, API
  // trả lỗi -> paymentsAvailable=false, ẩn cả khối này thay vì hiện lỗi vỡ
  // giao diện, để trang vẫn dùng tốt các phần khác trong lúc chờ.
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsAvailable, setPaymentsAvailable] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Yêu cầu điều chỉnh/hủy của khách (WP6b) — khách gửi, nhân viên duyệt tại đây.
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [resolvingRequest, setResolvingRequest] = useState(false);
  const fetchChangeRequests = useCallback(async () => {
    if (!id) return;
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/order-change-requests?orderId=${id}&status=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setChangeRequests(data.requests || []);
    } catch { /* bảng chưa có — bỏ qua */ }
  }, [id, token]);
  useEffect(() => { fetchChangeRequests(); }, [fetchChangeRequests]);

  const resolveRequest = async (requestId: string, action: 'approve' | 'reject' | 'done', type: string) => {
    let note = '';
    if (action === 'reject') {
      note = prompt('Lý do từ chối (khách sẽ nhận được nội dung này):', '') || '';
      if (note.trim().length < 3) return;
    } else if (action === 'approve' && type === 'cancel') {
      if (!confirm('Duyệt HỦY đơn này? Đơn sẽ chuyển "Đã hủy", tồn kho (nếu có) được hoàn lại và khách nhận thông báo.')) return;
    } else if (action === 'done') {
      note = prompt('Ghi chú cho khách (không bắt buộc):', '') || '';
    }
    setResolvingRequest(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/order-change-requests/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, action, note }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      if (data.next === 'process_order') { navigate(`/tao-don-hang?processOrderId=${data.orderId}`); return; }
      if (data.canceled && data.zaloText) {
        try { await navigator.clipboard.writeText(data.zaloText); } catch { /* bỏ qua */ }
        const packingWarn = data.warnings?.includes('already_packing') ? '\n⚠️ Đơn đã/đang được soạn — nhớ báo Kho/Thu mua.' : '';
        alert(`✅ Đã hủy đơn.${packingWarn}\n\nĐã sao chép thông báo Zalo để dán vào nhóm:\n${data.zaloText}`);
      }
      await Promise.all([fetchChangeRequests(), fetchOrder()]);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xử lý được yêu cầu'));
    } finally { setResolvingRequest(false); }
  };

  const fetchPayments = useCallback(async () => {
    if (!id) return;
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders/payments?orderId=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) { setPaymentsAvailable(false); return; }
      setPayments(data.payments || []);
      setPaymentsAvailable(true);
    } catch {
      setPaymentsAvailable(false);
    }
  }, [id, token]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const submitPayment = async () => {
    // Nếu ô trống → mặc định thu toàn bộ còn nợ
    const rawAmount = paymentAmount.trim();
    const debtAmount = Math.round(Number(order?.debt_amount ?? order?.grand_total) || 0);
    const amount = rawAmount ? Number(rawAmount.replace(/[^0-9]/g, '')) : debtAmount;
    if (!amount || amount <= 0) { alert('Nhập số tiền hợp lệ'); return; }
    setSubmittingPayment(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: id, method: paymentMethod, amount, note: paymentNote || undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPaymentAmount(''); setPaymentNote('');
      await Promise.all([fetchPayments(), fetchOrder()]);
      alert('✅ Đã ghi nhận thanh toán');
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không ghi nhận được'));
    } finally { setSubmittingPayment(false); }
  };

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch from 'orders' table first (without order_history join to avoid 42501 permission error)
      let { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', id)
        .maybeSingle();

      // If not in orders, check if it is in 'quotes' table
      if (!data) {
        const { data: quoteData } = await supabase
          .from('quotes')
          .select('*, quote_items(*)')
          .eq('id', id)
          .maybeSingle();

        if (quoteData) {
          data = {
            id: quoteData.id,
            order_code: quoteData.quote_code || `BG-${quoteData.id.slice(0, 8).toUpperCase()}`,
            customer_name: quoteData.lead_name || quoteData.company || 'Khách hàng',
            customer_phone: quoteData.lead_phone || '',
            delivery_address: quoteData.delivery_address || quoteData.address || '',
            note: quoteData.note || '',
            status: quoteData.status === 'won' ? 'confirmed' : quoteData.status || 'pending',
            payment_status: 'pending',
            payment_method: 'COD',
            source: quoteData.source || 'admin',
            subtotal: Number(quoteData.subtotal || quoteData.total_amount || 0),
            discount_amount: Number(quoteData.discount_amount || 0),
            shipping_amount: Number(quoteData.shipping_fee || 0),
            grand_total: Number(quoteData.total_amount || quoteData.subtotal || 0),
            created_at: quoteData.created_at,
            customer_tier: quoteData.customer_tier || 'VIP0',
            pricing_mode: 'tier',
            pricing_status: quoteData.status === 'won' ? 'finalized' : 'pending',
            order_items: (quoteData.quote_items || []).map((it: any) => ({
              id: it.id,
              product_id: it.product_id,
              name: it.product_name || it.name,
              unit: it.unit || 'Kg',
              quantity: Number(it.quantity || 1),
              base_unit_price: Number(it.unit_price || 0),
              unit_price: Number(it.unit_price || 0),
              pricing_note: it.note || '',
            })),
            order_history: [],
          };
        }
      }

      if (!data) {
        // Try fallback via backend API if available
        try {
          const apiBase = import.meta.env.VITE_API_BASE_URL || '';
          const res = await fetch(`${apiBase}/api/admin/orders?id=${id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const jsonRes = await res.json();
          if (jsonRes.ok && jsonRes.order) {
            data = jsonRes.order;
          }
        } catch (e) {
          console.warn('API fallback error:', e);
        }
      }

      if (!data) {
        setOrder(null);
        return;
      }

      // 2. Fetch order_history safely
      let historyList: any[] = [];
      try {
        const { data: hist } = await supabase
          .from('order_history')
          .select('*')
          .eq('order_id', id)
          .order('created_at', { ascending: false });
        if (hist) historyList = hist;
      } catch (hErr) {
        console.warn('Cannot fetch order_history directly:', hErr);
      }
      data.order_history = data.order_history?.length ? data.order_history : historyList;

      setOrder(data);
      setLines((data.order_items || []).map((item: any) => ({
        itemId: item.id,
        productId: item.product_id,
        name: item.name,
        sku: item.sku,
        unit: item.unit || 'Kg',
        quantity: Number(item.quantity),
        base_unit_price: Number(item.base_unit_price),
        unit_price: Number(item.unit_price),
        pricing_note: item.pricing_note || '',
      })));

      // Auto-load tier thật của khách từ vip_accounts khi đơn chưa finalize
      // Đơn mới từ khách tự đặt thường có customer_tier='VIP0' (default) trong
      // orders — không phải tier hiện tại của khách trong vip_accounts. Cần
      // fetch lại để sale thấy đúng hạng và không phải nhớ/chọn tay.
      const isFinalized = data.pricing_status === 'finalized';
      if (data.customer_id && !isFinalized) {
        const [{ data: custData }, { data: contractData }] = await Promise.all([
          supabase
            .from('vip_accounts')
            .select('discount_tier, contract_discount_percent, tier_expiry_date')
            .eq('id', data.customer_id)
            .maybeSingle(),
          supabase
            .from('customer_contract_prices')
            .select('product_id, price, valid_until')
            .eq('customer_id', data.customer_id)
            .or('valid_until.is.null,valid_until.gte.' + new Date().toISOString().slice(0, 10)),
        ]);

        if (custData) {
          setCustomerInfo(custData);
          const tier = custData.discount_tier || 'VIP0';
          setSelectedTier(tier);

          // Nếu CUSTOM → tự chuyển sang order_discount + pre-fill %
          if (tier === 'CUSTOM' && custData.contract_discount_percent != null) {
            setPricingMode('order_discount');
            setOrderDiscountPercent(Number(custData.contract_discount_percent));
          } else {
            setPricingMode(data.pricing_mode || 'tier');
            setOrderDiscountPercent(Number(data.manual_discount_percent || 0));
          }
        } else {
          setSelectedTier(data.customer_tier || 'VIP0');
          setPricingMode(data.pricing_mode || 'tier');
          setOrderDiscountPercent(Number(data.manual_discount_percent || 0));
        }

        // Map giá hợp đồng: productId -> price
        const cpMap: Record<string, number> = {};
        for (const cp of contractData || []) {
          cpMap[cp.product_id] = Number(cp.price);
        }
        setContractPrices(cpMap);
      } else {
        // Đơn đã finalized: giữ nguyên giá lưu trong đơn
        setCustomerInfo(null);
        setContractPrices({});
        setSelectedTier(data.customer_tier || 'VIP0');
        setPricingMode(data.pricing_mode || 'tier');
        setOrderDiscountPercent(Number(data.manual_discount_percent || 0));
      }

      setShippingAmount(Number(data.shipping_amount || 0));
      setPricingNote(data.pricing_note || '');
      setDeliveryForm({
        packageWeightG: data.package_weight_g != null ? String(data.package_weight_g) : '',
        packageDimensions: data.package_dimensions || '',
        assignedDriver: data.assigned_driver || '',
        codCollectAmount: data.cod_collect_amount != null ? String(data.cod_collect_amount) : '',
      });
      // Chưa xác nhận thực giao: mặc định = số đã chốt (giao đủ); đã xác nhận: hiện số thực giao đã lưu.
      setItemDelivered(Object.fromEntries((data.order_items || []).map((it: any) => [it.id, String(data.delivery_confirmed_at ? (it.quantity_delivered ?? it.quantity) : it.quantity)])));

      const { data: tiersData } = await supabase.from('customer_tiers').select('*').order('code');
      setTiers(tiersData || []);
    } catch (err) {
      console.error('Error fetching order:', err);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Realtime price calculation — giá hợp đồng riêng (contractPrices) ưu tiên
  // cao nhất: nếu mặt hàng có giá cố định HĐ còn hạn → dùng giá đó, không
  // quan tâm mode/tier đang chọn.
  const calcTotals = useCallback(() => {
    const tierDiscount = tiers.find(t => t.code === selectedTier)?.discount_percent || 0;
    let subtotal = 0, merchandise = 0;
    const priced = lines.map(line => {
      // Ưu tiên 1: giá hợp đồng cố định từng mặt hàng
      const contractPrice = line.productId ? contractPrices[line.productId] : undefined;
      let up: number;
      if (contractPrice !== undefined) {
        up = contractPrice;
      } else if (pricingMode === 'manual_item_price') {
        up = line.unit_price;
      } else if (pricingMode === 'tier') {
        up = line.base_unit_price > 0
          ? Math.round(line.base_unit_price * (1 - tierDiscount / 100))
          : (line.unit_price || 0);
      } else if (pricingMode === 'order_discount') {
        up = line.base_unit_price > 0
          ? Math.round(line.base_unit_price * (1 - orderDiscountPercent / 100))
          : (line.unit_price || 0);
      } else {
        up = line.unit_price;
      }
      subtotal += Math.round((line.base_unit_price || up) * line.quantity);
      merchandise += Math.round(up * line.quantity);
      return { ...line, unit_price: up };
    });
    return { subtotal, merchandise, total: merchandise + shippingAmount, priced };
  }, [lines, pricingMode, selectedTier, orderDiscountPercent, shippingAmount, tiers, contractPrices]);

  const totals = calcTotals();

  const isLocked = order && (['shipping', 'completed', 'canceled'].includes(order.status) || ['paid', 'refunded'].includes(order.payment_status) || !!order.delivery_confirmed_at);
  const isTerminalStatus = !!order && ['completed', 'canceled'].includes(order.status);
  // Cột delivery_confirmed_at chỉ có sau migration 20260920g — chưa chạy thì giữ luồng cũ.
  const reconcileAvailable = !!order && 'delivery_confirmed_at' in order && ['confirmed', 'preparing', 'shipping'].includes(order.status) && order.pricing_status === 'finalized';

  // Search products
  const searchProducts = async () => {
    if (productSearch.length < 2) return;
    setSearchingProducts(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders?productSearch=${encodeURIComponent(productSearch)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setProductResults(data.products || []);
    } catch { setProductResults([]); }
    finally { setSearchingProducts(false); }
  };

  // Dropdown gợi ý tự tìm khi gõ để thêm hàng nhanh — không
  // cần bấm "Tìm" hay Enter nữa (mục brief 2026-09-10).
  useEffect(() => {
    if (productSearch.trim().length < 2) { setProductResults([]); return; }
    const timer = setTimeout(() => { searchProducts(); }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const addProduct = (product: any) => {
    if (lines.some(l => l.productId === product.id)) return alert('Sản phẩm đã có trong đơn');
    setLines(prev => [...prev, {
      productId: product.id, name: product.name, sku: product.sku,
      unit: product.unit || 'Kg', quantity: 1,
      base_unit_price: Number(product.price), unit_price: Number(product.price),
      pricing_note: '', isNew: true,
    }]);
    setProductResults([]);
    setProductSearch('');
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return alert('Đơn phải có ít nhất một sản phẩm');
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof LineItem, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const handleFinalize = async () => {
    if (!confirm(`Xác nhận khách ở hạng ${selectedTier} và chốt tổng đơn ${money(totals.total)}?`)) return;
    setSaving(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          orderId: order.id,
          customerTier: selectedTier,
          pricingMode,
          orderDiscountPercent,
          shippingAmount,
          items: totals.priced.map(l => ({
            itemId: l.isNew ? undefined : l.itemId,
            productId: l.productId,
            quantity: l.quantity,
            finalUnitPrice: l.unit_price,
            note: l.pricing_note || '',
          })),
          verificationNote,
          pricingNote,
          actor: 'TPS1 Sale App',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || data.warning || 'Không chốt được đơn');
      alert(data.warning || `✅ Đã chốt giá ${order.order_code} thành công!`);
      await fetchOrder();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally { setSaving(false); }
  };

  const changeStatus = async (newStatus: string) => {
    let confirmFullDelivery = false;
    // Hoàn thành phải qua bước xác nhận thực giao (hóa đơn tính theo số thực giao).
    if (newStatus === 'completed' && order && 'delivery_confirmed_at' in order && !order.delivery_confirmed_at) {
      if (!confirm('Xác nhận khách đã nhận ĐỦ 100% số lượng đã chốt?\n\nOK = giao đủ, tính hóa đơn theo số đã chốt.\nHủy = quay lại nhập số lượng thực giao từng dòng (cột "Đã giao") rồi bấm "Xác nhận thực giao".')) return;
      confirmFullDelivery = true;
    }
    const note = prompt(`Chuyển sang "${STATUS_LABELS[newStatus]}". Ghi chú:`, '') ?? null;
    if (note === null) return;
    setSaving(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, status: newStatus, note, ...(confirmFullDelivery ? { confirmFullDelivery: true } : {}) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await fetchOrder();
    } catch (err: any) { alert('Lỗi: ' + err.message); }
    finally { setSaving(false); }
  };

  const saveDelivery = async () => {
    setSavingDelivery(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: order.id,
          delivery: {
            packageWeightG: deliveryForm.packageWeightG === '' ? null : Number(deliveryForm.packageWeightG),
            packageDimensions: deliveryForm.packageDimensions,
            assignedDriver: deliveryForm.assignedDriver,
            codCollectAmount: deliveryForm.codCollectAmount === '' ? 0 : Number(deliveryForm.codCollectAmount),
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      alert('✅ Đã lưu thông tin giao hàng');
      await fetchOrder();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không lưu được thông tin giao hàng'));
    } finally { setSavingDelivery(false); }
  };

  // Xác nhận THỰC GIAO → tính lại tiền theo số thực giao (API /reconcile-delivery). full=true: giao đủ 100%.
  const [reconciling, setReconciling] = useState(false);
  const reconcile = async (full: boolean) => {
    if (!order) return;
    if (!full && !confirm('Xác nhận số lượng thực giao đã nhập và TÍNH LẠI tiền đơn hàng?')) return;
    setReconciling(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders/reconcile-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(full
          ? { orderId: order.id, full: true }
          : { orderId: order.id, items: Object.entries(itemDelivered).map(([itemId, qty]) => ({ itemId, quantityDelivered: Number(qty) })) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const diffNote = data.changes?.length ? `\n${data.changes.length} dòng lệch so với số đã chốt.` : '';
      const overpaidNote = data.warnings?.includes('overpaid') ? '\n⚠️ Đã thu nhiều hơn tổng mới — cần hoàn/đối trừ.' : '';
      alert(`✅ Đã xác nhận thực giao. Tổng tiền: ${money(data.preTotal)} → ${money(data.newTotal)}${diffNote}${overpaidNote}`);
      await fetchOrder();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xác nhận được thực giao'));
    } finally { setReconciling(false); }
  };

  const saveFulfillment = async () => {
    setSavingFulfillment(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: order.id,
          itemDeliveries: Object.entries(itemDelivered).map(([itemId, qty]) => ({ itemId, quantityDelivered: Number(qty) || 0 })),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      alert('✅ Đã lưu số lượng đã giao');
      await fetchOrder();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không lưu được số lượng đã giao'));
    } finally { setSavingFulfillment(false); }
  };

  const exportExcelDetail = async () => {
    setExportingExcel(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders/export?orderId=${order.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Không xuất được file');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `chi-tiet-don-hang_${order.order_code}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xuất được file'));
    } finally { setExportingExcel(false); }
  };

  // Hóa đơn bán hàng — chỉ có khi đơn đã "Hoàn thành" giao hàng, khác với
  // phiếu tạm/phiếu xác nhận ở trên (có ngay khi chốt giá). Mục brief
  // 2026-09-11: "lúc xác nhận đơn hàng chỉ là phiếu tạm thôi".
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const downloadInvoice = async () => {
    setDownloadingInvoice(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/admin/orders/document?orderId=${order.id}&type=invoice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Chưa có hóa đơn cho đơn này');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `HOA-DON_${order.order_code}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không tải được hóa đơn'));
    } finally { setDownloadingInvoice(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-500">
      <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải đơn hàng...
    </div>
  );
  if (!order) return (
    <div className="text-center py-24 text-red-500">Không tìm thấy đơn hàng #{id}</div>
  );

  const history = [...(order.order_history || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800">{order.order_code}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
              {order.pricing_status === 'finalized' ? (
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Đã chốt R{order.price_revision || 1}</span>
              ) : (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">⏳ Chờ chốt giá</span>
              )}
            </div>
            <p className="text-xs text-slate-400">{dt(order.created_at)}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={order.status}
            onChange={e => changeStatus(e.target.value)}
            disabled={saving || isTerminalStatus}
            title={isTerminalStatus ? 'Đơn đã ở trạng thái kết thúc, không thể chuyển ngược' : 'Cập nhật trạng thái đơn hàng'}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20">
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {order.pricing_status !== 'finalized' && (
            <button onClick={() => navigate(`/tao-don-hang?processOrderId=${order.id}`)}
              className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5">
              <ClipboardEdit size={16} /> Xử lý đơn hàng
            </button>
          )}
          {order.status === 'completed' && (
            <button onClick={downloadInvoice} disabled={downloadingInvoice}
              className="px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100 disabled:opacity-50 flex items-center gap-1.5" title="Tải hóa đơn bán hàng">
              <Receipt size={16} /> {downloadingInvoice ? 'Đang tải...' : 'Tải hóa đơn'}
            </button>
          )}
          <button onClick={exportExcelDetail} disabled={exportingExcel}
            className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50" title="Xuất file Excel">
            <FileSpreadsheet size={18} />
          </button>
          <button onClick={() => printOrderSlip(order)} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50" title="In phiếu tạm">
            <Printer size={18} />
          </button>
          <button onClick={fetchOrder} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
            <RefreshCw size={18} className={saving || loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {changeRequests.filter((r) => ['open', 'approved'].includes(r.status)).map((r) => (
        <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-bold text-amber-900 text-sm">
              {r.type === 'cancel' ? '🚫 Khách yêu cầu HỦY đơn' : '✏️ Khách yêu cầu ĐIỀU CHỈNH đơn'}
              {r.afterCutoff && <span className="ml-2 text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Sau giờ chốt</span>}
              {r.status === 'approved' && <span className="ml-2 text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Đã duyệt — đang điều chỉnh</span>}
            </p>
            <span className="text-xs text-amber-700">Gửi {dt(r.requestedAt)} · chờ {r.waitingMinutes} phút</span>
          </div>
          <p className="text-sm text-slate-800 bg-white border border-amber-100 rounded-lg px-3 py-2">“{r.message}”</p>
          {(r.packingStatus && r.packingStatus !== 'not_started') && (
            <p className="text-xs font-semibold text-red-700">⚠️ Đơn {r.packingStatus === 'done' ? 'đã soạn xong' : 'đang được soạn'} — nếu duyệt nhớ báo Kho/Thu mua.</p>
          )}
          {r.possiblyExported && <p className="text-xs text-amber-800">Đơn có thể đã nằm trong file tổng gửi Thu mua lúc {dt(r.lastExportedAt)} — cần báo lại.</p>}
          <div className="flex gap-2 flex-wrap pt-1">
            {r.status === 'open' && (
              <>
                <button disabled={resolvingRequest} onClick={() => resolveRequest(r.id, 'approve', r.type)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                  {r.type === 'cancel' ? 'Duyệt hủy đơn' : 'Duyệt điều chỉnh (mở Xử lý đơn hàng)'}
                </button>
                <button disabled={resolvingRequest} onClick={() => resolveRequest(r.id, 'reject', r.type)}
                  className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-50">
                  Từ chối
                </button>
              </>
            )}
            {r.status === 'approved' && r.type === 'adjust' && (
              <>
                <button disabled={resolvingRequest} onClick={() => navigate(`/tao-don-hang?processOrderId=${r.orderId}`)}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50">
                  Mở Xử lý đơn hàng
                </button>
                <button disabled={resolvingRequest} onClick={() => resolveRequest(r.id, 'done', r.type)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                  Đã điều chỉnh xong (báo khách)
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Products + Pricing Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><Package size={18} className="text-green-600" />Sản phẩm trong đơn</h2>
              <span className="text-sm text-slate-500">{lines.length} sản phẩm</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Sản phẩm</th>
                    <th className="px-4 py-3 text-center">SL</th>
                    <th className="px-4 py-3 text-center">Đã giao</th>
                    <th className="px-4 py-3 text-right">Đơn giá</th>
                    <th className="px-4 py-3 text-right">Thành tiền</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => {
                    const priced = totals.priced[idx];
                    const contractPrice = line.productId ? contractPrices[line.productId] : undefined;
                    const hasContract = contractPrice !== undefined;
                    const displayPrice = hasContract ? contractPrice : (priced?.unit_price || line.unit_price);
                    const lineTotal = Math.round(displayPrice * line.quantity);
                    return (
                      <tr key={idx} className={`hover:bg-slate-50/50 ${isLocked ? 'opacity-70' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-slate-800">{line.name}</p>
                            {hasContract && (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full shrink-0">
                                📋 Giá HĐ
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{line.sku ? `SKU: ${line.sku} · ` : ''}Giá gốc {money(line.base_unit_price)}</p>
                          {!isLocked && (
                            <input type="text" value={line.pricing_note || ''} onChange={e => updateLine(idx, 'pricing_note', e.target.value)}
                              placeholder="Quy cách / ghi chú riêng..." className="mt-1 text-xs w-full border-0 border-b border-slate-200 focus:outline-none focus:border-green-500 bg-transparent text-slate-500" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!isLocked ? (
                            <input type="number" min="0.001" step="0.001" value={line.quantity}
                              onChange={e => updateLine(idx, 'quantity', Number(e.target.value))}
                              className="w-20 text-center border border-slate-200 rounded-lg p-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                          ) : (
                            <span className="font-medium">{line.quantity} {line.unit}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {line.itemId ? (
                            <input type="number" min="0" step="0.001"
                              value={itemDelivered[line.itemId] ?? '0'}
                              onChange={e => setItemDelivered(prev => ({ ...prev, [line.itemId as string]: e.target.value }))}
                              className="w-20 text-center border border-slate-200 rounded-lg p-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasContract ? (
                            /* Giá cố định HĐ — hiển thị tĩnh, không cho sửa */
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-semibold text-purple-700">{money(contractPrice)}</span>
                              <span className="text-[10px] text-purple-500 bg-purple-50 border border-purple-200 px-1 py-0.5 rounded">HĐ</span>
                            </div>
                          ) : !isLocked ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={line.unit_price || ''}
                                placeholder="Nhập giá (đ)..."
                                onChange={e => {
                                  setPricingMode('manual_item_price');
                                  updateLine(idx, 'unit_price', Number(e.target.value));
                                }}
                                className={`w-32 text-right border rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                                  (line.unit_price || 0) <= 0
                                    ? 'border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-500/40 shadow-sm shadow-amber-200'
                                    : 'border-slate-300 text-slate-800 focus:ring-green-500/20'
                                }`}
                              />
                              {(line.unit_price || 0) <= 0 && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                                  Chưa có giá
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 font-medium">{money(priced?.unit_price || line.unit_price)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(lineTotal)}</td>
                        <td className="px-4 py-3">
                          {!isLocked && (
                            <button onClick={() => removeLine(idx)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {order.delivery_confirmed_at && (
              <div className="px-4 py-3 border-t border-green-100 bg-green-50 text-xs text-green-800">
                ✓ Đã xác nhận thực giao lúc {dt(order.delivery_confirmed_at)} bởi {order.delivery_confirmed_by || '—'}.
                {order.pre_delivery_grand_total != null && Number(order.pre_delivery_grand_total) !== Number(order.grand_total) && (
                  <> Tổng tiền: <b>{money(order.pre_delivery_grand_total)}</b> → <b>{money(order.grand_total)}</b>.</>
                )}
                {order.delivery_note ? ` Ghi chú: ${order.delivery_note}` : ''}
              </div>
            )}
            {reconcileAvailable && (
              <div className="px-4 py-3 border-t border-amber-100 bg-amber-50 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-amber-800">Nhập <b>số lượng thực giao</b> ở cột "Đã giao" rồi bấm xác nhận — hóa đơn sẽ tính theo số thực giao.</p>
                <div className="flex gap-2">
                  <button onClick={() => reconcile(true)} disabled={reconciling}
                    className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-50 disabled:opacity-50">
                    Giao đủ 100%
                  </button>
                  <button onClick={() => reconcile(false)} disabled={reconciling}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                    {reconciling ? 'Đang xử lý...' : 'Xác nhận thực giao & tính lại tiền'}
                  </button>
                </div>
              </div>
            )}
            {!('delivery_confirmed_at' in order) && (
            <div className="px-4 py-2 border-t border-slate-100 flex justify-end">
              <button onClick={saveFulfillment} disabled={savingFulfillment}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 disabled:opacity-50">
                {savingFulfillment ? 'Đang lưu...' : 'Lưu số lượng đã giao'}
              </button>
            </div>
            )}

            {/* Add Product */}
            {!isLocked && (
              <div className="p-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Thêm sản phẩm vào đơn</p>
                <div className="relative">
                  <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                    placeholder="Gõ tên sản phẩm để tìm (tự gợi ý)..." className="pl-8 pr-8 py-2 w-full border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  {searchingProducts && <RefreshCw size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
                </div>
                {productSearch.trim().length >= 2 && (
                  <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                    {productResults.map(p => (
                      <button key={p.id} onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-green-50 text-left border-b border-slate-100 last:border-0 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.categoryLabel || ''} · {p.unit || 'Kg'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-green-700">{money(p.price)}</span>
                          <Plus size={16} className="text-green-600" />
                        </div>
                      </button>
                    ))}
                    {!searchingProducts && productResults.length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-400">Không tìm thấy — có thể tạo mới bên dưới.</p>
                    )}
                    <button onClick={() => setShowQuickAdd(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-green-700 hover:bg-green-50 border-t border-slate-100">
                      <Plus size={15} /> Thêm sản phẩm mới "{productSearch}"
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pricing Editor */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-600" />Phân loại khách & Chốt giá</h2>
              {order.pricing_status === 'finalized' ? (
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">Đã chốt R{order.price_revision || 1}</span>
              ) : (
                <span className="text-xs text-amber-600 bg-amber-100 px-3 py-1 rounded-full">Giá tạm tính</span>
              )}
            </div>
            <div className="p-5 space-y-5">
              {isLocked && <div className="p-3 bg-slate-50 text-slate-500 text-sm rounded-lg border border-slate-200">⚠️ Đơn đã thanh toán/đang giao/hoàn thành nên không thể chỉnh giá.</div>}

              {/* Banner thông tin hạng khách — auto-load từ vip_accounts */}
              {customerInfo && order.pricing_status !== 'finalized' && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm space-y-1">
                  <p className="font-semibold text-indigo-800 flex items-center gap-1.5">
                    🏷️ Thông tin hạng khách (tự động tải)
                  </p>
                  <div className="flex flex-wrap gap-3 text-indigo-700 text-xs">
                    <span>Hạng: <b>{customerInfo.discount_tier || 'VIP0'}</b></span>
                    {customerInfo.contract_discount_percent != null && (
                      <span>Chiết khấu HĐ: <b>{customerInfo.contract_discount_percent}%</b></span>
                    )}
                    {customerInfo.tier_expiry_date && (
                      <span>Hết hạn: <b>{new Date(customerInfo.tier_expiry_date).toLocaleDateString('vi-VN')}</b></span>
                    )}
                    {Object.keys(contractPrices).length > 0 && (
                      <span className="text-purple-700 font-semibold">
                        📋 {Object.keys(contractPrices).length} mặt hàng có giá cố định HĐ
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Hạng khách hàng</label>
                  <select value={selectedTier} onChange={e => setSelectedTier(e.target.value)} disabled={isLocked}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-60">
                    {(tiers.length ? tiers : [
                      { code: 'VIP0', name: 'VIP0 - Không chiết khấu', discount_percent: 0 },
                      { code: 'VIP1', name: 'VIP1', discount_percent: 5 },
                      { code: 'VIP2', name: 'VIP2', discount_percent: 10 },
                      { code: 'VIP3', name: 'VIP3', discount_percent: 15 },
                    ]).map(t => <option key={t.code} value={t.code}>{t.name || t.code} ({t.discount_percent || 0}%)</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Chế độ tính giá</label>
                  <select value={pricingMode} onChange={e => setPricingMode(e.target.value)} disabled={isLocked}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-60">
                    {PRICING_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phí giao hàng</label>
                  <input type="number" min="0" step="1000" value={shippingAmount} onChange={e => setShippingAmount(Number(e.target.value))} disabled={isLocked}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-60" />
                </div>
              </div>

              {/* Ô nhập % chiết khấu — chỉ hiện khi chế độ "Chiết khấu riêng" */}
              {pricingMode === 'order_discount' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <label className="block text-xs font-semibold text-blue-700">Chiết khấu riêng toàn đơn (%)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={orderDiscountPercent}
                      onChange={e => setOrderDiscountPercent(Number(e.target.value))}
                      disabled={isLocked}
                      placeholder="Nhập % chiết khấu (0–100)"
                      className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60 bg-white"
                    />
                    <span className="text-sm font-bold text-blue-700 w-8 text-right">{orderDiscountPercent}%</span>
                  </div>
                  <p className="text-xs text-blue-600">Áp đồng đều {orderDiscountPercent}% giảm trên toàn bộ sản phẩm trong đơn — không phụ thuộc hạng khách.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Ghi chú phân loại khách</label>
                  <textarea value={verificationNote} onChange={e => setVerificationNote(e.target.value)} disabled={isLocked} rows={2}
                    placeholder="Lý do giữ VIP0 hoặc nâng hạng..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none disabled:opacity-60" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Ghi chú xác nhận giá</label>
                  <textarea value={pricingNote} onChange={e => setPricingNote(e.target.value)} disabled={isLocked} rows={2}
                    placeholder="Lý do điều chỉnh giá..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none disabled:opacity-60" />
                </div>
              </div>

              {/* Totals Preview */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm border border-slate-100">
                <div className="flex justify-between text-slate-500"><span>Giá trị gốc</span><span>{money(totals.subtotal)}</span></div>
                <div className="flex justify-between text-slate-500">
                  <span>Giảm/điều chỉnh</span>
                  <span className="text-red-600">-{money(Math.max(0, totals.subtotal - totals.merchandise))}</span>
                </div>
                <div className="flex justify-between text-slate-500"><span>Phí giao hàng</span><span>{money(shippingAmount)}</span></div>
                <div className="flex justify-between font-bold text-base text-slate-800 pt-2 border-t border-slate-200">
                  <span>Tổng sau xác nhận</span><span className="text-green-700">{money(totals.total)}</span>
                </div>
              </div>

              {!isLocked && (
                <button onClick={handleFinalize} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors shadow-lg shadow-green-900/20">
                  <Save size={18} />
                  {saving ? 'Đang lưu...' : order.pricing_status === 'finalized' ? 'Chốt lại & tạo PDF mới' : 'Xác nhận khách & Chốt giá'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Info + History */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><User size={18} className="text-green-600" />Khách hàng</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <User size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <div><p className="font-semibold text-slate-800">{order.customer_name}</p><p className="text-slate-400">{order.customer_code} · {order.customer_tier || 'VIP0'}</p></div>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <Phone size={16} className="text-slate-400 shrink-0" />{order.customer_phone || '—'}
              </div>
              {order.sales_rep_name && (
                <p className="text-xs text-slate-400">Sale phụ trách: <span className="text-slate-600 font-medium">{order.sales_rep_name}</span></p>
              )}
              {order.note && <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs border border-amber-100">{order.note}</div>}
            </dl>
          </div>

          {/* Giao hàng — hoàn thiện Giai đoạn C: hiện rõ người nhận khi khác
              chủ tài khoản (đơn tạo qua POS cho phép nhập người nhận riêng),
              trước đây chỉ hiện địa chỉ, không hiện tên/SĐT người nhận. */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Truck size={18} className="text-green-600" />Giao hàng</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                {order.delivery_type === 'pickup' ? 'Nhận tại điểm' : 'Giao tận nơi'}
              </span>
            </div>
            {order.delivery_type !== 'pickup' && (
              <dl className="space-y-2 text-sm">
                {(order.delivery_name && order.delivery_name !== order.customer_name) || (order.delivery_phone && order.delivery_phone !== order.customer_phone) ? (
                  <div className="flex items-start gap-3">
                    <User size={16} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-800">{order.delivery_name || order.customer_name}</p>
                      <p className="text-xs text-amber-600">Người nhận khác chủ tài khoản</p>
                    </div>
                  </div>
                ) : null}
                {order.delivery_phone && order.delivery_phone !== order.customer_phone && (
                  <div className="flex items-center gap-3 text-slate-600">
                    <Phone size={16} className="text-slate-400 shrink-0" />{order.delivery_phone}
                  </div>
                )}
                <div className="flex items-start gap-3 text-slate-600">
                  <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <span>{order.delivery_address || 'Chưa có địa chỉ'}{order.delivery_alias ? ` (${order.delivery_alias})` : ''}</span>
                </div>
              </dl>
            )}

            {/* Kiện hàng tự vận chuyển (mục 14.2-1 KE_HOACH) */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">Kiện hàng &amp; người giao</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min="0" value={deliveryForm.packageWeightG}
                  onChange={e => setDeliveryForm(f => ({ ...f, packageWeightG: e.target.value }))}
                  placeholder="Khối lượng (gram)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <input type="text" value={deliveryForm.packageDimensions}
                  onChange={e => setDeliveryForm(f => ({ ...f, packageDimensions: e.target.value }))}
                  placeholder="Kích thước DxRxC (cm)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <input type="text" value={deliveryForm.assignedDriver}
                  onChange={e => setDeliveryForm(f => ({ ...f, assignedDriver: e.target.value }))}
                  placeholder="Người giao hàng" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <input type="number" min="0" step="1000" value={deliveryForm.codCollectAmount}
                  onChange={e => setDeliveryForm(f => ({ ...f, codCollectAmount: e.target.value }))}
                  placeholder="Thu hộ COD (đ)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <button onClick={saveDelivery} disabled={savingDelivery}
                className="w-full py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 disabled:opacity-50">
                {savingDelivery ? 'Đang lưu...' : 'Lưu thông tin giao hàng'}
              </button>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-green-600" />Tổng kết đơn</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Tạm tính</span><span className="font-medium">{money(order.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Chiết khấu ({order.discount_percent || 0}%)</span><span className="text-red-600 font-medium">-{money(order.discount_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Phí giao hàng</span><span className="font-medium">{money(order.shipping_amount || 0)}</span></div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-100">
                <span>Tổng thanh toán</span><span className="text-green-700">{money(order.grand_total)}</span>
              </div>
            </dl>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Thanh toán</p>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                order.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                order.payment_status === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}>{PAYMENT_LABELS[order.payment_status] || order.payment_status}</span>
            </div>
          </div>

          {/* Payments (Giai đoạn C) */}
          {paymentsAvailable && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><Wallet size={18} className="text-green-600" />Thanh toán</h2>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Đã thu</span><span className="font-semibold text-green-700">{money(order.paid_amount || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Còn nợ</span><span className="font-semibold text-red-600">{money(order.debt_amount ?? order.grand_total)}</span></div>
              </dl>

              {Number(order.debt_amount ?? order.grand_total) > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-50">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={String(Math.round(Number(order.debt_amount ?? order.grand_total)))}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right font-medium"
                    />
                  </div>
                  <input type="text" value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                    placeholder="Ghi chú (không bắt buộc)" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                  <button onClick={submitPayment} disabled={submittingPayment}
                    className="w-full py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
                    {submittingPayment ? 'Đang lưu...' : 'Ghi nhận thanh toán'}
                  </button>
                </div>
              )}

              {payments.length > 0 && (
                <div className="pt-3 border-t border-slate-50 space-y-1.5 max-h-48 overflow-y-auto">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs text-slate-500">
                      <span>{p.methodLabel} {p.note ? `— ${p.note}` : ''}</span>
                      <span className="font-semibold text-slate-700 shrink-0 ml-2">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Clock size={18} className="text-green-600" />Lịch sử xử lý</h2>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Chưa có lịch sử cập nhật.</p>
            ) : (
              <div className="space-y-3">
                {history.map((h: any, i: number) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-400 mt-1.5 shrink-0"></div>
                    <div>
                      <p className="font-medium text-slate-700">{STATUS_LABELS[h.to_status] || h.action || 'Cập nhật'}</p>
                      <p className="text-xs text-slate-400">{dt(h.created_at)}{h.note ? ` · ${h.note}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showQuickAdd && (
        <QuickAddProductModal
          apiBase={import.meta.env.VITE_API_BASE_URL || ''}
          token={token}
          initialName={productSearch}
          onClose={() => setShowQuickAdd(false)}
          onCreated={(product) => {
            addProduct({ id: product.id, name: product.name, sku: product.sku, unit: product.unit, price: product.price_retail });
            setShowQuickAdd(false);
          }}
        />
      )}
    </div>
  );
}
