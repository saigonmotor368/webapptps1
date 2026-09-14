import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ShoppingBag, MapPin, ChevronRight, Receipt } from 'lucide-react';
import { api, type Order, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

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

function money(v: number | string) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}
function dt(v: string) {
  return v
    ? new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
}

export default function OrdersPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.orders();
      setOrders(res.orders || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate('/dang-nhap');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Không tải được đơn hàng');
    } finally {
      setLoading(false);
    }
  }, [logout, navigate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#14231c]">Đơn hàng của tôi</h1>
          <p className="text-[#59665f] text-sm">
            {session?.name} · {session?.code} {session?.tier ? `· Hạng ${session.tier}` : ''} · {orders.length} đơn hàng
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="p-2 border border-[#14231c]/15 text-[#59665f] rounded-lg hover:bg-white transition-colors self-start"
          title="Tải lại"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[#59665f]">
          <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải đơn hàng...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#14231c]/10 py-16 text-center text-[#59665f]/60">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Chưa có đơn hàng nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => navigate(`/don-hang/${order.id}`)}
              className="w-full flex items-start justify-between gap-3 p-4 bg-white rounded-2xl border border-[#14231c]/10 shadow-sm hover:border-[#0f6f4b]/30 hover:shadow-md transition-all text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h3 className="font-bold text-[#14231c]">{order.order_code}</h3>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                  {order.status === 'completed' && order.invoice_document_id && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                      <Receipt size={11} /> Có hóa đơn
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#59665f]/70">{dt(order.created_at)}</p>
                <div className="flex items-start gap-1.5 mt-1">
                  <MapPin size={13} className="text-[#59665f]/50 mt-0.5 shrink-0" />
                  <p className="text-xs text-[#59665f] truncate">{order.delivery_address || 'Nhận tại điểm'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="font-bold text-lg text-red-600">{money(order.grand_total)}</p>
                  <p className="text-xs text-[#59665f]/70">{PAYMENT_LABELS[order.payment_status] || order.payment_status}</p>
                </div>
                <ChevronRight size={18} className="text-[#59665f]/50" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
