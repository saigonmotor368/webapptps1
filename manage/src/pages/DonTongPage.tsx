import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  FileSpreadsheet, Download, RefreshCw, Calendar, AlertTriangle, CheckCircle2,
  Clock, ChevronDown, ChevronRight, Copy, Check, Package, Eye
} from 'lucide-react';

interface CustomerLine {
  orderCode: string;
  externalRef?: string | null;
  customerName: string;
  quantity: number;
  orderedQuantity: number;
  note: string;
}

interface ProductAggLine {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  totalQty: number; // SL cuối cùng
  orderedQty: number; // SL khách đặt ban đầu
  orderCount: number;
  customerCount: number;
  stockQty: number | null;
  shortfall: number;
  notes: Array<{ customer: string; note: string }>;
  customerLines: CustomerLine[];
}

interface CategoryGroup {
  category: string;
  itemCount: number;
  totalQty: number;
  orderedQty: number;
  lines: ProductAggLine[];
}

interface OrderSummary {
  orderId: string;
  orderCode: string;
  externalRef?: string | null;
  customerName: string;
  customerCode: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  status: string;
  isLate: boolean;
  lineCount: number;
  note: string;
}

interface ChecksumInfo {
  orderCount: number;
  lineItemCount: number;
  sumQtyByLines: number;
  sumQtyByProducts: number;
  isMatching: boolean;
}

interface ChangedOrder {
  orderId: string;
  orderCode: string;
  customerName: string;
  updatedAt: string;
  kind?: 'canceled' | 'edited' | 'change_requested';
}

function formatQty(v: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number(v) || 0);
}

function formatTime(isoStr?: string | null) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ngày ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function DonTongPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  // 1. Bộ lọc ngày giao và phạm vi
  const [deliveryDate, setDeliveryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [includePending, setIncludePending] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'triage'>('summary');

  // 2. Dữ liệu từ API
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [checksum, setChecksum] = useState<ChecksumInfo | null>(null);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [changedSinceLastExport, setChangedSinceLastExport] = useState<ChangedOrder[]>([]);

  // 3. Quản lý mở/đóng danh mục & dòng mặt hàng
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // 4. Hàng đợi cần xử lý (triage) & bulk-confirm
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [copiedZalo, setCopiedZalo] = useState(false);
  const [copiedChanges, setCopiedChanges] = useState(false);

  // Tải dữ liệu tổng hợp
  const fetchSummary = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const params = new URLSearchParams();
      if (deliveryDate) params.set('date', deliveryDate);
      params.set('includePending', includePending ? '1' : '0');

      const res = await fetch(`${apiBase}/api/admin/procurement/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Không thể tải dữ liệu tổng hợp');

      setGroups(data.groups || []);
      setOrders(data.orders || []);
      setChecksum(data.checksum || null);
      setLastExportedAt(data.lastExportedAt || null);
      setChangedSinceLastExport(data.changedSinceLastExport || []);
      setSelectedOrderIds(new Set());
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  }, [apiBase, token, deliveryDate, includePending]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Xuất file Excel tổng hợp
  const handleExportExcel = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (deliveryDate) params.set('date', deliveryDate);
      params.set('includePending', includePending ? '1' : '0');

      const res = await fetch(`${apiBase}/api/admin/procurement/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Lỗi xuất file Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TONG_HOP_SOAN_HANG_${deliveryDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Cập nhật lại summary sau khi xuất để ghi nhận lastExportedAt
      fetchSummary();
    } catch (err: any) {
      alert('❌ ' + (err.message || 'Không thể xuất file Excel'));
    } finally {
      setExporting(false);
    }
  };

  // Toggle mở rộng / thu gọn
  const toggleGroup = (cat: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleProduct = (pid: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  // Sao chép thông báo Zalo
  const copyZaloSummary = () => {
    const totalOrders = checksum?.orderCount || orders.length;
    const totalLines = checksum?.lineItemCount || 0;
    const lateOrders = orders.filter((o) => o.isLate).length;

    let text = `📦 TỔNG HỢP SOẠN HÀNG TPS1 — Giao ngày ${deliveryDate}\n`;
    text += `• Số đơn: ${totalOrders} đơn (${orders.filter((o) => o.status === 'confirmed').length} đã xác nhận, ${orders.filter((o) => o.status === 'pending').length} chờ duyệt)\n`;
    text += `• Số dòng hàng: ${totalLines} dòng\n`;
    if (lateOrders > 0) {
      text += `• ⚠️ Đơn trễ giờ chốt: ${lateOrders} đơn\n`;
    }

    if (changedSinceLastExport.length > 0) {
      text += `\n⚠️ CẢNH BÁO THAY ĐỔI SAU LẦN XUẤT (${formatTime(lastExportedAt)}):\n`;
      changedSinceLastExport.forEach((c) => {
        text += `- ${c.kind === 'canceled' ? '❌ ĐÃ HỦY' : '✏️ ĐÃ SỬA'}: ${c.orderCode} (${c.customerName})\n`;
      });
    }

    navigator.clipboard.writeText(text);
    setCopiedZalo(true);
    setTimeout(() => setCopiedZalo(false), 2500);
  };

  // Sao chép riêng cảnh báo thay đổi cho Thu mua/Kho
  const copyChangesNotice = () => {
    if (changedSinceLastExport.length === 0) return;
    let text = `⚠️ TPS1 CẢNH BÁO: CÓ ${changedSinceLastExport.length} ĐƠN THAY ĐỔI sau lần xuất file lúc ${formatTime(lastExportedAt)} (Giao ngày ${deliveryDate}):\n`;
    changedSinceLastExport.forEach((c) => {
      text += `• ${c.kind === 'canceled' ? 'HỦY ĐƠN' : 'ĐIỀU CHỈNH'}: Mã ${c.orderCode} - Khách ${c.customerName}\n`;
    });
    text += `👉 Thu mua / Kho vui lòng kiểm tra lại trước khi chia hàng!`;

    navigator.clipboard.writeText(text);
    setCopiedChanges(true);
    setTimeout(() => setCopiedChanges(false), 2500);
  };

  // Xác nhận đơn hàng loạt (bulk confirm)
  const handleBulkConfirm = async (ids: string[]) => {
    if (!token || ids.length === 0) return;
    if (!confirm(`Xác nhận duyệt nhanh ${ids.length} đơn hàng đã chọn?`)) return;

    setBulkConfirming(true);
    try {
      // Chia lô ≤ 50 đơn/lần gọi theo F3c
      const chunkSize = 50;
      let totalConfirmed = 0;
      const allSkipped: Array<{ orderId: string; reason: string }> = [];

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const res = await fetch(`${apiBase}/api/admin/orders/bulk-confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderIds: chunk }),
        });
        const data = await res.json();
        if (data.ok) {
          totalConfirmed += (data.confirmed || []).length;
          if (Array.isArray(data.skipped)) {
            allSkipped.push(...data.skipped);
          }
        }
      }

      let msg = `✅ Đã xác nhận thành công ${totalConfirmed} đơn hàng!`;
      if (allSkipped.length > 0) {
        msg += `\n⚠️ Bỏ qua ${allSkipped.length} đơn:\n` + allSkipped.map((s) => `- ${s.reason}`).join('\n');
      }
      alert(msg);
      fetchSummary();
    } catch (err: any) {
      alert('❌ Lỗi xác nhận đơn: ' + (err.message || 'Không xác định'));
    } finally {
      setBulkConfirming(false);
    }
  };

  const pendingOrders = useMemo(() => orders.filter((o) => o.status === 'pending'), [orders]);
  const cleanPendingOrders = useMemo(() => orders.filter((o) => o.status === 'pending' && !o.isLate), [orders]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Điều khiển */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <FileSpreadsheet className="text-green-600" size={26} />
            Đơn tổng &amp; Tổng hợp soạn hàng
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Tổng hợp theo ngày giao, chuẩn bị file Excel cho Thu mua và xử lý ngoại lệ trước giờ soạn hàng.
          </p>
        </div>

        {/* Thanh công cụ: Ngày giao + Xuất Excel + Copy Zalo */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Calendar size={15} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500">Giao ngày:</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="text-xs font-semibold text-slate-800 border-0 focus:ring-0 p-0"
            />
          </div>

          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-medium shadow-sm">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setDeliveryDate(now.toISOString().slice(0, 10));
              }}
              className={`px-3 py-2 transition-colors ${
                deliveryDate === new Date().toISOString().slice(0, 10)
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => {
                const tom = new Date();
                tom.setDate(tom.getDate() + 1);
                setDeliveryDate(tom.toISOString().slice(0, 10));
              }}
              className={`px-3 py-2 border-l border-slate-200 transition-colors ${
                deliveryDate ===
                new Date(Date.now() + 86400000).toISOString().slice(0, 10)
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Ngày mai
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            Xuất Excel soạn hàng
          </button>

          <button
            type="button"
            onClick={copyZaloSummary}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            {copiedZalo ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copiedZalo ? 'Đã chép Zalo!' : 'Sao chép thông báo Zalo'}
          </button>

          <button
            type="button"
            onClick={fetchSummary}
            disabled={loading}
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm"
            title="Tải lại"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-green-600' : ''} />
          </button>
        </div>
      </header>

      {/* 2. Khối Cảnh báo đỏ: Đơn thay đổi sau lần xuất (WP5 / WP6b) */}
      {changedSinceLastExport.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 text-red-900">
              <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={22} />
              <div>
                <h3 className="font-bold text-sm text-red-900">
                  CẢNH BÁO: Có {changedSinceLastExport.length} đơn hàng THAY ĐỔI sau lần xuất file gần nhất (lúc {formatTime(lastExportedAt)})!
                </h3>
                <p className="text-xs text-red-700 mt-0.5">
                  File Thu mua/Kho đã nhận trước đó đã bị lệch số lượng. Vui lòng báo ngay cho Thu mua/Kho hoặc xuất lại file mới.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={copyChangesNotice}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              {copiedChanges ? <Check size={13} /> : <Copy size={13} />}
              {copiedChanges ? 'Đã chép danh sách!' : 'Sao chép tin báo Thu mua / Kho'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            {changedSinceLastExport.map((c) => (
              <div
                key={c.orderId}
                className="bg-white/90 border border-red-200 rounded-xl p-2.5 text-xs flex items-center justify-between"
              >
                <div>
                  <span
                    className={`font-bold mr-1.5 ${
                      c.kind === 'canceled' ? 'text-red-600' : 'text-amber-700'
                    }`}
                  >
                    {c.kind === 'canceled' ? '❌ HỦY ĐƠN' : '✏️ ĐÃ SỬA'}
                  </span>
                  <b className="text-slate-800">{c.orderCode}</b>
                  <p className="text-slate-500 truncate max-w-[180px]">{c.customerName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/don-hang/${c.orderId}`)}
                  className="text-blue-600 hover:underline shrink-0 text-[11px] font-semibold"
                >
                  Xem đơn
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Thẻ Thông tin Kiểm tra Checksum & Tổng quan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng số đơn hàng</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-800">{checksum?.orderCount ?? orders.length}</span>
            <span className="text-xs text-slate-400">đơn</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {orders.filter((o) => o.status === 'confirmed').length} đã xác nhận · {orders.filter((o) => o.status === 'pending').length} chờ duyệt
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng số dòng hàng</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-800">{checksum?.lineItemCount ?? 0}</span>
            <span className="text-xs text-slate-400">mặt hàng</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Gồm {groups.length} nhóm phân loại</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đối chiếu Đơn tổng</p>
          <div className="flex items-center gap-2 mt-1.5">
            {checksum?.isMatching ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                <CheckCircle2 size={13} /> Khớp hoàn toàn
              </span>
            ) : checksum ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <AlertTriangle size={13} /> Lệch {Math.abs(checksum.sumQtyByLines - checksum.sumQtyByProducts)}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Chưa đối chiếu</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Sheet 1 và Sheet 2 khớp số lượng</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đơn trễ giờ chốt</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-600">
              {orders.filter((o) => o.isLate).length}
            </span>
            <span className="text-xs text-slate-400">đơn sau 16:30</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Lần xuất gần nhất: {lastExportedAt ? formatTime(lastExportedAt) : 'Chưa xuất'}
          </p>
        </div>
      </div>

      {/* 4. Tab Navigation & Tuỳ chọn phạm vi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'summary'
                ? 'bg-green-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Package size={17} />
            Tổng hợp soạn hàng ({groups.reduce((s, g) => s + g.itemCount, 0)} món)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('triage')}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'triage'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock size={17} />
            Hàng đợi Cần xử lý ({pendingOrders.length})
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includePending}
            onChange={(e) => setIncludePending(e.target.checked)}
            className="rounded border-slate-300 text-green-600 focus:ring-green-500/20"
          />
          <span>Gồm cả đơn chờ xác nhận (Pending)</span>
        </label>
      </div>

      {/* 5. Nội dung Tab */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-500 space-y-3">
          <RefreshCw size={28} className="animate-spin text-green-600 mx-auto" />
          <p className="text-sm font-medium">Đang tổng hợp dữ liệu đơn hàng và kho...</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700 space-y-3">
          <p className="text-sm font-semibold">{errorMsg}</p>
          <button
            type="button"
            onClick={fetchSummary}
            className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : activeTab === 'summary' ? (
        /* TAB 1: TỔNG HỢP SOẠN HÀNG THEO NHÓM */
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
              <Package size={36} className="mx-auto mb-2 opacity-40" />
              <p className="font-semibold text-slate-600">Không có đơn hàng nào cho ngày giao {deliveryDate}</p>
              <p className="text-xs text-slate-400 mt-1">Chọn ngày khác hoặc tạo đơn mới tại màn hình POS</p>
            </div>
          ) : (
            groups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.category);

              return (
                <div
                  key={group.category}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  {/* Category Header */}
                  <div
                    onClick={() => toggleGroup(group.category)}
                    className="flex items-center justify-between px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? (
                        <ChevronRight size={18} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={18} className="text-slate-600" />
                      )}
                      <h2 className="font-bold text-slate-800 text-sm">{group.category}</h2>
                      <span className="text-xs text-slate-400">({group.itemCount} mặt hàng)</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-500">
                        Tổng SL cuối:{' '}
                        <b className="text-green-700 font-bold">{formatQty(group.totalQty)}</b>
                      </span>
                      {group.orderedQty !== group.totalQty && (
                        <span className="text-slate-400">
                          (Ban đầu: {formatQty(group.orderedQty)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Table Lines */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-700">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[11px]">
                          <tr>
                            <th className="py-2.5 pl-4 pr-2 w-10 text-center">STT</th>
                            <th className="py-2.5 px-3">Mã hàng</th>
                            <th className="py-2.5 px-3">Tên sản phẩm</th>
                            <th className="py-2.5 px-2 text-center">ĐVT</th>
                            <th className="py-2.5 px-3 text-right font-bold text-slate-800">Tổng SL cuối</th>
                            <th className="py-2.5 px-3 text-right text-slate-400">SL khách đặt</th>
                            <th className="py-2.5 px-3 text-center">Số đơn</th>
                            <th className="py-2.5 px-3 text-right">Tồn kho</th>
                            <th className="py-2.5 px-3 text-right">Cần bù</th>
                            <th className="py-2.5 px-4">Ghi chú của khách</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.lines.map((line, idx) => {
                            const isExpanded = expandedProducts.has(line.productId || line.name);
                            const hasShortfall = line.shortfall > 0;

                            return (
                              <tr
                                key={line.productId || idx}
                                onClick={() => toggleProduct(line.productId || line.name)}
                                className={`cursor-pointer hover:bg-green-50/50 transition-colors ${
                                  isExpanded ? 'bg-slate-50/80' : ''
                                }`}
                              >
                                <td className="py-3 pl-4 pr-2 text-center text-slate-400">{idx + 1}</td>
                                <td className="py-3 px-3 font-mono text-[11px] text-slate-500">{line.sku || '—'}</td>
                                <td className="py-3 px-3 font-semibold text-slate-800">
                                  <div className="flex items-center gap-1.5">
                                    {isExpanded ? (
                                      <ChevronDown size={14} className="text-slate-400" />
                                    ) : (
                                      <ChevronRight size={14} className="text-slate-400" />
                                    )}
                                    <span>{line.name}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-center font-medium">{line.unit}</td>
                                <td className="py-3 px-3 text-right font-black text-sm text-green-700">
                                  {formatQty(line.totalQty)}
                                </td>
                                <td className="py-3 px-3 text-right text-slate-400">
                                  {formatQty(line.orderedQty)}
                                </td>
                                <td className="py-3 px-3 text-center text-slate-600">
                                  {line.orderCount} đơn ({line.customerCount} KH)
                                </td>
                                <td className="py-3 px-3 text-right font-medium text-slate-600">
                                  {line.stockQty !== null ? formatQty(line.stockQty) : '—'}
                                </td>
                                <td
                                  className={`py-3 px-3 text-right font-bold ${
                                    hasShortfall ? 'text-red-600' : 'text-slate-400'
                                  }`}
                                >
                                  {hasShortfall ? formatQty(line.shortfall) : '—'}
                                </td>
                                <td className="py-3 px-4 text-slate-500">
                                  {line.notes && line.notes.length > 0 ? (
                                    <div className="space-y-0.5">
                                      {line.notes.map((n, i) => (
                                        <div key={i} className="text-[11px]">
                                          <span className="font-semibold text-slate-700">{n.customer}:</span>{' '}
                                          <span className="text-slate-600 italic">"{n.note}"</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 italic">Không có</span>
                                  )}

                                  {/* Bảng chi tiết phân bổ cho từng khách hàng (khi mở rộng) */}
                                  {isExpanded && line.customerLines && line.customerLines.length > 0 && (
                                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl shadow-inner space-y-1.5">
                                      <p className="font-bold text-[11px] text-slate-700 uppercase tracking-wider">
                                        Chi tiết phân bổ cho từng khách hàng:
                                      </p>
                                      <div className="divide-y divide-slate-100">
                                        {line.customerLines.map((cl, ci) => (
                                          <div
                                            key={ci}
                                            className="py-1 flex items-center justify-between text-[11px]"
                                          >
                                            <div>
                                              <b className="text-slate-800 mr-2">{cl.customerName}</b>
                                              <span className="text-slate-400 font-mono">({cl.orderCode})</span>
                                              {cl.note && (
                                                <span className="text-amber-700 ml-2 italic">Ghi chú: {cl.note}</span>
                                              )}
                                            </div>
                                            <div className="text-right">
                                              <span className="font-bold text-green-700">{formatQty(cl.quantity)} {line.unit}</span>
                                              {cl.orderedQuantity !== cl.quantity && (
                                                <span className="text-slate-400 text-[10px] ml-1.5">(gốc: {formatQty(cl.orderedQuantity)})</span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* TAB 2: HÀNG ĐỢI CẦN XỬ LÝ (ORDER TRIAGE) */
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                Đang có {pendingOrders.length} đơn chờ xác nhận
              </span>
              {cleanPendingOrders.length > 0 && (
                <span className="text-xs bg-green-100 text-green-800 font-medium px-2.5 py-1 rounded-full">
                  {cleanPendingOrders.length} đơn sạch đủ điều kiện duyệt nhanh
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {cleanPendingOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleBulkConfirm(cleanPendingOrders.map((o) => o.orderId))}
                  disabled={bulkConfirming}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  Xác nhận tất cả đơn sạch ({cleanPendingOrders.length} đơn)
                </button>
              )}

              {selectedOrderIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleBulkConfirm(Array.from(selectedOrderIds))}
                  disabled={bulkConfirming}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                >
                  Xác nhận {selectedOrderIds.size} đơn đã chọn
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={pendingOrders.length > 0 && selectedOrderIds.size === pendingOrders.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrderIds(new Set(pendingOrders.map((o) => o.orderId)));
                          } else {
                            setSelectedOrderIds(new Set());
                          }
                        }}
                        className="rounded border-slate-300 text-green-600 focus:ring-green-500/20"
                      />
                    </th>
                    <th className="py-3 px-3">Mã đơn</th>
                    <th className="py-3 px-3">Khách hàng</th>
                    <th className="py-3 px-3">Điểm giao hàng</th>
                    <th className="py-3 px-3 text-center">Số món</th>
                    <th className="py-3 px-3">Trạng thái</th>
                    <th className="py-3 px-3">Cảnh báo</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Không có đơn hàng nào trong ngày {deliveryDate}
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => {
                      const isSelected = selectedOrderIds.has(o.orderId);

                      return (
                        <tr
                          key={o.orderId}
                          className={`hover:bg-slate-50 transition-colors ${
                            o.isLate ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          <td className="py-3 px-4 text-center">
                            {o.status === 'pending' && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  setSelectedOrderIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(o.orderId);
                                    else next.delete(o.orderId);
                                    return next;
                                  });
                                }}
                                className="rounded border-slate-300 text-green-600 focus:ring-green-500/20"
                              />
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">{o.orderCode}</td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-slate-800">{o.customerName}</p>
                            <p className="text-[11px] text-slate-400">{o.customerCode}</p>
                          </td>
                          <td className="py-3 px-3 max-w-[220px]">
                            <p className="truncate text-slate-700 font-medium">{o.deliveryAddress || 'Nhận tại điểm'}</p>
                            {o.deliveryName && (
                              <p className="text-[11px] text-slate-400 truncate">
                                Người nhận: {o.deliveryName} {o.deliveryPhone ? `(${o.deliveryPhone})` : ''}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-semibold text-slate-700">{o.lineCount}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                o.status === 'confirmed'
                                  ? 'bg-green-100 text-green-700'
                                  : o.status === 'preparing'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {o.status === 'confirmed'
                                ? 'Đã xác nhận'
                                : o.status === 'preparing'
                                ? 'Đang soạn'
                                : 'Chờ xác nhận'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {o.isLate && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                <Clock size={12} /> Trễ giờ (sau 16:30)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => navigate(`/don-hang/${o.orderId}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            >
                              <Eye size={12} /> Xem
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
