import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, AlertCircle, CheckCircle2, Tag, ShoppingBag } from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yesterdayStr() {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ProductRow {
  productId: string; sku: string; name: string; unit: string;
  orderCount: number; lineCount: number; hasZeroPrice: boolean; currentPrice: number;
}
interface OrderRow {
  id: string; orderCode: string; customerName: string; itemCount: number; hasZeroPrice: boolean; total: number;
}

// "Áp giá hàng ngày" (mục brief 2026-09-11) — giải quyết bài toán hàng trăm
// đơn/ngày từ hàng trăm bếp có mặt hàng giá 0đ (thịt/hải sản tươi biến động
// giá mỗi ngày): nhập giá thị trường hôm nay 1 LẦN cho 1 mặt hàng, hệ thống
// tự lan ra mọi dòng hàng cùng SKU trong các đơn chờ xác nhận của đúng ngày
// đó, tự tính đúng giá theo hạng/hợp đồng từng khách — không phải mở tay
// từng đơn. Luồng: Áp giá xong (bước 1, dưới) -> rà soát -> Xác nhận hàng
// loạt (bước 2) -> đơn mới chuyển "Đã xác nhận" thật sự, sẵn sàng qua trang
// "Xử lý đơn hàng" để soạn.
export default function BulkPricingPage() {
  const { token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [date, setDate] = useState(todayStr());
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/orders/bulk-price?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setProducts(data.products || []);
        setOrders(data.orders || []);
        setSelectedOrders(new Set());
      }
    } catch (err) {
      console.error('Lỗi tải danh sách áp giá:', err);
    } finally { setLoading(false); }
  }, [apiBase, token, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyPrice = async (productId: string) => {
    const raw = priceDrafts[productId];
    const price = Number(raw);
    if (!raw || !Number.isFinite(price) || price < 0) { alert('Nhập giá hợp lệ'); return; }
    setApplyingId(productId);
    try {
      const res = await fetch(`${apiBase}/api/admin/orders/bulk-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, price, date }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      alert(`✅ Đã áp giá ${money(price)} cho ${data.affectedLines} dòng hàng trong ${data.affectedOrders} đơn`);
      await fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không áp giá được'));
    } finally { setApplyingId(null); }
  };

  const toggleOrder = (id: string) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const readyOrders = orders.filter((o) => !o.hasZeroPrice);
  const selectReady = () => setSelectedOrders(new Set(readyOrders.map((o) => o.id)));

  const bulkConfirm = async () => {
    if (selectedOrders.size === 0) return;
    if (!confirm(`Xác nhận hàng loạt ${selectedOrders.size} đơn đã chọn? Sau khi xác nhận sẽ khóa giá, không sửa lại tự do được nữa.`)) return;
    setConfirming(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/orders/bulk-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderIds: [...selectedOrders] }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      let msg = `✅ Đã xác nhận thành công ${data.succeeded.length} đơn`;
      if (data.skipped?.length) msg += `\n⚠️ Bỏ qua ${data.skipped.length} đơn:\n` + data.skipped.map((s: any) => `${s.orderCode}: ${s.reason}`).join('\n');
      alert(msg);
      await fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xác nhận được'));
    } finally { setConfirming(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Áp giá hàng ngày</h1>
          <p className="text-slate-500 text-sm">Nhập giá thị trường hôm nay 1 lần cho mỗi mặt hàng — tự áp cho mọi đơn đang chờ xác nhận, rồi xác nhận hàng loạt</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={() => setDate(todayStr())} className={`px-3 py-2 text-sm border rounded-lg ${date === todayStr() ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Hôm nay</button>
          <button onClick={() => setDate(yesterdayStr())} className={`px-3 py-2 text-sm border rounded-lg ${date === yesterdayStr() ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Hôm qua</button>
          <button onClick={fetchData} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" title="Tải lại">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800 text-sm">
        <AlertCircle className="shrink-0 mt-0.5" size={18} />
        <div>
          <strong className="block mb-1">Bước 1 — Áp giá:</strong> nhập giá hôm nay cho từng mặt hàng bên dưới (ưu tiên mặt hàng còn giá 0đ ở đầu danh sách) — hệ thống tự áp cho mọi đơn chờ xác nhận trong ngày, khách có giá hợp đồng riêng thì <b>giữ nguyên</b> giá hợp đồng, không bị ghi đè.
          <br /><strong className="block mt-1 mb-1">Bước 2 — Xác nhận hàng loạt:</strong> khi đơn không còn mặt hàng nào giá 0đ, chọn ở bảng dưới rồi bấm "Xác nhận hàng loạt" để chốt giá thật sự (khóa lại, sinh phiếu xác nhận) — trước đó tổng tiền vẫn chỉ là tạm tính.
        </div>
      </div>

      {/* Bước 1: bảng mặt hàng cần áp giá */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Tag size={18} className="text-green-600" />
          <h2 className="font-bold text-slate-800">Mặt hàng trong đơn chờ xác nhận ({new Date(date + 'T00:00:00').toLocaleDateString('vi-VN')})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Mặt hàng</th>
                <th className="px-4 py-3 text-center">Số đơn</th>
                <th className="px-4 py-3 text-center">Số dòng</th>
                <th className="px-4 py-3 text-right">Giá hiện tại</th>
                <th className="px-4 py-3 text-right">Giá hôm nay</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Đang tải...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Không có mặt hàng nào trong đơn chờ xác nhận ngày này</td></tr>
              ) : products.map((p) => (
                <tr key={p.productId} className={p.hasZeroPrice ? 'bg-red-50/40' : ''}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.sku} · {p.unit}{p.hasZeroPrice && <span className="text-red-500 font-semibold"> · Đang 0đ</span>}</p>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{p.orderCount}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{p.lineCount}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{money(p.currentPrice)}</td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" min="0" step="1000" value={priceDrafts[p.productId] ?? ''}
                      onChange={(e) => setPriceDrafts((d) => ({ ...d, [p.productId]: e.target.value }))}
                      placeholder="Nhập giá..."
                      className="w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right" />
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => applyPrice(p.productId)} disabled={applyingId === p.productId}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                      {applyingId === p.productId ? 'Đang áp...' : 'Áp dụng'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bước 2: bảng đơn + xác nhận hàng loạt */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-green-600" />
            <h2 className="font-bold text-slate-800">Đơn chờ xác nhận ({orders.length})</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={selectReady} disabled={readyOrders.length === 0}
              className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50">
              Chọn tất cả đã đủ giá ({readyOrders.length})
            </button>
            <button onClick={bulkConfirm} disabled={selectedOrders.size === 0 || confirming}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
              <CheckCircle2 size={15} /> {confirming ? 'Đang xác nhận...' : `Xác nhận hàng loạt (${selectedOrders.size})`}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3">Mã đơn</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3 text-center">Số SP</th>
                <th className="px-4 py-3 text-right">Tạm tính</th>
                <th className="px-4 py-3 text-center">Trạng thái giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Không có đơn nào chờ xác nhận ngày này</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} onClick={() => !o.hasZeroPrice && toggleOrder(o.id)}
                  className={`${o.hasZeroPrice ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50'} ${selectedOrders.has(o.id) ? 'bg-green-50/40' : ''}`}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedOrders.has(o.id)} disabled={o.hasZeroPrice} onChange={() => toggleOrder(o.id)} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{o.orderCode}</td>
                  <td className="px-4 py-3 text-slate-600">{o.customerName}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{o.itemCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{money(o.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${o.hasZeroPrice ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {o.hasZeroPrice ? 'Còn giá 0đ' : 'Đã đủ giá'}
                    </span>
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
