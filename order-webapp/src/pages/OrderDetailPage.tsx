import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  User,
  MapPin,
  Package,
  FileText,
  Wallet,
  Receipt,
  ClipboardList,
  CheckCircle2,
  Clock,
  Truck,
  AlertTriangle,
  XCircle,
  X,
  Info,
} from 'lucide-react';
import { api, requestFile, type Order, ApiError } from '../lib/api';
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
  cod: 'COD (Trả khi nhận hàng)',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  COD: 'Thanh toán khi nhận hàng (COD)',
  CREDIT: 'Công nợ',
  BANK_TRANSFER: 'Chuyển khoản',
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

const TIMELINE_STEPS = [
  { key: 'pending', label: 'Chờ xác nhận', icon: Clock },
  { key: 'confirmed', label: 'Đã xác nhận', icon: CheckCircle2 },
  { key: 'preparing', label: 'Đang chuẩn bị', icon: Package },
  { key: 'shipping', label: 'Đang giao xe lạnh', icon: Truck },
  { key: 'completed', label: 'Hoàn thành', icon: CheckCircle2 },
];

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<'confirmation' | 'invoice' | null>(null);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.orders();
      const found = (res.orders || []).find((o) => o.id === id);
      if (!found) throw new ApiError('Không tìm thấy đơn hàng này', 404);
      setOrder(found);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate('/dang-nhap');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Không tải được chi tiết đơn hàng');
    } finally {
      setLoading(false);
    }
  }, [id, logout, navigate]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const downloadDocument = async (type: 'confirmation' | 'invoice') => {
    if (!order) return;
    setDownloading(type);
    try {
      const path = type === 'invoice' ? 'order-invoice' : 'order-confirmation';
      const blob = await requestFile(`/api/customer/${path}?orderId=${order.id}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type === 'invoice' ? 'HOA-DON' : 'XAC-NHAN-DON'}_${order.order_code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi tải tài liệu: ' + (err instanceof ApiError ? err.message : 'Vui lòng thử lại sau'));
    } finally {
      setDownloading(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    if (!cancelReason.trim()) {
      setCancelError('Vui lòng nhập lý do hủy đơn');
      return;
    }
    setCanceling(true);
    setCancelError('');
    try {
      await api.cancelOrder(order.id, cancelReason.trim());
      setShowCancelModal(false);
      setCancelReason('');
      fetchOrder();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Không thể hủy đơn, vui lòng thử lại');
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#59665f] space-y-3">
        <RefreshCw className="animate-spin text-[#0f7a4f]" size={28} />
        <span className="text-sm font-medium">Đang tải chi tiết đơn hàng...</span>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto py-12">
        <button
          onClick={() => navigate('/don-hang')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#59665f] hover:text-[#17231d] px-3 py-2 rounded-xl border border-[#17231d]/10 bg-white"
        >
          <ArrowLeft size={16} /> Quay lại danh sách đơn
        </button>
        <div className="text-center py-16 px-6 bg-white rounded-2xl border border-red-200 text-red-600 text-sm">
          {error || `Không tìm thấy đơn hàng #${id}`}
        </div>
      </div>
    );
  }

  const items = order.items || [];
  const lineTotal = (item: Order['items'][number]) =>
    Number(item.finalLineTotal ?? item.lineTotal ?? Number(item.finalUnitPrice ?? item.price) * Number(item.quantity));

  // Determine current timeline active step index
  const statusOrder = ['pending', 'confirmed', 'preparing', 'shipping', 'completed'];
  const currentStepIdx = statusOrder.indexOf(order.status);
  const isCanceled = order.status === 'canceled';
  const canCancel = order.status === 'pending' || order.status === 'confirmed';

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      {/* Top Header */}
      <header className="bg-white rounded-2xl border border-[#17231d]/10 shadow-xs p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/don-hang')}
            className="p-2.5 bg-[#f8faf7] border border-[#17231d]/10 rounded-xl hover:bg-[#eaece8] text-[#17231d] transition-colors cursor-pointer"
            title="Quay lại danh sách đơn"
          >
            <ArrowLeft size={18} />
          </button>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black font-mono text-[#0b4f34]">
                {order.order_code}
              </h1>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  STATUS_BADGES[order.status] || 'bg-slate-100 text-slate-700'
                }`}
              >
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
            <p className="text-xs text-[#59665f] mt-0.5 flex items-center gap-1 font-mono">
              <Clock size={12} />
              <span>Đặt lúc: {dt(order.created_at)}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {order.confirmation_document_id && (
            <button
              onClick={() => downloadDocument('confirmation')}
              disabled={downloading !== null}
              className="px-3.5 py-2 bg-[#f8faf7] border border-[#17231d]/15 text-[#17231d] rounded-xl text-xs font-bold hover:bg-[#eaece8] disabled:opacity-50 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ClipboardList size={14} className="text-[#0f7a4f]" />
              <span>{downloading === 'confirmation' ? 'Đang tải...' : 'Phiếu xác nhận (PDF)'}</span>
            </button>
          )}

          {order.invoice_document_id && (
            <button
              onClick={() => downloadDocument('invoice')}
              disabled={downloading !== null}
              className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Receipt size={14} className="text-emerald-700" />
              <span>{downloading === 'invoice' ? 'Đang tải...' : 'Hóa đơn bán hàng (PDF)'}</span>
            </button>
          )}

          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-3 py-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer"
            >
              Hủy đơn
            </button>
          )}

          <button
            onClick={fetchOrder}
            className="p-2 border border-[#17231d]/15 rounded-xl text-[#59665f] hover:bg-[#f5f7f3] transition-colors cursor-pointer"
            title="Tải lại"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Timeline Tiến Trình Đơn Hàng */}
      <div className="bg-white rounded-2xl border border-[#17231d]/10 shadow-xs p-4 sm:p-5">
        <h2 className="text-xs font-bold text-[#59665f] uppercase tracking-wider mb-4">
          Tiến trình xử lý đơn
        </h2>

        {isCanceled ? (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-3 text-xs">
            <XCircle size={20} className="shrink-0 text-rose-600" />
            <div>
              <p className="font-bold">Đơn hàng này đã bị hủy.</p>
              <p className="text-[#59665f] mt-0.5">
                Nếu cần hỗ trợ thêm, vui lòng liên hệ hotline TPS1: <strong>089 890 2222</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Thanh nối các bước */}
            <div className="hidden sm:block absolute top-1/2 left-6 right-6 h-0.5 bg-[#17231d]/10 -translate-y-1/2 z-0" />

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 relative z-10">
              {TIMELINE_STEPS.map((step, idx) => {
                const isPassed = currentStepIdx >= idx;
                const isCurrent = currentStepIdx === idx;
                const StepIcon = step.icon;

                return (
                  <div
                    key={step.key}
                    className={`flex flex-col items-center text-center p-2 rounded-xl transition-all ${
                      isCurrent
                        ? 'bg-[#0f7a4f]/10 border border-[#0f7a4f]/20'
                        : isPassed
                        ? 'text-[#0f7a4f]'
                        : 'text-[#59665f]/50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 transition-colors ${
                        isCurrent
                          ? 'bg-[#0f7a4f] text-white shadow-md shadow-[#0f7a4f]/30 ring-4 ring-[#0f7a4f]/15'
                          : isPassed
                          ? 'bg-[#0f7a4f] text-white'
                          : 'bg-[#f5f7f3] text-[#59665f]/60 border border-[#17231d]/10'
                      }`}
                    >
                      <StepIcon size={16} />
                    </div>
                    <span
                      className={`text-xs font-bold leading-tight ${
                        isCurrent
                          ? 'text-[#0b4f34]'
                          : isPassed
                          ? 'text-[#17231d]'
                          : 'text-[#59665f]/60'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Vùng chi tiết 2 cột (Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CỘT TRÁI (2/3): Danh sách hàng hóa & Ghi chú */}
        <div className="lg:col-span-2 space-y-4">
          {/* Danh sách mặt hàng */}
          <div className="bg-white rounded-2xl border border-[#17231d]/10 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#17231d]/10 flex items-center justify-between">
              <h2 className="font-bold text-sm sm:text-base text-[#17231d] flex items-center gap-2">
                <Package size={17} className="text-[#0f7a4f]" />
                <span>Mặt hàng trong đơn</span>
              </h2>
              <span className="text-xs font-semibold text-[#59665f]">
                {items.length} mặt hàng
              </span>
            </div>

            <div className="divide-y divide-[#17231d]/5">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="p-3.5 sm:p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs sm:text-sm text-[#17231d] leading-snug">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[#59665f] mt-0.5">
                        {item.sku && <span className="font-mono font-semibold">SKU: {item.sku}</span>}
                        <span>·</span>
                        <span>ĐVT: {item.unit || 'Kg'}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs sm:text-sm text-[#0f7a4f]">
                        {money(lineTotal(item))}
                      </span>
                      <p className="text-[10px] text-[#59665f]">
                        {item.quantity} {item.unit || 'Kg'} ×{' '}
                        {Number(item.finalUnitPrice ?? item.price) > 0
                          ? money(item.finalUnitPrice ?? item.price)
                          : 'Báo giá'}
                      </p>
                    </div>
                  </div>

                  {/* Ghi chú từng dòng */}
                  {item.customerNote && (
                    <div className="text-[11px] text-[#0f7a4f] bg-[#0f7a4f]/5 px-2.5 py-1 rounded-lg border border-[#0f7a4f]/15 italic">
                      📝 Yêu cầu của khách: {item.customerNote}
                    </div>
                  )}
                  {item.itemNote && (
                    <div className="text-[11px] text-[#59665f] bg-[#f8faf7] px-2.5 py-1 rounded-lg border border-[#17231d]/10 italic">
                      Xác nhận của TPS1: {item.itemNote}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Ghi chú toàn đơn */}
            {order.note && (
              <div className="p-3.5 bg-amber-500/10 border-t border-amber-200/40 text-amber-900 text-xs">
                <span className="font-bold">Ghi chú đơn hàng: </span>
                <span>{order.note}</span>
              </div>
            )}
          </div>

          {/* Tóm tắt tiền */}
          <div className="bg-white rounded-2xl border border-[#17231d]/10 shadow-xs p-4 sm:p-5 space-y-2 text-xs">
            <h3 className="font-bold text-sm text-[#17231d] flex items-center gap-2 mb-2">
              <FileText size={16} className="text-[#0f7a4f]" />
              <span>Tổng kết tiền hàng</span>
            </h3>

            <div className="flex justify-between text-[#59665f]">
              <span>Tạm tính tiền hàng:</span>
              <span className="font-mono font-semibold text-[#17231d]">
                {money(order.subtotal || order.grand_total)}
              </span>
            </div>

            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-[#59665f]">
                <span>Chiết khấu khách hàng VIP:</span>
                <span className="font-mono font-bold text-red-600">
                  -{money(order.discount_amount || 0)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-[#59665f]">
              <span>Phí vận chuyển xe lạnh:</span>
              <span className="font-mono font-semibold text-[#17231d]">
                {Number(order.shipping_amount) > 0 ? money(order.shipping_amount || 0) : 'Miễn phí'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2.5 border-t border-[#17231d]/10">
              <span className="text-sm font-black text-[#17231d]">Tổng thanh toán:</span>
              <span className="text-xl font-black font-mono text-[#0f7a4f]">
                {money(order.grand_total)}
              </span>
            </div>

            <p className="text-[10px] text-[#59665f] flex items-center gap-1 pt-1">
              <Info size={12} className="text-[#e0742f]" />
              <span>
                {order.status === 'completed'
                  ? 'Giá đã chốt và hoàn tất thanh toán/công nợ.'
                  : 'Giá tạm tính — Nhân viên bán hàng TPS1 sẽ xác nhận giá cuối cùng theo chứng từ xuất kho.'}
              </span>
            </p>
          </div>
        </div>

        {/* CỘT PHẢI (1/3): Thông tin khách, giao nhận, thanh toán */}
        <div className="space-y-4">
          {/* Thông tin giao hàng */}
          <div className="bg-white rounded-2xl border border-[#17231d]/10 shadow-xs p-4 space-y-3 text-xs">
            <h3 className="font-bold text-sm text-[#17231d] flex items-center gap-2 pb-2 border-b border-[#17231d]/10">
              <MapPin size={16} className="text-[#0f7a4f]" />
              <span>Địa chỉ &amp; Giao nhận</span>
            </h3>

            <div className="space-y-2">
              {order.delivery_date && (
                <div className="flex items-start gap-2.5 text-[#17231d]">
                  <Clock size={14} className="text-[#0f7a4f] mt-0.5 shrink-0" />
                  <span>Ngày giao dự kiến: <strong>{new Date(`${order.delivery_date}T00:00:00`).toLocaleDateString('vi-VN')}</strong></span>
                </div>
              )}
              {(order.delivery_name || order.delivery_phone) && (
                <div className="flex items-start gap-2.5">
                  <User size={14} className="text-[#59665f]/60 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-[#17231d]">{order.delivery_name || 'Khách hàng'}</p>
                    {order.delivery_phone && (
                      <p className="text-[#59665f] font-mono">{order.delivery_phone}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2.5 text-[#59665f]">
                <MapPin size={14} className="text-[#59665f]/60 mt-0.5 shrink-0" />
                <span className="leading-relaxed">
                  {order.delivery_address || 'Địa chỉ kho/bếp ăn mặc định'}
                </span>
              </div>
            </div>
          </div>

          {/* Thanh toán & Công nợ */}
          <div className="bg-white rounded-2xl border border-[#17231d]/10 shadow-xs p-4 space-y-3 text-xs">
            <h3 className="font-bold text-sm text-[#17231d] flex items-center gap-2 pb-2 border-b border-[#17231d]/10">
              <Wallet size={16} className="text-[#0f7a4f]" />
              <span>Thanh toán &amp; Công nợ</span>
            </h3>

            <div>
              <span className="text-[11px] text-[#59665f] block mb-1">Phương thức</span>
              <span className="font-semibold text-[#17231d] bg-[#f8faf7] px-2.5 py-1 rounded-lg border border-[#17231d]/10 inline-block">
                {PAYMENT_METHOD_LABELS[String(order.payment_method || '').toUpperCase()] || order.payment_method || 'Chưa cập nhật'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#59665f] block mb-1">Trạng thái thanh toán</span>
              <span className="font-semibold text-[#17231d]">
                {PAYMENT_LABELS[order.payment_status] || order.payment_status}
              </span>
            </div>

            {order.paid_amount != null && (
              <div className="space-y-1.5 pt-2 border-t border-[#17231d]/10">
                <div className="flex justify-between">
                  <span className="text-[#59665f]">Đã thu:</span>
                  <span className="font-mono font-bold text-[#0f7a4f]">
                    {money(order.paid_amount || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#59665f]">Còn nợ:</span>
                  <span className="font-mono font-bold text-rose-600">
                    {money(order.debt_amount ?? order.grand_total)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Hủy Đơn Hàng */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-[#17231d]/10 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#17231d]/10">
              <h3 className="font-bold text-base text-[#17231d] flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-600" />
                <span>Xác nhận hủy đơn hàng</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="text-[#59665f] hover:text-[#17231d] p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#59665f] leading-relaxed">
              Bạn có chắc chắn muốn hủy đơn hàng{' '}
              <strong className="font-mono text-[#17231d]">{order.order_code}</strong>? Sau khi hủy,
              kho sẽ không chuẩn bị và không giao chuyến hàng này.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#17231d] mb-1">
                Lý do hủy đơn <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do hủy (vd: thay đổi thực đơn, hoãn tiệc, đặt trùng...)"
                className="w-full text-xs p-3 bg-[#f8faf7] border border-[#17231d]/15 rounded-xl text-[#17231d] focus:outline-none focus:bg-white focus:border-rose-500 resize-none"
              />
            </div>

            {cancelError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                {cancelError}
              </p>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[#17231d]/15 text-[#17231d] font-bold text-xs hover:bg-[#f5f7f3]"
              >
                Giữ đơn hàng
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={canceling}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-50"
              >
                {canceling ? 'Đang hủy...' : 'Đồng ý hủy đơn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
