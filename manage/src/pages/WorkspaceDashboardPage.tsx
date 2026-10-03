import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays,
  CircleDollarSign, Clock3, RefreshCw, ShoppingCart, TrendingUp, Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../lib/permissions';
import { getApiBase } from '../lib/apiBase';

type TrendPoint = { date: string; orders: number; revenue: number };
type DashboardData = {
  generatedAt: string;
  scope: 'sale' | 'all';
  summary: {
    todayOrders: number; monthOrders: number; monthRevenue: number; previousMonthRevenue: number;
    revenueGrowth: number | null; debtOutstanding: number; activeCustomers: number;
    pendingOrders: number; inProgressOrders: number;
  };
  dailyTrend: TrendPoint[];
  byStatus: Record<string, number>;
  topCustomers: Array<{ name: string; company: string; orders: number; revenue: number }>;
  attentionOrders: Array<{ id: string; order_code: string; status: string; customer_name: string; customer_company?: string; grand_total: number; delivery_date?: string; overdue: boolean }>;
  recentOrders: Array<{ id: string; order_code: string; status: string; customer_name: string; customer_company?: string; grand_total: number; delivery_date?: string; created_at: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Đơn nháp', pending: 'Chờ tiếp nhận', confirmed: 'Đã xác nhận',
  preparing: 'Đang soạn', shipping: 'Đang giao', completed: 'Hoàn thành', canceled: 'Đã hủy',
};
const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', confirmed: '#3b82f6', preparing: '#8b5cf6', shipping: '#0ea5e9', completed: '#10b981',
};
const money = (value: number | string) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))}đ`;
const compactMoney = (value: number) => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString('vi-VN')}k`;
  return value.toLocaleString('vi-VN');
};
const shortDate = (value: string) => { const [, month, day] = value.split('-'); return `${day}/${month}`; };

function RevenueChart({ data }: { data: TrendPoint[] }) {
  const maxRevenue = Math.max(...data.map((point) => point.revenue), 1);
  const width = 760, height = 230, left = 52, right = 18, top = 18, bottom = 42;
  const chartHeight = height - top - bottom, chartWidth = width - left - right;
  const x = (index: number) => left + (data.length <= 1 ? 0 : (index * chartWidth) / (data.length - 1));
  const y = (value: number) => top + chartHeight - (value / maxRevenue) * chartHeight;
  const points = data.map((point, index) => `${x(index)},${y(point.revenue)}`).join(' ');
  const area = data.length ? `M ${left} ${top + chartHeight} L ${points.replaceAll(',', ' ')} L ${left + chartWidth} ${top + chartHeight} Z` : '';
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full" role="img" aria-label="Biểu đồ doanh thu 14 ngày">
        <defs><linearGradient id="dashboardRevenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#059669" stopOpacity="0.24" /><stop offset="100%" stopColor="#059669" stopOpacity="0.02" /></linearGradient></defs>
        {[0, 0.5, 1].map((ratio) => { const lineY = top + chartHeight * ratio; const value = maxRevenue * (1 - ratio); return <g key={ratio}><line x1={left} x2={left + chartWidth} y1={lineY} y2={lineY} stroke="#e2e8f0" strokeDasharray="4 5" /><text x={left - 8} y={lineY + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{compactMoney(value)}</text></g>; })}
        {area && <path d={area} fill="url(#dashboardRevenueFill)" />}
        <polyline points={points} fill="none" stroke="#047857" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((point, index) => <g key={point.date}><circle cx={x(index)} cy={y(point.revenue)} r="4" fill="#fff" stroke="#047857" strokeWidth="2" /><text x={x(index)} y={height - 15} textAnchor="middle" fontSize="10" fill="#64748b">{shortDate(point.date)}</text>{point.orders > 0 && <text x={x(index)} y={Math.max(12, y(point.revenue) - 9)} textAnchor="middle" fontSize="10" fontWeight="700" fill="#334155">{point.orders} đơn</text>}</g>)}
      </svg>
    </div>
  );
}

export default function WorkspaceDashboardPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const apiBase = getApiBase();
  const role = user?.role || 'sale';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`${apiBase}/api/admin/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Không tải được dữ liệu Dashboard');
      setData(payload);
    } catch (err: any) { setError(err?.message || 'Không tải được dữ liệu Dashboard'); }
    finally { setLoading(false); }
  }, [apiBase, token]);
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const summary = data?.summary;
  const metrics = useMemo(() => [
    { label: 'Doanh thu tháng này', value: money(summary?.monthRevenue || 0), icon: TrendingUp, tone: 'emerald', detail: summary?.revenueGrowth == null ? 'Chưa có dữ liệu cùng kỳ' : `${summary.revenueGrowth >= 0 ? '+' : ''}${summary.revenueGrowth.toFixed(1)}% so với cùng kỳ tháng trước`, trend: summary?.revenueGrowth },
    { label: 'Đơn tháng này', value: new Intl.NumberFormat('vi-VN').format(summary?.monthOrders || 0), icon: ShoppingCart, tone: 'blue', detail: `${summary?.todayOrders || 0} đơn phát sinh hôm nay`, path: '/don-hang' },
    { label: 'Chờ tiếp nhận', value: new Intl.NumberFormat('vi-VN').format(summary?.pendingOrders || 0), icon: Clock3, tone: 'amber', detail: `${summary?.inProgressOrders || 0} đơn đang được thực hiện`, path: '/don-hang?status=pending' },
    { label: 'Công nợ phải thu', value: money(summary?.debtOutstanding || 0), icon: CircleDollarSign, tone: 'rose', detail: `${summary?.activeCustomers || 0} khách hàng đang hoạt động`, path: '/cong-no' },
  ], [summary]);
  const totalStatus = Object.values(data?.byStatus || {}).reduce((sum, value) => sum + value, 0) || 1;
  const maxCustomerRevenue = Math.max(...(data?.topCustomers || []).map((customer) => customer.revenue), 1);
  const displayedOrders = (data?.attentionOrders?.length ? data.attentionOrders : data?.recentOrders || []).slice(0, 8);

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-xs sm:px-6">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight text-slate-900">Tổng quan điều hành</h1><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">{ROLE_LABELS[role] || role}</span></div><p className="mt-1 text-sm text-slate-500">Xin chào, <b className="text-slate-700">{user?.name || 'Bạn'}</b> · Số liệu {data?.scope === 'sale' ? 'khách hàng bạn phụ trách' : 'toàn hệ thống'}</p></div>
          <div className="flex items-center gap-3"><span className="hidden items-center gap-1.5 text-xs text-slate-400 md:flex"><CalendarDays size={14} /> Cập nhật {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span><button onClick={() => void loadDashboard()} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Làm mới</button></div>
        </div>
      </header>

      {error && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span><button onClick={() => void loadDashboard()} className="font-bold underline">Thử lại</button></div>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => { const Icon = metric.icon; const styles: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-700', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700' }; return (
          <article key={metric.label} onClick={() => metric.path && navigate(metric.path)} className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-xs ${metric.path ? 'cursor-pointer hover:border-emerald-300 hover:shadow-md' : ''} transition-all`}>
            <div className="flex items-center justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles[metric.tone]}`}><Icon size={20} /></span>{metric.trend != null && <span className={`flex items-center gap-1 text-xs font-bold ${metric.trend >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{metric.trend >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{Math.abs(metric.trend).toFixed(1)}%</span>}</div>
            <p className="mt-4 text-xs font-semibold text-slate-500">{metric.label}</p><p className="mt-1 text-2xl font-black tracking-tight text-slate-900">{loading ? '—' : metric.value}</p><p className="mt-2 text-[11px] text-slate-400">{metric.detail}</p>
          </article>
        ); })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="flex items-center gap-2 font-bold text-slate-900"><BarChart3 size={18} className="text-emerald-700" /> Xu hướng doanh thu 14 ngày</h2><p className="mt-0.5 text-xs text-slate-400">Tính theo thời điểm đơn được xác nhận</p></div><span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{summary?.monthOrders || 0} đơn trong tháng</span></div><div className="p-3 sm:p-5">{loading ? <div className="h-56 animate-pulse rounded-xl bg-slate-100" /> : <RevenueChart data={data?.dailyTrend || []} />}</div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div><h2 className="font-bold text-slate-900">Tiến độ xử lý đơn</h2><p className="mt-0.5 text-xs text-slate-400">Đơn đang xử lý và hoàn thành trong tháng</p></div><div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100">{Object.entries(data?.byStatus || {}).map(([status, count]) => <span key={status} style={{ width: `${(count / totalStatus) * 100}%`, backgroundColor: STATUS_COLORS[status] || '#94a3b8' }} />)}</div><div className="mt-5 space-y-3">{['pending', 'confirmed', 'preparing', 'shipping', 'completed'].map((status) => <div key={status} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />{STATUS_LABELS[status]}</span><span className="font-black text-slate-800">{loading ? '—' : data?.byStatus?.[status] || 0}</span></div>)}</div></article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="flex items-center gap-2 font-bold text-slate-900"><AlertTriangle size={17} className="text-amber-500" /> Đơn cần chú ý</h2><p className="mt-0.5 text-xs text-slate-400">Ưu tiên đơn quá ngày giao và đơn chưa được tiếp nhận</p></div><button onClick={() => navigate('/don-hang')} className="text-xs font-bold text-emerald-700 hover:underline">Xem tất cả</button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-[11px] uppercase text-slate-400"><tr><th className="px-5 py-3">Mã đơn</th><th className="px-3 py-3">Khách hàng</th><th className="px-3 py-3">Ngày giao</th><th className="px-3 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Giá trị</th></tr></thead><tbody className="divide-y divide-slate-100">
          {!loading && displayedOrders.map((order: any) => <tr key={order.id} onClick={() => navigate(`/don-hang/${order.id}`)} className="cursor-pointer hover:bg-slate-50"><td className="px-5 py-3 font-bold text-slate-800">{order.order_code}</td><td className="max-w-[230px] truncate px-3 py-3 text-slate-600">{order.customer_name}{order.customer_company ? ` · ${order.customer_company}` : ''}</td><td className={`px-3 py-3 ${order.overdue ? 'font-bold text-red-600' : 'text-slate-500'}`}>{order.delivery_date || 'Chưa đặt'}{order.overdue ? ' · Quá ngày' : ''}</td><td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">{STATUS_LABELS[order.status] || order.status}</span></td><td className="px-5 py-3 text-right font-bold text-slate-800">{money(order.grand_total)}</td></tr>)}
          {loading && <tr><td colSpan={5} className="p-5"><div className="h-32 animate-pulse rounded-xl bg-slate-100" /></td></tr>}{!loading && displayedOrders.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Không có đơn cần chú ý.</td></tr>}
        </tbody></table></div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div><h2 className="flex items-center gap-2 font-bold text-slate-900"><Users size={17} className="text-blue-600" /> Khách hàng nổi bật</h2><p className="mt-0.5 text-xs text-slate-400">Theo doanh thu tháng này</p></div><div className="mt-5 space-y-4">{(data?.topCustomers || []).map((customer, index) => <div key={`${customer.name}-${index}`}><div className="flex items-start justify-between gap-3 text-xs"><div className="min-w-0"><p className="truncate font-bold text-slate-800">{index + 1}. {customer.company || customer.name}</p><p className="text-[11px] text-slate-400">{customer.orders} đơn</p></div><b className="shrink-0 text-slate-700">{money(customer.revenue)}</b></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(4, (customer.revenue / maxCustomerRevenue) * 100)}%` }} /></div></div>)}{!loading && (data?.topCustomers || []).length === 0 && <p className="py-10 text-center text-xs text-slate-400">Chưa có doanh thu trong tháng.</p>}{loading && <div className="h-48 animate-pulse rounded-xl bg-slate-100" />}</div></article>
      </section>
    </div>
  );
}
