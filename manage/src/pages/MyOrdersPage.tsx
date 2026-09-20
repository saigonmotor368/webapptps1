import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, ShoppingBag, MapPin, ChevronRight, Receipt, RotateCcw, Calendar, AlertCircle } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Đơn nháp',
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  preparing: 'Đang chuẩn bị',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  canceled: 'Đã hủy',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-purple-100 text-purple-700',
  shipping: 'bg-sky-100 text-sky-700',
  completed: 'bg-green-100 text-green-700',
  canceled: 'bg-red-100 text-red-700',
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
  cod: 'COD',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
};

function money(val: number | string) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val) || 0)) + 'đ';
}

function dt(val: string) {
  return val ? new Date(val).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

function formatDeliveryDate(val: string) {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return val;
}

// Trang "Đơn hàng của tôi" dành cho khách hàng đăng nhập vào sale-webapp
// (Giai đoạn A). Khách hàng KHÔNG có phiên Supabase Auth nên không thể gọi
// supabase.from('orders') trực tiếp như OrdersPage (dành cho nhân viên) — phải
// đi qua API /api/customer/orders kèm customerToken, API này tự giới hạn chỉ
// trả đơn của đúng khách hàng đó (đã kiểm qua bảng customer_sessions).
//
// Trước đây bấm mở rộng chỉ hiện 1 bảng dòng hàng thu gọn, thiếu hẳn thông
// tin giao hàng/thanh toán và không tải được hóa đơn — giờ giữ list gọn ở
// đây, bấm vào chuyển sang MyOrderDetailPage xem đầy đủ như 1 invoice (yêu
// cầu 2026-09-11: "phải thể hiện chi tiết đầy đủ thông tin đơn hàng...
// + có nút tải hoá đơn khi đã hoàn thành").
export default function MyOrdersPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const apiBase = (
        import.meta.env.VITE_API_BASE_URL ||
        (import.meta.env.DEV ? '' : 'https://thucphamsomot.vn')
      ).replace(/\/$/, '');
      const res = await fetch(`${apiBase}/api/customer/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không tải được đơn hàng');
      setOrders(data.orders || []);
    } catch (err: any) {
      setError(err.message || 'Không tải được đơn hàng');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchOrders();
  }, [token, fetchOrders]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Đơn hàng của tôi</h1>
          <p className="text-slate-500 text-sm">
            {user?.name} · {user?.code} {user?.tier ? `· Hạng ${user.tier}` : ''} · {orders.length} đơn hàng
          </p>
        </div>
        <button onClick={fetchOrders} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors self-start" title="Tải lại">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải đơn hàng...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Chưa có đơn hàng nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              onClick={() => navigate(`/don-hang-cua-toi/${order.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/don-hang-cua-toi/${order.id}`); }}
              className="w-full cursor-pointer flex flex-col gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-green-200 hover:shadow-md transition-all text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-slate-800">{order.order_code}</h3>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                    {order.is_late_order && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1" title="Đơn đặt sau giờ chốt">
                        <AlertCircle size={11} /> Trễ giờ chốt
                      </span>
                    )}
                    {order.status === 'completed' && order.invoice_document_id && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                        <Receipt size={11} /> Có hóa đơn
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{dt(order.created_at)}</p>
                  {order.delivery_date && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium mt-1">
                      <Calendar size={13} className="shrink-0" />
                      <span>Ngày giao: {formatDeliveryDate(order.delivery_date)}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5 mt-1">
                    <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-500 truncate">{order.delivery_address || 'Nhận tại điểm'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="font-bold text-lg text-red-600">{money(order.grand_total)}</p>
                    <p className="text-xs text-slate-400">{PAYMENT_LABELS[order.payment_status] || order.payment_status}</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-400" />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100/80">
                <span className="text-xs text-slate-400">
                  {order.items?.length || 0} mặt hàng
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const reorderItems = (order.items || []).map((it: any) => ({
                      productId: it.productId,
                      sku: it.sku,
                      name: it.name,
                      unit: it.unit,
                      quantity: it.orderedQuantity || it.quantity || 1,
                      price: it.price || 0,
                      customerNote: it.customerNote || '',
                    }));
                    navigate('/', { state: { reorderItems } });
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5 transition-colors"
                  title="Nạp lại các mặt hàng trong đơn này vào giỏ hàng"
                >
                  <RotateCcw size={12} /> Đặt lại đơn
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
