import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Boxes, CheckCircle2, CircleDollarSign, Clock3,
  Package, PackageCheck, Plus, RefreshCw, ShoppingCart, Tags, Truck, Users,
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
  draft: 'Đơn nháp', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận',
  preparing: 'Đang chuẩn bị', shipping: 'Đang giao', completed: 'Hoàn thành', canceled: 'Đã hủy',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700', preparing: 'bg-violet-100 text-violet-700',
  shipping: 'bg-sky-100 text-sky-700', completed: 'bg-emerald-100 text-emerald-700',
  canceled: 'bg-red-100 text-red-700',
};

const money = (value: number | string) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))}đ`;
const dateTime = (value: string) => new Date(value).toLocaleString('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
});

const ROLE_COPY: Record<string, { eyebrow: string; title: string; description: string }> = {
  admin: {
    eyebrow: 'TRUNG TÂM ĐIỀU HÀNH',
    title: 'Toàn cảnh vận hành TPS1',
    description: 'Theo dõi đơn hàng, doanh thu và các đầu việc cần xử lý trên toàn hệ thống.',
  },
  truong_phong: {
    eyebrow: 'ĐIỀU PHỐI KINH DOANH',
    title: 'Kiểm soát tiến độ bán hàng',
    description: 'Ưu tiên đơn chờ xác nhận, phân công xử lý và theo dõi kết quả trong ngày.',
  },
  sale: {
    eyebrow: 'BÀN LÀM VIỆC SALE',
    title: 'Chốt đơn nhanh, chăm khách tốt',
    description: 'Xử lý yêu cầu mới, tạo đơn và cập nhật thông tin khách hàng tại một nơi.',
  },
  thu_mua: {
    eyebrow: 'BÀN LÀM VIỆC THU MUA',
    title: 'Chuẩn bị nguồn hàng trong ngày',
    description: 'Theo dõi đơn đã xác nhận, tổng hợp nhu cầu và cập nhật giá hàng nhanh.',
  },
  kho: {
    eyebrow: 'BÀN LÀM VIỆC VẬN HÀNH',
    title: 'Soạn đúng hàng, giao đúng tiến độ',
    description: 'Tập trung các đơn đang chuẩn bị, đang giao và tiến độ hoàn tất.',
  },
  ke_toan: {
    eyebrow: 'BÀN LÀM VIỆC KẾ TOÁN',
    title: 'Theo dõi thanh toán và công nợ',
    description: 'Kiểm soát số tiền cần thu, trạng thái thanh toán và báo cáo kinh doanh.',
  },
};

export default function WorkspaceDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || 'sale';
  const copy = ROLE_COPY[role] || ROLE_COPY.sale;
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
        supabase.from('orders').select('grand_total').gte('created_at', today.toISOString()).neq('status', 'canceled'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['draft', 'pending']),
        supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['confirmed', 'preparing', 'shipping']),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        can(role, 'customers.view')
          ? supabase.from('vip_accounts').select('id', { count: 'exact', head: true }).eq('is_active', true)
          : Promise.resolve({ data: null, count: 0, error: null }),
        supabase.from('orders')
          .select('id, order_code, customer_name, customer_company, status, grand_total, created_at')
          .order('created_at', { ascending: false }).limit(6),
      ]);

      const firstError = [todayResult, pendingResult, progressResult, completedResult, customerResult, recentResult]
        .find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const todayRows = todayResult.data || [];
      setStats({
        todayOrders: todayRows.length,
        todayRevenue: todayRows.reduce((sum, order) => sum + Number(order.grand_total || 0), 0),
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
  }, [role]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const cards = useMemo(() => {
    if (role === 'thu_mua') return [
      { label: 'Đơn chờ xác nhận', value: stats.pending, icon: Clock3, tone: 'amber' },
      { label: 'Đơn đang thực hiện', value: stats.inProgress, icon: Truck, tone: 'blue' },
      { label: 'Đơn hôm nay', value: stats.todayOrders, icon: ShoppingCart, tone: 'emerald' },
      { label: 'Đã hoàn thành', value: stats.completed, icon: CheckCircle2, tone: 'violet' },
    ];
    if (role === 'kho') return [
      { label: 'Cần chuẩn bị/giao', value: stats.inProgress, icon: PackageCheck, tone: 'amber' },
      { label: 'Đơn hôm nay', value: stats.todayOrders, icon: ShoppingCart, tone: 'blue' },
      { label: 'Đã hoàn thành', value: stats.completed, icon: CheckCircle2, tone: 'emerald' },
      { label: 'Tổng khách hàng', value: stats.customers, icon: Users, tone: 'violet' },
    ];
    if (role === 'ke_toan') return [
      { label: 'Giá trị đơn hôm nay', value: money(stats.todayRevenue), icon: CircleDollarSign, tone: 'emerald' },
      { label: 'Đơn đang thực hiện', value: stats.inProgress, icon: Truck, tone: 'blue' },
      { label: 'Đã hoàn thành', value: stats.completed, icon: CheckCircle2, tone: 'violet' },
      { label: 'Khách đang hoạt động', value: stats.customers, icon: Users, tone: 'amber' },
    ];
    return [
      { label: 'Đơn hôm nay', value: stats.todayOrders, icon: ShoppingCart, tone: 'blue' },
      { label: 'Chờ xác nhận', value: stats.pending, icon: Clock3, tone: 'amber' },
      { label: 'Đang thực hiện', value: stats.inProgress, icon: Truck, tone: 'violet' },
      { label: role === 'sale' ? 'Khách đang hoạt động' : 'Giá trị hôm nay', value: role === 'sale' ? stats.customers : money(stats.todayRevenue), icon: role === 'sale' ? Users : CircleDollarSign, tone: 'emerald' },
    ];
  }, [role, stats]);

  const actions = useMemo(() => {
    const items = [
      can(role, 'orders.create') && { label: 'Tạo đơn mới', description: 'Lên đơn trực tiếp cho khách', path: '/tao-don-hang', icon: Plus, primary: true },
      can(role, 'orders.view') && { label: 'Quản lý đơn', description: 'Lọc và cập nhật trạng thái', path: '/don-hang', icon: ShoppingCart },
      can(role, 'pricing.edit') && { label: 'Áp giá hàng ngày', description: 'Cập nhật giá theo nhu cầu', path: '/ap-gia-hang-ngay', icon: Tags },
      can(role, 'procurement.view') && { label: 'Đơn tổng', description: 'Tổng hợp nhu cầu thu mua', path: '/don-tong', icon: Boxes },
      can(role, 'products.view') && { label: 'Hàng hóa', description: 'Danh mục, tồn kho và thông tin giá', path: '/hang-hoa', icon: Package },
      can(role, 'orders.packing') && { label: 'Xử lý đơn hàng', description: 'Soạn hàng và giao nhận', path: '/soan-hang', icon: PackageCheck },
      can(role, 'customers.view') && { label: 'Khách hàng', description: 'Hồ sơ và chính sách giá', path: '/khach-hang', icon: Users },
      can(role, 'finance.view') && { label: 'Công nợ', description: 'Theo dõi thu tiền khách hàng', path: '/cong-no', icon: CircleDollarSign },
      can(role, 'reports.view') && { label: 'Báo cáo', description: 'Chỉ số kinh doanh tổng hợp', path: '/bao-cao', icon: BarChart3 },
    ].filter(Boolean) as { label: string; description: string; path: string; icon: typeof ShoppingCart; primary?: boolean }[];

    const priority: Record<string, string[]> = {
      admin: ['/don-hang', '/tao-don-hang', '/bao-cao', '/khach-hang'],
      truong_phong: ['/don-hang', '/tao-don-hang', '/bao-cao', '/khach-hang'],
      sale: ['/tao-don-hang', '/don-hang', '/khach-hang', '/ap-gia-hang-ngay'],
      thu_mua: ['/don-tong', '/ap-gia-hang-ngay', '/hang-hoa', '/soan-hang'],
      kho: ['/soan-hang', '/don-tong', '/don-hang'],
      ke_toan: ['/cong-no', '/bao-cao', '/don-hang'],
    };
    const order = priority[role] || priority.sale;
    return items.sort((a, b) => {
      const ai = order.indexOf(a.path); const bi = order.indexOf(b.path);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    }).slice(0, 5);
  }, [role]);

  const toneClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700', emerald: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#075b3e] via-[#0f7651] to-[#16885e] p-5 sm:p-7 text-white shadow-lg shadow-emerald-900/10">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-extrabold tracking-[0.18em] text-emerald-100">{copy.eyebrow}</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="mt-2 max-w-xl text-sm sm:text-base text-emerald-50/90">{copy.description}</p>
            <p className="mt-4 text-sm font-semibold text-white/90">Xin chào {user?.name} · {ROLE_LABELS[role] || role}</p>
          </div>
          <button onClick={() => void loadDashboard()} disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/20 disabled:opacity-60">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Làm mới dữ liệu
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[card.tone]}`}><Icon size={20} /></div>
              <p className="text-xs sm:text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900">{loading ? '—' : card.value}</p>
            </article>
          );
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
            <div><p className="font-bold text-slate-900">Đơn hàng gần đây</p><p className="text-xs text-slate-500">Bấm vào đơn để xem và xử lý chi tiết</p></div>
            {can(role, 'orders.view') && <button onClick={() => navigate('/don-hang')} className="text-sm font-bold text-emerald-700 hover:text-emerald-800">Xem tất cả →</button>}
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
            ) : recentOrders.length === 0 ? (
              <div className="px-5 py-12 text-center"><ShoppingCart className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-semibold text-slate-600">Chưa có đơn hàng</p><p className="mt-1 text-sm text-slate-400">Hệ thống đã sẵn sàng nhận các đơn chính thức.</p></div>
            ) : recentOrders.map((order) => (
              <button key={order.id} onClick={() => navigate(`/don-hang/${order.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 sm:px-5">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-800">{order.order_code}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[order.status] || STATUS_COLORS.draft}`}>{STATUS_LABELS[order.status] || order.status}</span></div><p className="mt-1 truncate text-sm text-slate-500">{order.customer_name}{order.customer_company ? ` · ${order.customer_company}` : ''}</p><p className="mt-0.5 text-xs text-slate-400">{dateTime(order.created_at)}</p></div>
                <div className="text-right"><p className="font-extrabold text-slate-900">{money(order.grand_total)}</p><ArrowRight className="ml-auto mt-1 text-slate-300" size={16} /></div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="mb-4"><p className="font-bold text-slate-900">Thao tác theo vai trò</p><p className="text-xs text-slate-500">Các công việc thường dùng của {ROLE_LABELS[role] || role}</p></div>
          <div className="space-y-2.5">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return <button key={action.path} onClick={() => navigate(action.path)} className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${index === 0 ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/50'}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index === 0 ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700'}`}><Icon size={19} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">{action.label}</span><span className="block truncate text-xs text-slate-500">{action.description}</span></span><ArrowRight size={17} className="text-slate-300 group-hover:text-emerald-600" /></button>;
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
