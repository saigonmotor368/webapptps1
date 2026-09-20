import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp, BarChart3, ListChecks, FileSpreadsheet, UserCheck, CheckCircle2, Undo2, PackageCheck } from 'lucide-react';

// LƯU Ý (Giai đoạn C, 2026-09-10): trang này trước đây chỉ gom từ bảng
// "quotes" (status='won') — bỏ sót toàn bộ đơn tạo qua orders/order_items
// (POS, khách tự đặt qua Mini App). Theo đúng kế hoạch mục 13.5: đọc từ
// orders/order_items với status đã xác nhận trở lên (confirmed/preparing/
// shipping — completed thì đã giao xong, không cần soạn nữa).
const PACKING_STATUSES = ['confirmed', 'preparing', 'shipping'];

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

export default function SoanHangPage() {
  const [mode, setMode] = useState<'pack' | 'report'>('pack');

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Xử lý đơn hàng</h1>
          <p className="text-slate-500 text-sm">Nhận soạn các đơn đã xác nhận nhưng chưa soạn, hoặc xem báo cáo đã bán theo khoảng thời gian</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm self-start">
          <button onClick={() => setMode('pack')} className={`px-4 py-2 flex items-center gap-1.5 ${mode === 'pack' ? 'bg-green-600 text-white' : 'bg-white text-slate-600'}`}>
            <ListChecks size={15} /> Xử lý đơn hàng
          </button>
          <button onClick={() => setMode('report')} className={`px-4 py-2 flex items-center gap-1.5 border-l border-slate-200 ${mode === 'report' ? 'bg-green-600 text-white' : 'bg-white text-slate-600'}`}>
            <BarChart3 size={15} /> Báo cáo đã bán
          </button>
        </div>
      </header>

      {mode === 'pack' ? <OrderPackingWorkflow /> : <SalesReport />}
    </div>
  );
}

type PackingFilter = 'active' | 'not_started' | 'in_progress' | 'done';
const PACKING_LABELS: Record<string, string> = { not_started: 'Chưa soạn', in_progress: 'Đang soạn', done: 'Đã soạn' };
const PACKING_COLORS: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
};
const OVERRIDE_ROLES = new Set(['admin', 'truong_phong']);

interface PackingOrder {
  id: string;
  order_code: string;
  customer_name: string;
  customer_company?: string | null;
  status: string;
  confirmed_at: string;
  item_count: number;
  packing_status: string;
  packed_by: string | null;
  packed_by_name?: string | null;
}

// Xử lý đơn hàng (soạn hàng) — đổi hẳn từ "xem tổng hợp thụ động" sang luồng
// nhận-soạn-xuất file rõ ràng theo yêu cầu 2026-09-11: chọn đơn "chưa soạn",
// bấm nhận soạn -> khóa đơn đó lại cho đúng người đang soạn (packed_by) +
// xuất ngay 1 file Excel (1 sheet tổng hợp + 1 sheet riêng mỗi đơn), tránh
// tình trạng 2 người cùng soạn 1 đơn hoặc không rõ ai đang phụ trách đơn nào.
function OrderPackingWorkflow() {
  const { user, token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [orders, setOrders] = useState<PackingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PackingFilter>('active');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const canOverride = user?.role ? OVERRIDE_ROLES.has(user.role) : false;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select('id, order_code, customer_name, customer_company, status, confirmed_at, item_count, packing_status, packed_by, delivery_date')
        .in('status', PACKING_STATUSES)
        .order('confirmed_at', { ascending: true });
      if (deliveryDate) query = query.eq('delivery_date', deliveryDate);
      if (filter === 'active') query = query.in('packing_status', ['not_started', 'in_progress']);
      else query = query.eq('packing_status', filter);

      const { data, error } = await query;
      if (error) throw error;

      const packerIds = [...new Set((data || []).map((o) => o.packed_by).filter(Boolean))] as string[];
      const { data: packers } = packerIds.length
        ? await supabase.from('admin_profiles').select('id, name').in('id', packerIds)
        : { data: [] as { id: string; name: string }[] };
      const packerMap = new Map((packers || []).map((p) => [p.id, p.name]));

      setOrders((data || []).map((o) => ({ ...o, packed_by_name: o.packed_by ? packerMap.get(o.packed_by) || null : null })));
      setSelected(new Set());
    } catch (err) {
      console.error('Lỗi tải danh sách đơn cần soạn:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, deliveryDate]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.id)));
  };

  const downloadPackingFile = async (orderIds: string[]) => {
    const res = await fetch(`${apiBase}/api/admin/reports/packing-list/export?orderIds=${orderIds.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Không xuất được file soạn hàng');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `soan-hang_${orderIds.length}-don_${todayStr()}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const runPackingAction = async (action: 'claim' | 'complete' | 'release', andExport = false) => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const orderIds = [...selected];
      const res = await fetch(`${apiBase}/api/admin/orders/packing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds, action }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const updatedIds = orderIds.filter((id) => !(data.skipped || []).some((s: any) => orders.find((o) => o.id === id)?.order_code === s.orderCode));
      if (andExport && updatedIds.length) {
        await downloadPackingFile(updatedIds);
      }
      if ((data.skipped || []).length) {
        alert(`⚠️ ${data.updated} đơn cập nhật thành công. ${data.skipped.length} đơn bị bỏ qua:\n` +
          data.skipped.map((s: any) => `${s.orderCode}: ${s.reason}`).join('\n'));
      } else if (!andExport) {
        alert(`✅ Đã cập nhật ${data.updated} đơn`);
      }
      await fetchOrders();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thực hiện được thao tác'));
    } finally { setBusy(false); }
  };

  const reExport = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await downloadPackingFile([...selected]);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xuất được file'));
    } finally { setBusy(false); }
  };

  const selectableNotStarted = orders.filter((o) => selected.has(o.id) && o.packing_status === 'not_started');
  const selectableMine = orders.filter((o) => selected.has(o.id) && o.packing_status === 'in_progress' && (o.packed_by === user?.id || canOverride));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3 items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {([
              ['active', 'Cần xử lý'],
              ['not_started', 'Chưa soạn'],
              ['in_progress', 'Đang soạn'],
              ['done', 'Đã soạn'],
            ] as [PackingFilter, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`px-3 py-2 border-l border-slate-200 first:border-l-0 ${filter === v ? 'bg-slate-800 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 text-sm">
            <span className="text-xs font-semibold text-slate-500">Ngày giao:</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
            {deliveryDate && (
              <button
                type="button"
                onClick={() => setDeliveryDate('')}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Tất cả ngày
              </button>
            )}
          </div>
        </div>

        <button onClick={fetchOrders} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" title="Tải lại">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800 text-sm">
        <AlertCircle className="shrink-0 mt-0.5" size={18} />
        <div>
          <strong className="block mb-1">Luồng xử lý đơn hàng:</strong>
          Chọn các đơn <b>"Chưa soạn"</b> rồi bấm <b>"Nhận soạn &amp; xuất file"</b> — hệ thống sẽ gán bạn là người soạn các đơn đó (người khác sẽ thấy "Đang soạn" và không nhận trùng được) và tải ngay 1 file Excel gồm bảng tổng hợp + từng sheet riêng cho mỗi đơn. Soạn xong thực tế thì quay lại đây chọn đúng các đơn đó và bấm <b>"Đánh dấu đã soạn xong"</b>.
          {canOverride && ' Vai trò của bạn có thể "Hủy nhận" đơn của người khác nếu cần đổi người soạn.'}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-3 sticky top-2 z-10 shadow-sm">
          <span className="text-sm text-slate-600 font-medium">{selected.size} đơn đã chọn</span>
          {selectableNotStarted.length > 0 && (
            <button onClick={() => runPackingAction('claim', true)} disabled={busy}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
              <UserCheck size={15} /> Nhận soạn & xuất file ({selectableNotStarted.length})
            </button>
          )}
          {selectableMine.length > 0 && (
            <>
              <button onClick={() => runPackingAction('complete')} disabled={busy}
                className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50 flex items-center gap-1.5">
                <CheckCircle2 size={15} /> Đánh dấu đã soạn xong ({selectableMine.length})
              </button>
              <button onClick={() => runPackingAction('release')} disabled={busy}
                className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
                <Undo2 size={15} /> Hủy nhận (trả đơn)
              </button>
              <button onClick={reExport} disabled={busy}
                className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
                <FileSpreadsheet size={15} /> Xuất lại file
              </button>
            </>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12 text-slate-500">Đang tải dữ liệu...</div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-10"><input type="checkbox" checked={orders.length > 0 && selected.size === orders.length} onChange={toggleSelectAll} /></th>
                  <th className="px-4 py-3">Mã đơn</th>
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3 text-center">Số SP</th>
                  <th className="px-4 py-3">Xác nhận lúc</th>
                  <th className="px-4 py-3">Trạng thái soạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => toggleSelect(o.id)} className={`cursor-pointer hover:bg-slate-50 transition-colors ${selected.has(o.id) ? 'bg-green-50/40' : ''}`}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 flex items-center gap-1.5">
                      <PackageCheck size={14} className="text-green-600" /> {o.order_code}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800">{o.customer_name}</p>
                      {o.customer_company && <p className="text-xs text-slate-400">{o.customer_company}</p>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{o.item_count}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(o.confirmed_at).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PACKING_COLORS[o.packing_status]}`}>
                        {PACKING_LABELS[o.packing_status]}{o.packed_by_name ? ` — ${o.packed_by_name}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                      Không có đơn nào ở trạng thái này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type RangePreset = 'day' | 'month' | 'year' | 'custom';

// Khối "Báo cáo đã bán" (yêu cầu 2026-09-10): chọn khoảng ngày/tháng/năm,
// xem theo nhóm hàng -> mặt hàng -> bán cho ai/đơn nào, phục vụ thu mua điều
// chỉnh nhập hàng. Khác PackingList ở chỗ tính CẢ đơn đã hoàn thành (không
// chỉ đơn đang chờ soạn), vì đây là báo cáo lịch sử chứ không phải việc cần
// làm ngay hôm nay.
function SalesReport() {
  const { token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [preset, setPreset] = useState<RangePreset>('day');
  const [anchor, setAnchor] = useState(todayStr()); // ngày mốc để suy ra khoảng theo preset
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const computeRange = useCallback((): [string, string] => {
    if (preset === 'custom') return [customFrom, `${customTo}T23:59:59.999`];
    const a = new Date(anchor + 'T00:00:00');
    if (preset === 'day') {
      const to = new Date(a); to.setDate(to.getDate() + 1);
      return [fmt(a), fmt(to)];
    }
    if (preset === 'month') {
      const from = new Date(a.getFullYear(), a.getMonth(), 1);
      const to = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      return [fmt(from), fmt(to)];
    }
    // year
    const from = new Date(a.getFullYear(), 0, 1);
    const to = new Date(a.getFullYear() + 1, 0, 1);
    return [fmt(from), fmt(to)];
  }, [preset, anchor, customFrom, customTo]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const [from, to] = computeRange();
      const res = await fetch(`${apiBase}/api/admin/reports/sales-detail?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setReport(data);
    } finally { setLoading(false); }
  }, [apiBase, token, computeRange]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const [from, to] = computeRange();
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/reports/sales-detail/export?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Không xuất được báo cáo');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `bao-cao-ban-hang-chi-tiet_${from}_${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xuất được báo cáo'));
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {(['day', 'month', 'year', 'custom'] as RangePreset[]).map((p) => (
            <button key={p} onClick={() => setPreset(p)}
              className={`px-3 py-2 border-l border-slate-200 first:border-l-0 ${preset === p ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
              {p === 'day' ? 'Theo ngày' : p === 'month' ? 'Theo tháng' : p === 'year' ? 'Theo năm' : 'Tùy chỉnh'}
            </button>
          ))}
        </div>
        {preset !== 'custom' ? (
          <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        ) : (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <span className="text-slate-400 text-sm">đến</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </>
        )}
        <button onClick={exportExcel} disabled={exporting}
          className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
          <FileSpreadsheet size={16} /> {exporting ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
        <button onClick={fetchReport} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" title="Tải lại">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
        <span className="text-xs text-slate-400">
          {new Date(from).toLocaleDateString('vi-VN')} – {new Date(to.replace('T23:59:59.999', '')).toLocaleDateString('vi-VN')}
        </span>
      </div>

      {report && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xl font-bold text-slate-800">{money(report.totalRevenue)}</p>
            <p className="text-xs text-slate-500">Doanh thu</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xl font-bold text-slate-800">{report.totalQuantity}</p>
            <p className="text-xs text-slate-500">Tổng số lượng bán</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-xl font-bold text-slate-800">{report.orderCount}</p>
            <p className="text-xs text-slate-500">Số đơn</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải...
        </div>
      ) : !report || report.categories.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400">Không có dữ liệu trong khoảng này</div>
      ) : (
        <div className="space-y-2">
          {report.categories.map((cat: any) => {
            const catOpen = expandedCategory === cat.category;
            return (
              <article key={cat.category} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <button onClick={() => setExpandedCategory(catOpen ? null : cat.category)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50">
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{cat.category}</p>
                    <p className="text-xs text-slate-400">{cat.products.length} mặt hàng</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-700">{money(cat.revenue)}</p>
                    <p className="text-xs text-slate-400">{cat.quantity} đơn vị</p>
                  </div>
                  {catOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </button>

                {catOpen && (
                  <div className="border-t border-slate-50 divide-y divide-slate-50">
                    {cat.products.map((p: any) => {
                      const key = `${cat.category}__${p.name}`;
                      const prodOpen = expandedProduct === key;
                      return (
                        <div key={key}>
                          <button onClick={() => setExpandedProduct(prodOpen ? null : key)}
                            className="w-full flex items-center gap-3 px-4 py-3 pl-8 text-left hover:bg-slate-50/50">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-700">{p.name}</p>
                              <p className="text-xs text-slate-400">{p.orders.length} lượt bán</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-700">{money(p.revenue)}</p>
                              <p className="text-xs text-slate-400">{p.quantity} {p.unit}</p>
                            </div>
                            {prodOpen ? <ChevronUp size={15} className="text-slate-300" /> : <ChevronDown size={15} className="text-slate-300" />}
                          </button>
                          {prodOpen && (
                            <div className="pl-12 pr-4 pb-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-slate-400 uppercase">
                                    <th className="pb-1">Đơn hàng</th>
                                    <th className="pb-1">Khách hàng</th>
                                    <th className="pb-1 text-right">Số lượng</th>
                                    <th className="pb-1 text-right">Thành tiền</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.orders.map((o: any, i: number) => (
                                    <tr key={i} className="border-t border-slate-50">
                                      <td className="py-1.5 font-medium text-slate-600">{o.orderCode}</td>
                                      <td className="py-1.5 text-slate-500">{o.customerName}{o.customerCompany ? ` (${o.customerCompany})` : ''}</td>
                                      <td className="py-1.5 text-right text-slate-600">{o.quantity} {p.unit}</td>
                                      <td className="py-1.5 text-right text-slate-600">{money(o.revenue)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
