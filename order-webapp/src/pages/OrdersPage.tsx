import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  ShoppingBag,
  MapPin,
  ChevronRight,
  Receipt,
  Clock,
  Package,
  RotateCcw,
} from 'lucide-react';
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

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-300',
  confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  preparing: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  shipping: 'bg-sky-50 text-sky-800 border-sky-300',
  completed: 'bg-green-50 text-green-800 border-green-300',
  canceled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Chờ thanh toán',
  cod: 'COD (Khi nhận hàng)',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
};

function money(v: number | string) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

function dt(v: string) {
  return v
    ? new Date(v).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';
}

const FILTER_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xác nhận' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'preparing', label: 'Đang chuẩn bị' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'canceled', label: 'Đã hủy' },
];

export default function OrdersPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

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
      setError(err instanceof ApiError ? err.message : 'Không tải được danh sách đơn hàng');
    } finally {
      setLoading(false);
    }
  }, [logout, navigate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    if (selectedFilter === 'all') return orders;
    return orders.filter((o) => o.status === selectedFilter);
  }, [orders, selectedFilter]);

  const reorder = (order: Order, event: React.MouseEvent) => {
    event.stopPropagation();
    sessionStorage.setItem(
      'tps1_reorder_request_v1',
      JSON.stringify(
        order.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity) || 1,
          note: item.customerNote || '',
        }))
      )
    );
    navigate('/');
  };

  return (
    <div className="space-y-4 sm:space-y-5 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-[#17231d]/10 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#17231d]">Đơn hàng của tôi</h1>
          <p className="text-[#59665f] text-xs sm:text-sm mt-0.5">
            {session?.name || session?.company} · Mã KH: <strong className="font-mono text-[#17231d]">{session?.code}</strong>{' '}
            {session?.tier ? `· Hạng ${session.tier}` : ''}
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 border border-[#17231d]/15 text-[#59665f] hover:text-[#17231d] rounded-xl hover:bg-[#f5f7f3] transition-colors text-xs font-semibold cursor-pointer"
          title="Tải lại danh sách"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>
      </header>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {FILTER_TABS.map(({ key, label }) => {
          const isActive = selectedFilter === key;
          const count =
            key === 'all'
              ? orders.length
              : orders.filter((o) => o.status === key).length;

          return (
            <button
              key={key}
              onClick={() => setSelectedFilter(key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer touch-target ${
                isActive
                  ? 'bg-[#0f7a4f] text-white border-[#0f7a4f] shadow-sm shadow-[#0f7a4f]/20'
                  : 'bg-white text-[#59665f] border-[#17231d]/10 hover:border-[#0f7a4f]/30 hover:text-[#17231d]'
              }`}
            >
              <span>{label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-white text-[#0f7a4f]' : 'bg-[#17231d]/5 text-[#59665f]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
          {error}
        </div>
      )}

      {/* Danh sách đơn hàng */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#59665f] space-y-2 bg-white rounded-2xl border border-[#17231d]/10">
          <RefreshCw className="animate-spin text-[#0f7a4f]" size={24} />
          <span className="text-xs font-medium">Đang tải lịch sử đơn hàng...</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#17231d]/10 py-16 text-center text-[#59665f] space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-[#f5f7f3] flex items-center justify-center mx-auto text-[#59665f]/40">
            <ShoppingBag size={28} />
          </div>
          <p className="font-bold text-base text-[#17231d]">Không có đơn hàng nào</p>
          <p className="text-xs text-[#59665f] max-w-sm mx-auto">
            {selectedFilter !== 'all'
              ? `Chưa có đơn hàng nào ở trạng thái "${STATUS_LABELS[selectedFilter] || selectedFilter}".`
              : 'Bạn chưa tạo đơn hàng nào. Hãy vào màn hình Đặt hàng để lên đơn cho bếp.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const itemsCount = order.items?.length || 0;
            const badgeClass =
              STATUS_BADGES[order.status] || 'bg-slate-100 text-slate-700 border-slate-200';

            return (
              <div
                key={order.id}
                onClick={() => navigate(`/don-hang/${order.id}`)}
                className="w-full bg-white rounded-2xl border border-[#17231d]/10 shadow-xs hover:border-[#0f7a4f]/40 hover:shadow-md transition-all p-4 sm:p-5 text-left cursor-pointer group space-y-3"
              >
                {/* Header card: Mã đơn, Thời gian, Badge trạng thái */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-sm sm:text-base text-[#0b4f34] group-hover:text-[#0f7a4f] transition-colors">
                      {order.order_code}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badgeClass}`}
                    >
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                    {order.status === 'completed' && order.invoice_document_id && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                          <Receipt size={11} /> Hóa đơn bán hàng
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-[#59665f] flex items-center gap-1 font-mono">
                    <Clock size={12} className="text-[#59665f]/70" />
                    {dt(order.created_at)}
                  </span>
                </div>

                {/* Danh sách tóm tắt các món & địa chỉ giao */}
                <div className="space-y-1.5 text-xs text-[#59665f]">
                  <div className="flex items-center gap-1.5 text-[#17231d] font-medium">
                    <Package size={13} className="text-[#0f7a4f] shrink-0" />
                    <span>
                      {itemsCount} mặt hàng:
                      <span className="text-[#59665f] font-normal ml-1 line-clamp-1">
                        {order.items
                          ?.slice(0, 3)
                          .map((it) => it.name)
                          .join(', ')}
                        {itemsCount > 3 ? ` và ${itemsCount - 3} món khác...` : ''}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-start gap-1.5 text-[#59665f]">
                    <MapPin size={13} className="text-[#59665f]/60 mt-0.5 shrink-0" />
                    <span className="truncate">{order.delivery_address || 'Giao tại xưởng/bếp'}</span>
                  </div>
                </div>

                {/* Chân card: Tiền & Trạng thái thanh toán & Nút xem chi tiết */}
                <div className="flex items-center justify-between pt-2.5 border-t border-[#17231d]/8">
                  <div>
                    <span className="text-[11px] text-[#59665f] block">Tổng tiền</span>
                    <span className="font-extrabold font-mono text-base sm:text-lg text-[#0f7a4f]">
                      {money(order.grand_total)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xs text-[#59665f] font-medium hidden sm:inline">
                      {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => reorder(order, event)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#0f7a4f]/25 bg-[#f5fbf7] px-3 text-xs font-bold text-[#0f7a4f] hover:bg-[#e6f5ec]"
                    >
                      <RotateCcw size={14} />
                      <span>Đặt lại</span>
                    </button>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0f7a4f] group-hover:translate-x-0.5 transition-transform">
                      <span>Xem chi tiết</span>
                      <ChevronRight size={16} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
