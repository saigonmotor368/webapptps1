import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Wallet } from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }
function dt(v: string) { return v ? new Date(v).toLocaleDateString('vi-VN') : '—'; }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Đơn nháp', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận',
  preparing: 'Đang chuẩn bị', shipping: 'Đang giao', completed: 'Hoàn thành',
};

interface DebtCustomer {
  id: string; partner_code: string; name: string; company: string | null;
  discount_tier: string; credit_limit: number; currentDebt: number; openOrders: number;
  overLimit: boolean; usagePercent: number | null;
}

// Giai đoạn D — trang "Công nợ khách hàng" (mục 13.6): liệt kê khách còn nợ,
// so với hạn mức, bấm vào xem chi tiết các đơn còn nợ của khách đó.
export default function CongNoPage() {
  const { token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [customers, setCustomers] = useState<DebtCustomer[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const fetchDebt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/reports/debt`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) {
        setCustomers(data.customers || []);
        setTotalDebt(data.totalDebt || 0);
      }
    } finally { setLoading(false); }
  }, [apiBase, token]);

  useEffect(() => { fetchDebt(); }, [fetchDebt]);

  const toggleExpand = async (customerId: string) => {
    if (expandedId === customerId) { setExpandedId(null); return; }
    setExpandedId(customerId);
    setLoadingOrders(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/reports/debt?customerId=${customerId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setOrders(data.ok ? data.orders || [] : []);
    } finally { setLoadingOrders(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Công nợ khách hàng</h1>
          <p className="text-slate-500 text-sm">{customers.length} khách còn nợ</p>
        </div>
        <button onClick={fetchDebt} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 self-start" title="Tải lại">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
          <Wallet size={22} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Tổng công nợ đang mở</p>
          <p className="text-2xl font-bold text-red-600">{money(totalDebt)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải...
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400">Không có khách nào còn nợ</div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => {
            const isOpen = expandedId === c.id;
            return (
              <article key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <button onClick={() => toggleExpand(c.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800">{c.name} {c.company ? `· ${c.company}` : ''}</p>
                    <p className="text-xs text-slate-400">{c.partner_code} · {c.discount_tier} · {c.openOrders} đơn còn nợ</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold ${c.overLimit ? 'text-red-600' : 'text-slate-800'}`}>{money(c.currentDebt)}</p>
                    <p className="text-xs text-slate-400">
                      {c.credit_limit > 0 ? `Hạn mức ${money(c.credit_limit)} (${c.usagePercent}%)` : 'Không giới hạn'}
                    </p>
                  </div>
                  {c.overLimit && <AlertTriangle size={18} className="text-red-500 shrink-0" />}
                  {isOpen ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-50 p-4 bg-slate-50/50">
                    {loadingOrders ? (
                      <p className="text-sm text-slate-400 text-center py-4">Đang tải...</p>
                    ) : orders.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">Không có đơn nào</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 uppercase">
                            <th className="pb-2">Mã đơn</th>
                            <th className="pb-2">Trạng thái</th>
                            <th className="pb-2">Ngày tạo</th>
                            <th className="pb-2 text-right">Tổng đơn</th>
                            <th className="pb-2 text-right">Đã thu</th>
                            <th className="pb-2 text-right">Còn nợ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o) => (
                            <tr key={o.id} className="border-t border-slate-100">
                              <td className="py-2 font-medium text-slate-700">{o.order_code}</td>
                              <td className="py-2 text-slate-500">{STATUS_LABELS[o.status] || o.status}</td>
                              <td className="py-2 text-slate-500">{dt(o.created_at)}</td>
                              <td className="py-2 text-right text-slate-600">{money(o.grand_total)}</td>
                              <td className="py-2 text-right text-green-600">{money(o.paid_amount)}</td>
                              <td className="py-2 text-right font-semibold text-red-600">{money(o.debt_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
