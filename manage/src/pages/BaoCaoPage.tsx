import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, TrendingUp, ShoppingCart, Wallet, Clock3, FileSpreadsheet } from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TABS = [
  { key: '', label: 'Tổng quan' },
  { key: 'customer', label: 'Theo khách hàng' },
  { key: 'product', label: 'Theo sản phẩm' },
  { key: 'sale', label: 'Theo sale' },
];

// Giai đoạn D — báo cáo cuối ngày + theo khách/sản phẩm/sale (mục 13.6).
// Mặc định xem hôm nay, chọn lại khoảng ngày tùy ý.
export default function BaoCaoPage() {
  const { token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(addDays(todayStr(), 1));
  const [tab, setTab] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (tab) params.set('groupBy', tab);
      const res = await fetch(`${apiBase}/api/admin/reports/summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setSummary(data.summary);
        setRows(data.rows || []);
      }
    } finally { setLoading(false); }
  }, [apiBase, token, from, to, tab]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const setQuickRange = (days: number) => {
    const t = todayStr();
    setFrom(addDays(t, -days + 1));
    setTo(addDays(t, 1));
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/reports/export?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Không xuất được báo cáo');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `bao-cao-ban-hang_${from}_${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xuất được báo cáo'));
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Báo cáo</h1>
          <p className="text-slate-500 text-sm">Doanh thu &amp; hoạt động bán hàng theo khoảng thời gian</p>
        </div>
        <div className="flex gap-2 self-start">
          <button onClick={exportExcel} disabled={exporting}
            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
            <FileSpreadsheet size={16} /> {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          <button onClick={fetchReport} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" title="Tải lại">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <span className="text-slate-400 text-sm">đến</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <button onClick={() => setQuickRange(1)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Hôm nay</button>
        <button onClick={() => setQuickRange(7)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">7 ngày</button>
        <button onClick={() => setQuickRange(30)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">30 ngày</button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mb-3"><TrendingUp size={20} /></div>
            <p className="text-2xl font-bold text-slate-800">{money(summary.totalRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1">Doanh thu</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><ShoppingCart size={20} /></div>
            <p className="text-2xl font-bold text-slate-800">{summary.orderCount}</p>
            <p className="text-xs text-slate-500 mt-1">Số đơn xác nhận</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3"><Wallet size={20} /></div>
            <p className="text-2xl font-bold text-slate-800">{money(summary.codCollected)}</p>
            <p className="text-xs text-slate-500 mt-1">COD đã thu</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-3"><Clock3 size={20} /></div>
            <p className="text-2xl font-bold text-red-600">{money(summary.debtOutstanding)}</p>
            <p className="text-xs text-slate-500 mt-1">Công nợ còn lại (đơn trong khoảng này)</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải...
        </div>
      ) : tab === '' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-600 mb-3">Số đơn theo trạng thái</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary && Object.entries(summary.byStatus).map(([status, count]) => (
              <div key={status} className="p-3 bg-slate-50 rounded-xl text-center">
                <p className="text-xl font-bold text-slate-800">{count as number}</p>
                <p className="text-xs text-slate-500 capitalize">{status}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-slate-400">Không có dữ liệu trong khoảng này</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">{tab === 'product' ? 'Sản phẩm' : tab === 'sale' ? 'Nhân viên' : 'Khách hàng'}</th>
                  {tab === 'product' && <th className="px-4 py-3 text-right">Số lượng</th>}
                  {tab !== 'product' && <th className="px-4 py-3 text-right">Số đơn</th>}
                  <th className="px-4 py-3 text-right">Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {tab === 'product' ? `${r.name} (${r.unit})` : r.name}
                      {r.company && <span className="text-slate-400 font-normal"> · {r.company}</span>}
                    </td>
                    {tab === 'product' ? (
                      <td className="px-4 py-3 text-right text-slate-600">{r.quantity}</td>
                    ) : (
                      <td className="px-4 py-3 text-right text-slate-600">{r.orderCount}</td>
                    )}
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{money(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
