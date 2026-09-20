import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { printOrderSlip } from '../lib/printOrder';
import {
  RefreshCw, Search, Eye, Printer, Clock, Truck, CheckCircle,
  ShoppingBag, TrendingUp, ClipboardEdit, FileSpreadsheet, AlertCircle
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Đơn nháp',
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  preparing: 'Đang chuẩn bị',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  canceled: 'Đã hủy',
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
  cod: 'COD',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
};

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  miniapp: 'Mini App',
  zalo_mini_app: 'Zalo',
  admin: 'Admin',
};

function money(val: number | string) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val) || 0)) + 'đ';
}

function dt(val: string) {
  return val ? new Date(val).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-purple-100 text-purple-700',
  shipping: 'bg-sky-100 text-sky-700',
  completed: 'bg-green-100 text-green-700',
  canceled: 'bg-red-100 text-red-700',
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  cod: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-pink-100 text-pink-700',
};

// Dạng danh sách + bộ lọc phù hợp khi quản lý số lượng đơn lớn
// (mục brief 2026-09-10: "quản lý đơn hàng sao ko làm dạng list + filter...
// nhiều đơn để thế này e ko ổn") — bấm vào 1 dòng mới mở chi tiết, không
// hiện hết thông tin từng đơn ngay trên danh sách như bản card cũ.
export default function OrdersPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [changeRequestsMap, setChangeRequestsMap] = useState<Map<string, any>>(new Map());
  const [filterHasRequest, setFilterHasRequest] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Tải yêu cầu điều chỉnh/hủy mở (WP6b)
      if (token) {
        fetch(`${apiBase}/api/admin/order-change-requests?status=open`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok && Array.isArray(d.requests)) {
              setChangeRequests(d.requests);
              const m = new Map<string, any>();
              d.requests.forEach((r: any) => m.set(r.orderId, r));
              setChangeRequestsMap(m);
            }
          })
          .catch((e) => console.warn('Lỗi tải order-change-requests:', e));
      }
      let query = supabase
        .from('orders')
        .select(`
          id, order_code, status, payment_status, payment_method, source,
          subtotal, discount_amount, discount_percent, shipping_amount, grand_total,
          paid_amount, debt_amount,
          voucher_code, voucher_discount, manual_discount_percent,
          note, pricing_note, created_at, updated_at, confirmed_at,
          customer_id, customer_code, customer_name, customer_phone, customer_company,
          customer_tier, pricing_status, price_revision, confirmation_document_status,
          delivery_type, delivery_address, delivery_name, delivery_phone, delivery_alias,
          sales_rep_id, item_count
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lt('created_at', `${dateTo}T23:59:59.999`);

      // Sale chỉ thấy đơn hàng của KH được giao cho mình
      if (user?.role === 'sale' && user.id && user.id !== 'legacy-admin') {
        const { data: myCustomers } = await supabase
          .from('vip_accounts')
          .select('id, partner_code')
          .eq('sales_rep_id', user.id);
        const myCodes = (myCustomers || []).map((c: any) => c.partner_code).filter(Boolean);
        if (myCodes.length > 0) {
          query = query.in('customer_code', myCodes);
        } else {
          setOrders([]); setLoading(false); return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const salesRepIds = [...new Set((data || []).map((o: any) => o.sales_rep_id).filter(Boolean))];
      const { data: reps } = salesRepIds.length
        ? await supabase.from('admin_profiles').select('id, name').in('id', salesRepIds)
        : { data: [] as { id: string; name: string }[] };
      const repMap = new Map((reps || []).map((r: any) => [r.id, r.name]));

      // Màn danh sách chỉ cần item_count. Chi tiết sản phẩm được tải khi mở
      // OrderDetailPage; không kéo toàn bộ order_items của 500 đơn mỗi lần vào trang.
      setOrders((data || []).map((o: any) => ({ ...o, sales_rep_name: repMap.get(o.sales_rep_id) || null })));
    } catch (err) {
      console.error('Lỗi tải đơn hàng:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dateFrom, dateTo, token, apiBase]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filteredOrders = orders.filter(order => {
    const hay = [order.order_code, order.customer_code, order.customer_name, order.customer_phone, order.customer_company, order.delivery_address].filter(Boolean).join(' ').toLowerCase();
    return (!searchTerm || hay.includes(searchTerm.toLowerCase()))
      && (!filterStatus || order.status === filterStatus)
      && (!filterPayment || order.payment_status === filterPayment)
      && (!filterHasRequest || changeRequestsMap.has(order.id));
  });

  // Stats
  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    shipping: orders.filter(o => o.status === 'shipping').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders.filter(o => o.status !== 'canceled').reduce((s, o) => s + (Number(o.grand_total) || 0), 0),
  };
  const totals = filteredOrders.reduce((acc, o) => {
    acc.grand += Number(o.grand_total) || 0;
    acc.paid += Number(o.paid_amount) || 0;
    return acc;
  }, { grand: 0, paid: 0 });

  const changeStatus = async (order: any, newStatus: string) => {
    const note = prompt(`Chuyển ${order.order_code} sang "${STATUS_LABELS[newStatus]}". Ghi chú (không bắt buộc):`, '') ?? null;
    if (note === null) return;
    setUpdatingId(order.id);
    try {
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, status: newStatus, note }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await fetchOrders();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể cập nhật trạng thái'));
    } finally {
      setUpdatingId(null);
    }
  };

  const changePayment = async (order: any, newPayment: string) => {
    setUpdatingId(order.id);
    try {
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, status: order.status, paymentStatus: newPayment, note: `Cập nhật thanh toán: ${PAYMENT_LABELS[newPayment]}` }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await fetchOrders();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể cập nhật thanh toán'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePrint = (order: any, e: React.MouseEvent) => { e.stopPropagation(); printOrderSlip(order); };

  const handleProcess = (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/tao-don-hang?processOrderId=${order.id}`);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPayment) params.set('paymentStatus', filterPayment);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', `${dateTo}T23:59:59.999`);
      if (searchTerm) params.set('search', searchTerm);
      const res = await fetch(`${apiBase}/api/admin/orders/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Không xuất được danh sách đơn hàng');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `danh-sach-don-hang_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xuất được danh sách đơn hàng'));
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản lý Đơn hàng</h1>
          <p className="text-slate-500 text-sm">{orders.length} đơn hàng · đang hiển thị {filteredOrders.length}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportExcel} disabled={exporting}
            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
            <FileSpreadsheet size={16} /> {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          <button onClick={fetchOrders} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors" title="Tải lại">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Chờ xác nhận', value: stats.pending, icon: <Clock size={18} />, color: 'text-amber-600 bg-amber-50' },
          { label: 'Đang chuẩn bị', value: stats.preparing, icon: <ShoppingBag size={18} />, color: 'text-purple-600 bg-purple-50' },
          { label: 'Đang giao', value: stats.shipping, icon: <Truck size={18} />, color: 'text-sky-600 bg-sky-50' },
          { label: 'Hoàn thành', value: stats.completed, icon: <CheckCircle size={18} />, color: 'text-green-600 bg-green-50' },
          { label: 'Doanh thu', value: money(stats.revenue), icon: <TrendingUp size={18} />, color: 'text-red-600 bg-red-50' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>{s.icon}</div>
            <div className="font-bold text-slate-800 text-xl leading-tight">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-white rounded-xl border border-slate-100 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Tìm mã đơn, khách, SĐT..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 w-56" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
          className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20">
          <option value="">Tất cả thanh toán</option>
          {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600" />
        <span className="text-slate-400 text-sm">đến</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600" />
        <button
          onClick={() => setFilterHasRequest(!filterHasRequest)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors ${
            filterHasRequest
              ? 'bg-amber-600 text-white shadow-sm'
              : changeRequests.length > 0
              ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
          title={changeRequests.length > 0 ? `Có ${changeRequests.length} đơn có yêu cầu điều chỉnh / hủy đang chờ xử lý` : 'Lọc đơn có yêu cầu'}
        >
          <AlertCircle size={15} className={changeRequests.length > 0 && !filterHasRequest ? 'text-amber-600 animate-pulse' : ''} />
          Có yêu cầu {changeRequests.length > 0 ? `(${changeRequests.length})` : '(0)'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Mã đơn</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Sale</th>
                <th className="px-4 py-3 text-center">SP</th>
                <th className="px-4 py-3 text-right">Khách cần trả</th>
                <th className="px-4 py-3 text-right">Đã trả</th>
                <th className="px-4 py-3 text-center">Xử lý</th>
                <th className="px-4 py-3 text-center">Thanh toán</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50/70 font-semibold text-slate-500">
                <td className="px-4 py-2" colSpan={5}>Tổng ({filteredOrders.length} đơn)</td>
                <td className="px-4 py-2 text-right text-slate-700">{money(totals.grand)}</td>
                <td className="px-4 py-2 text-right text-slate-700">{money(totals.paid)}</td>
                <td colSpan={3}></td>
              </tr>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-500">Đang tải đơn hàng...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-slate-400">
                    <ShoppingBag size={32} className="mx-auto mb-2 opacity-40" />
                    Không tìm thấy đơn hàng phù hợp
                  </td>
                </tr>
              ) : filteredOrders.map(order => (
                <tr key={order.id} onClick={() => navigate(`/don-hang/${order.id}`)}
                  className={`hover:bg-slate-50/70 cursor-pointer transition-colors ${updatingId === order.id ? 'opacity-60 pointer-events-none' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">{order.order_code}</p>
                      {changeRequestsMap.has(order.id) && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs ${
                            changeRequestsMap.get(order.id)?.type === 'cancel'
                              ? 'bg-red-50 text-red-700 border-red-300 animate-pulse'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                          title={`Yêu cầu của khách: "${changeRequestsMap.get(order.id)?.message || ''}"`}
                        >
                          {changeRequestsMap.get(order.id)?.type === 'cancel' ? '❌ Yêu cầu hủy' : '✏️ Yêu cầu sửa'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        {SOURCE_LABELS[order.source] || order.source || 'Admin'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{dt(order.created_at)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{order.customer_name}</p>
                    <p className="text-xs text-slate-400">{order.customer_code}{order.customer_company ? ` · ${order.customer_company}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{order.sales_rep_name || '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{order.item_count || 0}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{money(order.grand_total)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(order.paid_amount || 0)}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <select value={order.status} onChange={e => changeStatus(order, e.target.value)}
                      className={`text-xs px-2 py-1.5 rounded-lg border focus:outline-none ${STATUS_COLORS[order.status] || 'bg-slate-50 text-slate-600'} border-transparent`}>
                      {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <select value={order.payment_status} onChange={e => changePayment(order, e.target.value)}
                      className={`text-xs px-2 py-1.5 rounded-lg border focus:outline-none ${PAYMENT_COLORS[order.payment_status] || 'bg-slate-50 text-slate-600'} border-transparent`}>
                      {Object.entries(PAYMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      {order.pricing_status !== 'finalized' && (
                        <button onClick={e => handleProcess(order, e)}
                          className="p-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors" title="Xử lý đơn hàng (mở màn Bán hàng)">
                          <ClipboardEdit size={16} />
                        </button>
                      )}
                      <button onClick={() => navigate(`/don-hang/${order.id}`)}
                        className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors" title="Xem chi tiết">
                        <Eye size={16} />
                      </button>
                      <button onClick={e => handlePrint(order, e)}
                        className="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors" title="Xuất phiếu tạm">
                        <Printer size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
