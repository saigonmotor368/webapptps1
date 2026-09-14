import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingCart, Clock, Users, CheckCircle2 } from 'lucide-react';

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
  draft: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-purple-100 text-purple-700',
  shipping: 'bg-sky-100 text-sky-700',
  completed: 'bg-green-100 text-green-700',
  canceled: 'bg-red-100 text-red-700',
};

// LƯU Ý (2026-09-10): trang này trước đây đọc dữ liệu từ bảng quotes/leads
// (hệ leads tư vấn cũ) nên "Đơn hàng gần đây" hiện ra mã DH... trông giống
// đơn hàng thật nhưng KHÔNG click vào được (không phải id đơn hàng thật, và
// không có trang chi tiết cho quotes trong sale-webapp). Theo đúng kiến trúc
// đã chốt (mục 4 kế hoạch): leads/quotes chỉ dùng cho tư vấn trước khi khách
// có tài khoản chính thức; mọi đơn hàng thật đều nằm ở bảng orders. Đổi lại
// đọc đúng bảng orders/vip_accounts, và cho click vào từng đơn để xem/sửa.
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    todayOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    customers: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count: todayOrders } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      const { count: pendingOrders } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'pending']);

      const { count: completedOrders } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      const { count: customers } = await supabase
        .from('vip_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      setStats({
        todayOrders: todayOrders || 0,
        pendingOrders: pendingOrders || 0,
        completedOrders: completedOrders || 0,
        customers: customers || 0,
      });

      const { data: recent } = await supabase
        .from('orders')
        .select('id, order_code, customer_name, customer_company, status, grand_total, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recent) setRecentOrders(recent);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Xin chào, {user?.name}!</h1>
        <p className="text-slate-500">Tổng quan tình hình kinh doanh hôm nay.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Stat Cards */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingCart size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">Đơn hôm nay</span>
          </div>
          <div className="text-3xl font-bold text-slate-800">{stats.todayOrders}</div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">Đang chờ xử lý</span>
          </div>
          <div className="text-3xl font-bold text-slate-800">{stats.pendingOrders}</div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">Hoàn thành</span>
          </div>
          <div className="text-3xl font-bold text-slate-800">{stats.completedOrders}</div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">Khách hàng VIP</span>
          </div>
          <div className="text-3xl font-bold text-slate-800">{stats.customers}</div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Đơn hàng gần đây</h2>
          <button onClick={() => navigate('/don-hang')} className="text-sm font-medium text-green-600 hover:text-green-700">Xem tất cả →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Mã đơn</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Tổng tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrders.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-slate-500">Chưa có đơn hàng nào.</td></tr>
              ) : recentOrders.map(order => (
                <tr
                  key={order.id}
                  onClick={() => navigate(`/don-hang/${order.id}`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-green-700">{order.order_code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{order.customer_name}{order.customer_company ? ` · ${order.customer_company}` : ''}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-700'}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    {Number(order.grand_total).toLocaleString('vi-VN')}đ
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
