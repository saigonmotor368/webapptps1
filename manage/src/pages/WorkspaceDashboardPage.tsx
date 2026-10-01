import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Boxes, CircleDollarSign, Clock3,
  Package, PackageCheck, Plus, RefreshCw, ShoppingCart, Tags, Truck, Users,
  Sparkles, Calendar, ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { can, ROLE_LABELS } from '../lib/permissions';
import { supabase } from '../lib/supabase';

type DashboardStats = {
  todayOrders: number;
  todayRevenue: number;
  pending: number;
  inProgress: number;
  completed: number;
  customers: number;
};

const EMPTY_STATS: DashboardStats = {
  todayOrders: 0,
  todayRevenue: 0,
  pending: 0,
  inProgress: 0,
  completed: 0,
  customers: 0,
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Đơn nháp',
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  preparing: 'Đang chuẩn bị',
  shipping: 'Đang giao',
  completed: 'Hoàn thành',
  canceled: 'Đã hủy',
  merged: 'Đã gộp',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  draft: 'bg-slate-400',
  pending: 'bg-amber-500',
  confirmed: 'bg-blue-500',
  preparing: 'bg-violet-500',
  shipping: 'bg-sky-500',
  completed: 'bg-emerald-500',
  canceled: 'bg-red-500',
  merged: 'bg-slate-500',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-slate-50 text-slate-700 border-slate-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-800 border-blue-200',
  preparing: 'bg-violet-50 text-violet-800 border-violet-200',
  shipping: 'bg-sky-50 text-sky-800 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  canceled: 'bg-red-50 text-red-800 border-red-200',
  merged: 'bg-slate-100 text-slate-700 border-slate-200',
};

const money = (value: number | string) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))}đ`;
const dateTime = (value: string) => new Date(value).toLocaleString('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
});

export default function WorkspaceDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || 'sale';
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayResult, pendingResult, progressResult, completedResult, customerResult, recentResult] = await Promise.all([
        supabase.from('orders').select('grand_total').gte('created_at', today.toISOString()).neq('status', 'canceled').neq('status', 'merged'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['draft', 'pending']),
        supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['confirmed', 'preparing', 'shipping']),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('vip_accounts').select('id', { count: 'exact', head: true }),
        supabase.from('orders')
          .select('id, order_code, status, grand_total, customer_name, customer_company, created_at')
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      const todayRevenue = (todayResult.data || []).reduce((sum, item: any) => sum + (Number(item.grand_total) || 0), 0);

      setStats({
        todayOrders: (todayResult.data || []).length,
        todayRevenue,
        pending: pendingResult.count || 0,
        inProgress: progressResult.count || 0,
        completed: completedResult.count || 0,
        customers: customerResult.count || 0,
      });
      setRecentOrders(recentResult.data || []);
    } catch (err: any) {
      console.error('Dashboard load error:', err);
      setError(err?.message || 'Không tải được dữ liệu tổng quan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  // Thẻ thống kê thông minh (click vào sẽ chuyển thẳng đến danh sách đơn tương ứng)
  const cards = useMemo(() => [
    {
      label: 'Đơn hôm nay',
      value: stats.todayOrders,
      icon: ShoppingCart,
      gradient: 'from-blue-500/10 to-blue-500/5',
      iconBg: 'bg-blue-600 text-white shadow-blue-500/20',
      badge: 'Hôm nay',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      path: '/don-hang',
    },
    {
      label: 'Chờ xác nhận',
      value: stats.pending,
      icon: Clock3,
      gradient: 'from-amber-500/10 to-amber-500/5',
      iconBg: 'bg-amber-500 text-white shadow-amber-500/20',
      badge: stats.pending > 0 ? 'Cần xử lý' : 'Đã xong',
      badgeColor: stats.pending > 0 ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse' : 'bg-slate-100 text-slate-600',
      path: '/don-hang?status=pending',
    },
    {
      label: 'Đang thực hiện',
      value: stats.inProgress,
      icon: Truck,
      gradient: 'from-purple-500/10 to-purple-500/5',
      iconBg: 'bg-purple-600 text-white shadow-purple-500/20',
      badge: 'Chuẩn bị / Giao',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      path: '/don-hang?status=preparing',
    },
    {
      label: role === 'sale' ? 'Khách hoạt động' : 'Doanh thu hôm nay',
      value: role === 'sale' ? stats.customers : money(stats.todayRevenue),
      icon: role === 'sale' ? Users : CircleDollarSign,
      gradient: 'from-emerald-500/10 to-emerald-500/5',
      iconBg: 'bg-emerald-600 text-white shadow-emerald-500/20',
      badge: role === 'sale' ? 'Khách hàng' : 'Doanh số',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      path: role === 'sale' ? '/khach-hang' : '/don-hang',
    },
  ], [role, stats]);

  const actions = useMemo(() => {
    const items = [
      can(role, 'orders.create') && { label: 'Tạo đơn mới', description: 'Mở máy bán hàng POS lên đơn nhanh', path: '/tao-don-hang', icon: Plus, highlight: true },
      can(role, 'orders.view') && { label: 'Quản lý đơn', description: 'Danh sách, lọc, gộp đơn & xuất file', path: '/don-hang', icon: ShoppingCart },
      can(role, 'pricing.view') && { label: 'Thiết lập giá', description: 'Bảng giá theo khách hàng & xưởng', path: '/thiet-lap-gia', icon: Tags },
      can(role, 'procurement.view') && { label: 'Đơn tổng', description: 'Tổng hợp nhu cầu thu mua ngày mai', path: '/don-tong', icon: Boxes },
      can(role, 'products.view') && { label: 'Hàng hóa', description: 'Danh mục, tồn kho và đơn giá', path: '/hang-hoa', icon: Package },
      can(role, 'orders.packing') && { label: 'Xử lý đơn hàng', description: 'Soạn hàng theo đơn và giao nhận', path: '/soan-hang', icon: PackageCheck },
      can(role, 'customers.view') && { label: 'Khách hàng', description: 'Hồ sơ, chiết khấu và điểm giao', path: '/khach-hang', icon: Users },
      can(role, 'finance.view') && { label: 'Công nợ', description: 'Theo dõi thu tiền và hóa đơn', path: '/cong-no', icon: CircleDollarSign },
      can(role, 'reports.view') && { label: 'Báo cáo', description: 'Chỉ số kinh doanh và đối soát', path: '/bao-cao', icon: BarChart3 },
    ].filter(Boolean) as { label: string; description: string; path: string; icon: typeof ShoppingCart; highlight?: boolean }[];

    const priority: Record<string, string[]> = {
      admin: ['/tao-don-hang', '/don-hang', '/don-tong', '/thiet-lap-gia'],
      truong_phong: ['/don-hang', '/tao-don-hang', '/thiet-lap-gia', '/bao-cao'],
      sale: ['/tao-don-hang', '/don-hang', '/khach-hang', '/thiet-lap-gia'],
      thu_mua: ['/don-tong', '/hang-hoa', '/soan-hang', '/thiet-lap-gia'],
      kho: ['/soan-hang', '/don-tong', '/don-hang'],
      ke_toan: ['/cong-no', '/bao-cao', '/don-hang'],
    };
    const order = priority[role] || priority.sale;
    return items.sort((a, b) => {
      const ai = order.indexOf(a.path); const bi = order.indexOf(b.path);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    }).slice(0, 4);
  }, [role]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `Hôm nay, ngày ${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
  }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* HEADER: Hiện đại, thanh lịch, thân thiện và tiết kiệm không gian   */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
        {/* Subtle decorative gradient glow */}
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-emerald-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-32 -bottom-10 w-40 h-40 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4">
            {/* User Avatar */}
            <div className="relative shrink-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-emerald-700 to-emerald-500 text-white font-extrabold text-base sm:text-lg flex items-center justify-center shadow-md shadow-emerald-700/20">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'TP'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
                  Xin chào, {user?.name || 'Bạn'} <span className="inline-block animate-wave">👋</span>
                </h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {ROLE_LABELS[role] || role}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-slate-400">
                  <Calendar size={13} /> {todayStr}
                </span>
                <span className="hidden sm:inline text-slate-300">·</span>
                <span>
                  {stats.pending > 0 ? (
                    <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.2 rounded border border-amber-200">
                      {stats.pending} đơn chờ xác nhận
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium">Hệ thống đang hoạt động ổn định</span>
                  )}
                </span>
              </p>
            </div>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
            {can(role, 'orders.create') && (
              <button
                onClick={() => navigate('/tao-don-hang')}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus size={16} /> Tạo đơn POS
              </button>
            )}
            <button
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="p-2 sm:px-3 sm:py-2 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              title="Làm mới dữ liệu"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <span>❌</span>
          <span>{error}</span>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* METRIC CARDS: Hiện đại, bo tròn mềm mại, click chuyển tab nhanh     */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              onClick={() => navigate(card.path)}
              className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs hover:shadow-md hover:border-emerald-300 hover:-translate-y-0.5 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs transition-transform group-hover:scale-105 ${card.iconBg}`}>
                  <Icon size={19} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${card.badgeColor}`}>
                  {card.badge}
                </span>
              </div>

              <div className="mt-3">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight mt-0.5">
                  {loading ? '—' : card.value}
                </p>
              </div>
            </article>
          );
        })}
      </section>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* LOWER SECTION: Đơn hàng gần đây + Lối tắt thao tác nhanh           */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        
        {/* Đơn hàng gần đây */}
        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div>
              <p className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <ShoppingCart size={17} className="text-emerald-700" />
                Đơn hàng gần đây
              </p>
              <p className="text-xs text-slate-400">Cập nhật theo thời gian thực</p>
            </div>
            {can(role, 'orders.view') && (
              <button
                onClick={() => navigate('/don-hang')}
                className="text-xs sm:text-sm font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 group"
              >
                Xem tất cả
                <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <ShoppingCart className="mx-auto text-slate-300" size={34} />
                <p className="mt-3 font-semibold text-slate-600 text-sm">Chưa có đơn hàng nào</p>
                <p className="mt-1 text-xs text-slate-400">Các đơn mới tạo sẽ hiển thị tại đây.</p>
              </div>
            ) : (
              recentOrders.map((order) => {
                const statusDot = STATUS_DOT_COLORS[order.status] || 'bg-slate-400';
                const statusBadge = STATUS_BADGE_COLORS[order.status] || 'bg-slate-100 text-slate-700 border-slate-200';

                return (
                  <button
                    key={order.id}
                    onClick={() => navigate(`/don-hang/${order.id}`)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 sm:px-5 hover:bg-slate-50/80 transition-colors text-left group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm group-hover:text-emerald-700 transition-colors">
                          {order.order_code}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-600 font-medium">
                        {order.customer_name}
                        {order.customer_company ? ` · ${order.customer_company}` : ''}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{dateTime(order.created_at)}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-slate-900 text-sm sm:text-base">
                        {money(order.grand_total)}
                      </p>
                      <span className="text-[11px] text-slate-400 group-hover:text-emerald-700 flex items-center justify-end gap-0.5 mt-0.5 transition-colors">
                        Chi tiết <ChevronRight size={12} />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Lối tắt công việc theo vai trò */}
        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <p className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
                <Sparkles size={16} className="text-amber-500" />
                Lối tắt thao tác
              </p>
              <p className="text-xs text-slate-400">Các chức năng hay dùng nhất</p>
            </div>

            <div className="space-y-2.5">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.path}
                    onClick={() => navigate(action.path)}
                    className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      action.highlight
                        ? 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 hover:shadow-xs'
                        : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${
                        action.highlight
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700'
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs sm:text-sm font-bold text-slate-800 group-hover:text-emerald-800 transition-colors">
                        {action.label}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {action.description}
                      </span>
                    </span>
                    <ArrowRight size={15} className="text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400">
              TPS1 ERP Core · Phiên bản đồng bộ KiotViet
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
