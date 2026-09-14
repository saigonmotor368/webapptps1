import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, User, Phone, MapPin, Package, FileText, Wallet, Receipt, ClipboardList } from 'lucide-react';
import { api, requestFile, type Order, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

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
  pending: 'Chờ xử lý', cod: 'COD (trả khi nhận)', paid: 'Đã thanh toán', failed: 'Thất bại', refunded: 'Đã hoàn tiền',
};

function money(v: number | string) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}
function dt(v: string) {
  return v ? new Date(v).toLocaleString('vi-VN') : '—';
}

// Cùng bố cục "hóa đơn đầy đủ" như MyOrderDetailPage của sale-webapp, dùng
// chung API /api/customer/orders (đã trả đủ field, không cần API lấy 1 đơn
// riêng vì số đơn của 1 khách hiếm khi cần phân trang).
export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<'confirmation' | 'invoice' | null>(null);

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
      setError(err instanceof ApiError ? err.message : 'Không tải được đơn hàng');
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
      a.download = `${type === 'invoice' ? 'HOA-DON' : 'XAC-NHAN-DON-HANG'}_${order.order_code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi: ' + (err instanceof ApiError ? err.message : 'Không tải được chứng từ'));
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-[#59665f]">
        <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải đơn hàng...
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/don-hang')} className="flex items-center gap-1.5 text-sm text-[#59665f] hover:text-[#14231c]">
          <ArrowLeft size={16} /> Quay lại
        </button>
        <div className="text-center py-16 text-red-500">{error || `Không tìm thấy đơn hàng #${id}`}</div>
      </div>
    );
  }

  const items = order.items || [];
  const lineTotal = (item: Order['items'][number]) =>
    Number(item.finalLineTotal ?? item.lineTotal ?? Number(item.finalUnitPrice ?? item.price) * Number(item.quantity));

  return (
    <div className="space-y-6 pb-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/don-hang')} className="p-2 bg-white border border-[#14231c]/15 rounded-xl hover:bg-[#f6f7f4] text-[#59665f] transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-bold text-[#14231c]">{order.order_code}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
            <p className="text-xs text-[#59665f]/70">{dt(order.created_at)}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {order.confirmation_document_id && (
            <button
              onClick={() => downloadDocument('confirmation')}
              disabled={downloading !== null}
              className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              <ClipboardList size={16} /> {downloading === 'confirmation' ? 'Đang tải...' : 'Tải phiếu xác nhận'}
            </button>
          )}
          {order.invoice_document_id && (
            <button
              onClick={() => downloadDocument('invoice')}
              disabled={downloading !== null}
              className="px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Receipt size={16} /> {downloading === 'invoice' ? 'Đang tải...' : 'Tải hóa đơn'}
            </button>
          )}
          <button onClick={fetchOrder} className="p-2 border border-[#14231c]/15 rounded-xl text-[#59665f] hover:bg-[#f6f7f4]">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#14231c]/10 overflow-hidden">
            <div className="p-5 border-b border-[#14231c]/10 flex items-center justify-between">
              <h2 className="font-bold text-[#14231c] flex items-center gap-2">
                <Package size={18} className="text-[#0f6f4b]" />Sản phẩm trong đơn
              </h2>
              <span className="text-sm text-[#59665f]">{items.length} sản phẩm</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f6f7f4] text-[#59665f] text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Sản phẩm</th>
                    <th className="px-4 py-3 text-center">SL</th>
                    <th className="px-4 py-3 text-right">Đơn giá</th>
                    <th className="px-4 py-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#14231c]/5">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#14231c]">{item.name}</p>
                        {item.sku && <p className="text-xs text-[#59665f]/70">SKU: {item.sku}</p>}
                        {item.itemNote && <p className="text-xs text-[#59665f]/70 italic">{item.itemNote}</p>}
                      </td>
                      <td className="px-4 py-3 text-center text-[#59665f]">{item.quantity} {item.unit || ''}</td>
                      <td className="px-4 py-3 text-right text-[#59665f]">
                        {Number(item.finalUnitPrice ?? item.price) > 0 ? money(item.finalUnitPrice ?? item.price) : (
                          <span className="text-amber-600 font-medium">Liên hệ báo giá</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#14231c]">{money(lineTotal(item))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {order.note && (
              <div className="p-4 border-t border-[#14231c]/10 bg-amber-50 text-amber-800 text-sm">
                <span className="font-semibold">Ghi chú: </span>{order.note}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#14231c]/10 p-5 space-y-2 text-sm">
            <h2 className="font-bold text-[#14231c] flex items-center gap-2 mb-2">
              <FileText size={18} className="text-[#0f6f4b]" />Tổng kết đơn
            </h2>
            <div className="flex justify-between text-[#59665f]"><span>Tạm tính</span><span className="font-medium text-[#14231c]">{money(order.subtotal || 0)}</span></div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-[#59665f]"><span>Chiết khấu</span><span className="text-red-600 font-medium">-{money(order.discount_amount || 0)}</span></div>
            )}
            <div className="flex justify-between text-[#59665f]"><span>Phí giao hàng</span><span className="font-medium text-[#14231c]">{money(order.shipping_amount || 0)}</span></div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-[#14231c]/10">
              <span>Tổng thanh toán</span><span className="text-[#0f6f4b]">{money(order.grand_total)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#14231c]/10 p-5 space-y-4">
            <h2 className="font-bold text-[#14231c] flex items-center gap-2"><User size={18} className="text-[#0f6f4b]" />Khách hàng</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <User size={16} className="text-[#59665f]/60 mt-0.5 shrink-0" />
                <div><p className="font-semibold text-[#14231c]">{order.customer_tier || 'VIP0'}</p></div>
              </div>
              <div className="flex items-center gap-3 text-[#59665f]">
                <Phone size={16} className="text-[#59665f]/60 shrink-0" />{order.customer_phone || '—'}
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#14231c]/10 p-5 space-y-3">
            <h2 className="font-bold text-[#14231c] flex items-center gap-2"><MapPin size={18} className="text-[#0f6f4b]" />Giao hàng</h2>
            {order.delivery_type === 'pickup' ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Nhận tại điểm</span>
            ) : (
              <dl className="space-y-2 text-sm">
                {(order.delivery_name || order.delivery_phone) && (
                  <div className="flex items-start gap-3">
                    <User size={16} className="text-[#59665f]/60 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[#14231c]">{order.delivery_name}</p>
                      {order.delivery_phone && <p className="text-xs text-[#59665f]/70">{order.delivery_phone}</p>}
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 text-[#59665f]">
                  <MapPin size={16} className="text-[#59665f]/60 mt-0.5 shrink-0" />
                  <span>{order.delivery_address || 'Chưa có địa chỉ'}</span>
                </div>
              </dl>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#14231c]/10 p-5 space-y-3">
            <h2 className="font-bold text-[#14231c] flex items-center gap-2"><Wallet size={18} className="text-[#0f6f4b]" />Thanh toán</h2>
            <div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                order.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                order.payment_status === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}>{PAYMENT_LABELS[order.payment_status] || order.payment_status}</span>
            </div>
            {order.paid_amount != null && (
              <dl className="space-y-1.5 text-sm pt-1">
                <div className="flex justify-between"><span className="text-[#59665f]">Đã thu</span><span className="font-semibold text-[#0f6f4b]">{money(order.paid_amount || 0)}</span></div>
                <div className="flex justify-between"><span className="text-[#59665f]">Còn nợ</span><span className="font-semibold text-red-600">{money(order.debt_amount ?? order.grand_total)}</span></div>
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
