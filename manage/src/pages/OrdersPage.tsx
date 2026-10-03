import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { printOrderSlip, printBatchOrderSlips } from '../lib/printOrder';
import MergeOrdersModal from '../components/MergeOrdersModal';
import {
  RefreshCw, Search, Eye, Printer, Clock, Truck,
  ShoppingBag, ClipboardEdit, FileSpreadsheet, AlertCircle,
  ChevronLeft, ChevronRight, Trash2, Plus, Package, CheckSquare,
  Square, ChevronDown, Download, X, Calendar, MapPin
} from 'lucide-react';

const PAGE_SIZE = 50;

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
  canceled: 'bg-rose-500',
  merged: 'bg-slate-400',
};

const STATUS_PILL_COLORS: Record<string, string> = {
  draft: 'bg-slate-50 text-slate-700 border-slate-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-800 border-blue-200',
  preparing: 'bg-violet-50 text-violet-800 border-violet-200',
  shipping: 'bg-sky-50 text-sky-800 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  canceled: 'bg-rose-50 text-rose-800 border-rose-200',
  merged: 'bg-slate-100 text-slate-600 border-slate-200',
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
  cod: 'COD',
  paid: 'Đã thanh toán',
  partially_paid: 'Thanh toán 1 phần',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cod: 'bg-blue-50 text-blue-700 border-blue-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partially_paid: 'bg-orange-50 text-orange-700 border-orange-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  refunded: 'bg-slate-100 text-slate-600 border-slate-200',
};

const SOURCE_LABELS: Record<string, string> = {
  website: 'Web',
  miniapp: 'Mini App',
  zalo_mini_app: 'Zalo',
  admin: 'Admin',
};

function money(val: number | string) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(val) || 0)) + 'đ';
}

function dt(val: string | null | undefined) {
  if (!val) return '—';
  return new Date(val).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

export default function OrdersPage({ view = 'orders' }: { view?: 'orders' | 'invoices' }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterPayment, setFilterPayment] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [changeRequestsMap, setChangeRequestsMap] = useState<Map<string, any>>(new Map());
  const [filterHasRequest, setFilterHasRequest] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [stats, setStats] = useState({ pending: 0, preparing: 0, shipping: 0, completed: 0, revenue: 0 });

  // Multi-select & Gộp đơn
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filterStatus, filterPayment, dateFrom, dateTo, filterHasRequest]);

  // Click outside to close export dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      if (token) {
        fetch(`${apiBase}/api/admin/order-change-requests?status=open`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.ok ? r.json() : null)
          .then((d) => {
            if (d && d.ok && Array.isArray(d.requests)) {
              setChangeRequests(d.requests);
              const m = new Map<string, any>();
              d.requests.forEach((r: any) => m.set(r.orderId, r));
              setChangeRequestsMap(m);
            }
          })
          .catch((e) => console.warn('Lỗi tải order-change-requests:', e));
      }

      if (!token) throw new Error('Phiên đăng nhập đã hết hạn');
      const params = new URLSearchParams({ mode: view, page: String(page), pageSize: String(PAGE_SIZE) });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (view === 'orders' && filterStatus) params.set('status', filterStatus);
      if (filterPayment) params.set('paymentStatus', filterPayment);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const response = await fetch(`${apiBase}/api/admin/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Không tải được danh sách đơn hàng');
      const loadedOrders = Array.isArray(result.orders) ? result.orders : [];
      setTotalCount(Number(result.totalCount ?? result.count) || 0);
      setOrders(loadedOrders);
      setStats(result.stats || loadedOrders.reduce((acc: any, order: any) => {
        if (order.status === 'pending') acc.pending += 1;
        if (order.status === 'preparing') acc.preparing += 1;
        if (order.status === 'shipping') acc.shipping += 1;
        if (order.status === 'completed') acc.completed += 1;
        if (order.status !== 'canceled' && order.status !== 'merged') acc.revenue += Number(order.grand_total) || 0;
        return acc;
      }, { pending: 0, preparing: 0, shipping: 0, completed: 0, revenue: 0 }));
    } catch (err) {
      console.error('Lỗi tải đơn hàng:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterStatus, filterPayment, debouncedSearch, page, token, apiBase, view]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => !filterHasRequest || changeRequestsMap.has(order.id));
  }, [orders, filterHasRequest, changeRequestsMap]);

  const totals = useMemo(() => {
    return filteredOrders.reduce((acc, o) => {
      if (o.status !== 'merged' && o.status !== 'canceled') {
        acc.grand += Number(o.grand_total) || 0;
        acc.paid += Number(o.paid_amount) || 0;
      }
      return acc;
    }, { grand: 0, paid: 0 });
  }, [filteredOrders]);

  // Checkbox helpers
  const isAllVisibleSelected = useMemo(() => {
    if (filteredOrders.length === 0) return false;
    return filteredOrders.every(o => selectedOrderIds.has(o.id));
  }, [filteredOrders, selectedOrderIds]);

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      const next = new Set(selectedOrderIds);
      filteredOrders.forEach(o => next.delete(o.id));
      setSelectedOrderIds(next);
    } else {
      const next = new Set(selectedOrderIds);
      filteredOrders.forEach(o => next.add(o.id));
      setSelectedOrderIds(next);
    }
  };

  const toggleSelectOrder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const changeStatus = async (order: any, newStatus: string) => {
    setUpdatingId(order.id);
    try {
      const response = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, status: newStatus }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Không cập nhật được trạng thái');
      await fetchOrders();
    } catch (err: any) {
      alert('Không cập nhật được trạng thái: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setUpdatingId(null);
    }
  };

  const changePayment = async (order: any, newPayment: string) => {
    setUpdatingId(order.id);
    try {
      const response = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, paymentStatus: newPayment }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Không cập nhật được thanh toán');
      await fetchOrders();
    } catch (err: any) {
      alert('Không cập nhật được thanh toán: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePrint = async (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (view === 'invoices') {
        const invoiceResponse = await fetch(`${apiBase}/api/admin/orders/document?orderId=${encodeURIComponent(order.id)}&type=invoice`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!invoiceResponse.ok) {
          const errorData = await invoiceResponse.json().catch(() => null);
          throw new Error(errorData?.error || 'Chưa có hóa đơn cho đơn này');
        }
        const blob = await invoiceResponse.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `HOA-DON_${order.order_code}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const response = await fetch(`${apiBase}/api/admin/orders?id=${encodeURIComponent(order.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || !result.order) throw new Error(result?.error || 'Không tải được chi tiết đơn');
      printOrderSlip(result.order, 'temporary');
    } catch (err: any) {
      alert('Lỗi in phiếu: ' + (err.message || 'Không thể in phiếu tạm'));
    }
  };

  const handleProcess = async (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setUpdatingId(order.id);
    try {
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, claimOrder: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không tiếp nhận được đơn hàng');
      navigate(`/tao-don-hang?processOrderId=${order.id}`);
    } catch (err: any) {
      alert(err.message || 'Không tiếp nhận được đơn hàng');
      await fetchOrders();
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteOrder = async (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.role !== 'admin') return;
    if (!confirm(`Xóa vĩnh viễn đơn ${order.order_code}?\n\nChỉ đơn chưa phát sinh giao nhận/thanh toán mới xóa được. Thao tác này không thể hoàn tác.`)) return;
    setUpdatingId(order.id);
    try {
      const res = await fetch(`${apiBase}/api/admin/orders`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không thể xóa đơn hàng');
      await fetchOrders();
    } catch (err: any) {
      alert('Không thể xóa: ' + (err.message || 'Đã xảy ra lỗi'));
    } finally {
      setUpdatingId(null);
    }
  };

  // Xuất file tổng hợp Excel (List hoặc Details)
  const handleExportExcel = async (mode: 'list' | 'details', onlySelected = false) => {
    setExporting(true);
    setExportDropdownOpen(false);
    try {
      const params = new URLSearchParams();
      params.set('mode', mode);

      if (onlySelected && selectedOrderIds.size > 0) {
        params.set('orderIds', Array.from(selectedOrderIds).join(','));
      } else {
        if (!onlySelected && selectedOrderIds.size === 0 && totalCount > 100) {
          const ok = confirm(`Bạn đang xuất toàn bộ ${totalCount} đơn hàng theo bộ lọc hiện tại. Tiếp tục?`);
          if (!ok) { setExporting(false); return; }
        }
        if (filterStatus) params.set('status', filterStatus);
        if (filterPayment) params.set('paymentStatus', filterPayment);
        if (dateFrom) params.set('from', dateFrom);
        if (dateTo) params.set('to', `${dateTo}T23:59:59.999`);
        if (searchTerm) params.set('search', searchTerm);
      }

      const res = await fetch(`${apiBase}/api/admin/orders/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Không xuất được danh sách đơn hàng');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = mode === 'details'
        ? `chi-tiet-don-hang_${new Date().toISOString().slice(0, 10)}.xlsx`
        : `danh-sach-don-hang_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xuất được danh sách đơn hàng'));
    } finally {
      setExporting(false);
    }
  };

  // In phiếu tạm hoặc phiếu giao hàng hàng loạt cho các đơn đã chọn
  const handleBatchPrintSlips = async (kind: 'temporary' | 'delivery') => {
    if (selectedOrderIds.size === 0) return;
    setExporting(true);
    setExportDropdownOpen(false);
    try {
      const ids = Array.from(selectedOrderIds);
      const fullOrders = await Promise.all(ids.map(async (orderId) => {
        const response = await fetch(`${apiBase}/api/admin/orders?id=${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok || !result.order) {
          throw new Error(result?.error || 'Không tải được chi tiết đơn hàng');
        }
        return result.order;
      }));

      if (fullOrders.length === 0) {
        throw new Error('Không thể tải chi tiết các đơn hàng được chọn');
      }

      printBatchOrderSlips(fullOrders as any[], kind);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể in phiếu'));
    } finally {
      setExporting(false);
    }
  };

  const handleMergeSuccess = (newOrder: any) => {
    setSelectedOrderIds(new Set());
    fetchOrders();
    alert(`✔ Gộp đơn thành công!\nĐơn hàng mới: ${newOrder.order_code}`);
    navigate(`/don-hang/${newOrder.id}`);
  };

  // Status Chip list for quick mobile/desktop tabs
  const statusChips = view === 'invoices' ? [
    { key: '', label: 'Tất cả hóa đơn', count: totalCount, dot: STATUS_DOT_COLORS.completed },
  ] : [
    { key: '', label: 'Tất cả', count: totalCount },
    { key: 'pending', label: 'Chờ xác nhận', count: stats.pending, dot: STATUS_DOT_COLORS.pending },
    { key: 'preparing', label: 'Đang chuẩn bị', count: stats.preparing, dot: STATUS_DOT_COLORS.preparing },
    { key: 'shipping', label: 'Đang giao', count: stats.shipping, dot: STATUS_DOT_COLORS.shipping },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0 max-w-full pb-28 md:pb-20">

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* TOP HEADER & ACTION BAR (Tối ưu mobile icon + tooltip như KiotViet)   */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <header className="flex items-center justify-between gap-3 bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {view === 'invoices' ? 'Hóa đơn bán hàng' : 'Đặt hàng'}
            </h1>
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
              {totalCount} đơn
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {view === 'invoices' ? 'Đơn đã giao xong; dùng để theo dõi thanh toán và xử lý đổi/trả' : 'Phiếu tạm và đơn đang xử lý'} · hiển thị {filteredOrders.length}
            {selectedOrderIds.size > 0 && (
              <span className="ml-2 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Đã chọn {selectedOrderIds.size} đơn
              </span>
            )}
          </p>
        </div>

        {/* Action Group: Trên mobile thu gọn thành các icon tròn/vuông kèm hover tooltip chuẩn KiotViet */}
        <div className="flex items-center gap-1.5 sm:gap-2">

          {/* NÚT 1: TẠO ĐƠN HÀNG (+) */}
          {view === 'orders' && <div className="relative group">
            <button
              onClick={() => navigate('/tao-don-hang')}
              className="h-10 sm:h-auto sm:px-3.5 sm:py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all"
              title="Tạo đơn hàng mới (POS)"
              aria-label="Tạo đơn hàng mới"
            >
              <Plus size={18} className="shrink-0" />
              <span className="hidden sm:inline">Tạo đơn hàng</span>
            </button>
            {/* Tooltip bubble on hover / tap */}
            <div className="absolute -bottom-9 right-0 sm:left-1/2 sm:-translate-x-1/2 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-medium rounded-lg shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Tạo đơn hàng mới (POS)
            </div>
          </div>}

          {/* NÚT 2: GỘP ĐƠN (Theo khách hàng chuẩn KiotViet) */}
          {view === 'orders' && <div className="relative group">
            <button
              onClick={() => setIsMergeModalOpen(true)}
              className="h-10 sm:h-auto sm:px-3.5 sm:py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all relative"
              title="Gộp phiếu đặt hàng theo từng khách hàng"
              aria-label="Gộp phiếu đặt hàng"
            >
              <Package size={17} className="shrink-0" />
              <span className="hidden sm:inline">Gộp đơn</span>
              {selectedOrderIds.size >= 2 ? (
                <span className="bg-white text-blue-700 font-extrabold text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full shadow-2xs">
                  {selectedOrderIds.size}
                </span>
              ) : selectedOrderIds.size === 1 ? (
                <span className="bg-amber-400 text-amber-950 font-bold text-[9px] px-1 rounded-full sm:hidden">
                  1
                </span>
              ) : null}
            </button>
            {/* Tooltip bubble on hover / tap */}
            <div className="absolute -bottom-9 right-0 sm:left-1/2 sm:-translate-x-1/2 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-medium rounded-lg shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Gộp đơn theo khách hàng
            </div>
          </div>}

          {/* NÚT 3: XUẤT FILE & IN PHIẾU (Dropdown) */}
          <div className="relative group" ref={exportDropdownRef}>
            <button
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              disabled={exporting}
              className="h-10 sm:h-auto sm:px-3 sm:py-2.5 px-3 bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 active:scale-95 rounded-xl text-xs sm:text-sm font-semibold shadow-2xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
              title="Xuất Excel / In phiếu hàng loạt"
              aria-label="Xuất file"
            >
              <FileSpreadsheet size={17} className="text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">{exporting ? 'Đang xuất...' : 'Xuất file'}</span>
              <ChevronDown size={14} className="text-slate-400 hidden sm:inline" />
            </button>
            {/* Tooltip bubble on hover */}
            <div className="absolute -bottom-9 right-0 sm:left-1/2 sm:-translate-x-1/2 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-medium rounded-lg shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Xuất file Excel / In phiếu
            </div>

            {exportDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                {selectedOrderIds.size > 0 ? (
                  <>
                    <div className="px-3.5 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-100">
                      Cho {selectedOrderIds.size} đơn đã chọn
                    </div>
                    <button
                      onClick={() => handleExportExcel('list', true)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 font-medium"
                    >
                      <FileSpreadsheet size={15} className="text-emerald-600 shrink-0" />
                      Danh sách đơn (Excel)
                    </button>
                    <button
                      onClick={() => handleExportExcel('details', true)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 font-medium"
                    >
                      <Download size={15} className="text-blue-600 shrink-0" />
                      Chi tiết mặt hàng từng đơn (Excel)
                    </button>
                    <button
                      onClick={() => handleBatchPrintSlips('temporary')}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 font-medium"
                    >
                      <Printer size={15} className="text-slate-600 shrink-0" />
                      In / Xuất phiếu tạm hàng loạt
                    </button>
                    <button
                      onClick={() => handleBatchPrintSlips('delivery')}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 font-medium"
                    >
                      <Truck size={15} className="text-sky-600 shrink-0" />
                      In phiếu giao hàng hàng loạt
                    </button>
                  </>
                ) : (
                  <>
                    <div className="px-3.5 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-100">
                      Toàn bộ kết quả theo bộ lọc ({totalCount} đơn)
                    </div>
                    <button
                      onClick={() => handleExportExcel('list', false)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 font-medium"
                    >
                      <FileSpreadsheet size={15} className="text-emerald-600 shrink-0" />
                      Danh sách đơn hàng (Excel)
                    </button>
                    <button
                      onClick={() => handleExportExcel('details', false)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700 font-medium"
                    >
                      <Download size={15} className="text-blue-600 shrink-0" />
                      Chi tiết mặt hàng để kiểm tra (Excel)
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* NÚT 4: TẢI LẠI */}
          <div className="relative group">
            <button
              onClick={fetchOrders}
              className="h-10 w-10 flex items-center justify-center border border-slate-200/90 text-slate-600 bg-white rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-2xs"
              title="Tải lại danh sách đơn hàng"
              aria-label="Tải lại"
            >
              <RefreshCw size={17} className={loading ? 'animate-spin text-emerald-600' : ''} />
            </button>
            <div className="absolute -bottom-9 right-0 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-medium rounded-lg shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Tải lại
            </div>
          </div>

        </div>
      </header>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* QUICK STATUS TABS (Vuốt ngang trên mobile, click lọc tức thì)        */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        {statusChips.map((chip) => {
          const isActive = filterStatus === chip.key && !filterHasRequest;
          return (
            <button
              key={chip.key}
              onClick={() => {
                setFilterHasRequest(false);
                setFilterStatus(chip.key);
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs scale-[1.02]'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {chip.dot && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${chip.dot} ${isActive ? 'ring-2 ring-white/50' : ''}`} />
              )}
              <span>{chip.label}</span>
              {chip.count !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {chip.count}
                </span>
              )}
            </button>
          );
        })}

        {/* Tab Lọc đơn có yêu cầu điều chỉnh */}
        <button
          onClick={() => {
            setFilterHasRequest(!filterHasRequest);
            if (!filterHasRequest) setFilterStatus('');
          }}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            filterHasRequest
              ? 'bg-amber-600 text-white shadow-xs scale-[1.02]'
              : changeRequests.length > 0
              ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
              : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
          }`}
          title="Đơn có yêu cầu hủy hoặc đổi trả từ khách"
        >
          <AlertCircle size={14} className={changeRequests.length > 0 && !filterHasRequest ? 'text-amber-600 animate-pulse' : ''} />
          <span>Có yêu cầu</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
            filterHasRequest ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
          }`}>
            {changeRequests.length}
          </span>
        </button>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SEARCH & FILTERS BAR                                                */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {/* Ô tìm kiếm với nút xóa nhanh */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mã đơn, tên khách hàng, số điện thoại..."
              className="w-full pl-9 pr-9 py-2.5 bg-slate-50/70 border border-slate-200/90 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Lọc thanh toán */}
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="px-3 py-2.5 bg-slate-50/70 border border-slate-200/90 text-slate-700 text-xs sm:text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white font-medium min-w-[130px]"
            >
              <option value="">Tất cả thanh toán</option>
              {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>

            {/* Nút bật/tắt bộ lọc thời gian nâng cao */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-3 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all ${
                dateFrom || dateTo || showAdvancedFilters
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50'
              }`}
            >
              <Calendar size={15} />
              <span className="hidden sm:inline">Thời gian</span>
              {(dateFrom || dateTo) && (
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
              )}
            </button>
          </div>
        </div>

        {/* Khối lọc ngày (Thu gọn hoặc mở rộng) */}
        {showAdvancedFilters && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Khoảng ngày:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs text-slate-700 bg-slate-50/50"
            />
            <span className="text-slate-400">đến</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs text-slate-700 bg-slate-50/50"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-xs text-rose-600 hover:underline font-semibold ml-2"
              >
                Xóa lọc ngày
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* DANH SÁCH ĐƠN HÀNG (MOBILE CARDS & DESKTOP TABLE)                    */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">

        {/* MOBILE / TABLET CARDS (Dành cho màn hình nhỏ, giao diện như App KiotViet) */}
        <div className="lg:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="py-16 text-center space-y-2">
              <RefreshCw className="animate-spin text-emerald-600 mx-auto" size={26} />
              <p className="text-sm font-medium text-slate-500">Đang tải danh sách đơn hàng...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <ShoppingBag size={36} className="mx-auto opacity-30 text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Không tìm thấy đơn hàng phù hợp</p>
              <p className="text-xs text-slate-400">Thử thay đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm</p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = selectedOrderIds.has(order.id);
              const hasReq = changeRequestsMap.has(order.id);
              const req = changeRequestsMap.get(order.id);

              return (
                <article
                  key={order.id}
                  onClick={() => navigate(`/don-hang/${order.id}`)}
                  className={`p-3.5 sm:p-4 space-y-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/50 border-l-4 border-l-emerald-600'
                      : 'hover:bg-slate-50/70 active:bg-slate-100/60'
                  } ${updatingId === order.id ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  {/* Hàng 1: Checkbox + Mã đơn + Trạng thái + Tổng tiền */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Checkbox tap target lớn */}
                      <button
                        type="button"
                        onClick={(e) => toggleSelectOrder(order.id, e)}
                        className="p-1 -ml-1 text-slate-400 hover:text-emerald-700 transition-colors shrink-0"
                        aria-label="Chọn đơn hàng này"
                      >
                        {isSelected ? (
                          <CheckSquare size={19} className="text-emerald-600" />
                        ) : (
                          <Square size={19} />
                        )}
                      </button>

                      <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-sm tracking-tight break-all">
                          {order.order_code}
                        </span>

                        {/* Nguồn đơn */}
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded">
                          {SOURCE_LABELS[order.source] || order.source || 'Admin'}
                        </span>

                        {/* Trạng thái đơn với dot màu */}
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_PILL_COLORS[order.status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[order.status] || 'bg-slate-400'}`} />
                          {STATUS_LABELS[order.status] || order.status}
                        </span>

                        {order.status === 'merged' && (
                          <span className="text-[10px] font-extrabold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                            Đã gộp
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Số tiền nổi bật */}
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-emerald-700 text-base leading-tight">
                        {money(order.grand_total)}
                      </p>
                      {Number(order.paid_amount) > 0 && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Đã trả: {money(order.paid_amount)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cảnh báo yêu cầu đổi/hủy của khách nếu có */}
                  {hasReq && (
                    <div className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                      req?.type === 'cancel'
                        ? 'bg-rose-50 text-rose-800 border-rose-200 animate-pulse'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      <AlertCircle size={14} className="shrink-0" />
                      <span className="truncate">
                        {req?.type === 'cancel' ? 'Yêu cầu hủy đơn:' : 'Yêu cầu điều chỉnh:'} {req?.message || 'Khách gửi yêu cầu'}
                      </span>
                    </div>
                  )}

                  {/* Hàng 2: Tên Khách Hàng & Xưởng / Điểm giao */}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">
                      {order.customer_name || 'Khách lẻ'}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {order.customer_code}{order.customer_company ? ` · ${order.customer_company}` : ''}
                      {order.customer_phone ? ` · ${order.customer_phone}` : ''}
                    </p>
                    {view === 'orders' && (
                      <p className={`text-[11px] mt-1 font-semibold ${order.processing_by_name ? 'text-blue-700' : 'text-amber-700'}`}>
                        {order.processing_by_name ? `Đang xử lý: ${order.processing_by_name}` : 'Chưa có nhân viên tiếp nhận'}
                      </p>
                    )}
                  </div>

                  {/* Hàng 3: Ngày giao & Địa chỉ giao hàng */}
                  <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap pt-0.5">
                    {order.delivery_date ? (
                      <span className="flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50/70 px-2 py-0.5 rounded-md">
                        <Calendar size={13} className="text-emerald-600 shrink-0" />
                        Giao: {order.delivery_date} {order.delivery_shift ? `(${order.delivery_shift})` : ''}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock size={13} className="shrink-0" />
                        {dt(order.created_at)}
                      </span>
                    )}

                    {order.delivery_address && (
                      <span className="flex items-center gap-1 text-slate-500 truncate max-w-[200px]" title={order.delivery_address}>
                        <MapPin size={13} className="text-slate-400 shrink-0" />
                        <span className="truncate">{order.delivery_address}</span>
                      </span>
                    )}
                  </div>

                  {/* Hàng 4: Bộ thao tác nhanh & đổi trạng thái inline */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                    {/* Trạng thái thanh toán */}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${PAYMENT_COLORS[order.payment_status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                    </span>

                    {/* Các nút hành động kích thước tap tốt (>= 36px) */}
                    <div className="flex items-center gap-1">
                      {order.pricing_status !== 'finalized' && order.status !== 'merged' && (
                        <button
                          onClick={(e) => handleProcess(order, e)}
                          className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center justify-center transition-colors"
                          title="Lên đơn / Sửa mặt hàng (POS)"
                          aria-label="Xử lý đơn hàng"
                        >
                          <ClipboardEdit size={16} />
                        </button>
                      )}
                      <button
                        onClick={(e) => handlePrint(order, e)}
                        className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors"
                        title={view === 'invoices' ? 'Tải hóa đơn bán hàng' : 'In phiếu tạm'}
                        aria-label={view === 'invoices' ? 'Tải hóa đơn bán hàng' : 'In phiếu tạm'}
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        onClick={() => navigate(`/don-hang/${order.id}`)}
                        className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center transition-colors"
                        title="Xem chi tiết đơn"
                        aria-label="Xem chi tiết"
                      >
                        <Eye size={16} />
                      </button>
                      {view === 'orders' && user?.role === 'admin' && (
                        <button
                          onClick={(e) => deleteOrder(order, e)}
                          className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition-colors"
                          title="Xóa đơn hàng"
                          aria-label="Xóa đơn hàng"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* DESKTOP TABLE VIEW (Dành cho màn hình lớn lg/xl) */}
        <div className="hidden lg:block w-full overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-500 uppercase text-[11px] font-extrabold tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="px-3 py-3.5 w-10 text-center">
                  <button
                    onClick={toggleSelectAllVisible}
                    className="text-slate-400 hover:text-emerald-700 transition-colors p-1"
                    title={isAllVisibleSelected ? 'Bỏ chọn toàn bộ trang này' : 'Chọn toàn bộ trang này'}
                  >
                    {isAllVisibleSelected ? (
                      <CheckSquare size={18} className="text-emerald-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3.5">Mã đơn</th>
                <th className="px-4 py-3.5">Thời gian & Ngày giao</th>
                <th className="px-4 py-3.5">Khách hàng</th>
                <th className="px-4 py-3.5 text-center">SP</th>
                <th className="px-4 py-3.5 text-right">Khách cần trả</th>
                <th className="px-4 py-3.5 text-center">Xử lý</th>
                <th className="px-4 py-3.5 text-center">Thanh toán</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50/60 font-semibold text-slate-600 text-xs">
                <td className="px-3 py-2.5"></td>
                <td className="px-4 py-2.5" colSpan={4}>Tổng ({filteredOrders.length} đơn hiển thị)</td>
                <td className="px-4 py-2.5 text-right font-extrabold text-emerald-700">{money(totals.grand)}</td>
                <td colSpan={3}></td>
              </tr>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500">
                    <RefreshCw className="animate-spin text-emerald-600 mx-auto mb-2" size={24} />
                    Đang tải đơn hàng...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400">
                    <ShoppingBag size={36} className="mx-auto mb-2 opacity-30 text-slate-400" />
                    Không tìm thấy đơn hàng phù hợp
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isSelected = selectedOrderIds.has(order.id);
                  const hasReq = changeRequestsMap.has(order.id);
                  const req = changeRequestsMap.get(order.id);

                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/don-hang/${order.id}`)}
                      className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-50/40' : ''
                      } ${updatingId === order.id ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      <td className="px-3 py-3 text-center" onClick={(e) => toggleSelectOrder(order.id, e)}>
                        <button className="text-slate-400 hover:text-emerald-700 transition-colors p-1">
                          {isSelected ? (
                            <CheckSquare size={18} className="text-emerald-600" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900">{order.order_code}</p>
                          {order.status === 'merged' && (
                            <span className="text-[10px] font-extrabold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                              Đã gộp
                            </span>
                          )}
                          {hasReq && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs ${
                                req?.type === 'cancel'
                                  ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                              title={`Yêu cầu của khách: "${req?.message || ''}"`}
                            >
                              {req?.type === 'cancel' ? '❌ Yêu cầu hủy' : '✏️ Yêu cầu sửa'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded">
                            {SOURCE_LABELS[order.source] || order.source || 'Admin'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        <p className="font-medium text-slate-700">{dt(order.created_at)}</p>
                        {order.delivery_date && (
                          <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                            <Calendar size={12} /> Giao: {order.delivery_date}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{order.customer_name || 'Khách lẻ'}</p>
                        <p className="text-xs text-slate-500">{order.customer_code}{order.customer_company ? ` · ${order.customer_company}` : ''}</p>
                        {order.sales_rep_name && <p className="text-[11px] text-slate-400 mt-0.5">Sale: {order.sales_rep_name}</p>}
                        {view === 'orders' && (
                          <p className={`text-[11px] mt-0.5 font-semibold ${order.processing_by_name ? 'text-blue-700' : 'text-amber-700'}`}>
                            {order.processing_by_name ? `Đang xử lý: ${order.processing_by_name}` : 'Chưa tiếp nhận'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 font-medium">{order.item_count || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-extrabold text-emerald-700 whitespace-nowrap">{money(order.grand_total)}</p>
                        <p className="text-[11px] text-slate-400 whitespace-nowrap">Đã trả: {money(order.paid_amount || 0)}</p>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {view === 'invoices' ? (
                          <span className="inline-flex text-xs px-2.5 py-1.5 rounded-lg border font-semibold bg-green-50 text-green-700 border-green-200">Hoàn thành</span>
                        ) : (
                          <select
                            value={order.status}
                            onChange={(e) => changeStatus(order, e.target.value)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold focus:outline-none ${STATUS_PILL_COLORS[order.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}
                          >
                            {Object.entries(STATUS_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {view === 'invoices' ? (
                          <span className={`inline-flex text-xs px-2.5 py-1.5 rounded-lg border font-medium ${PAYMENT_COLORS[order.payment_status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                          </span>
                        ) : (
                          <select
                            value={order.payment_status}
                            onChange={(e) => changePayment(order, e.target.value)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium focus:outline-none ${PAYMENT_COLORS[order.payment_status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}
                          >
                            {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          {order.pricing_status !== 'finalized' && order.status !== 'merged' && (
                            <button
                              onClick={(e) => handleProcess(order, e)}
                              className="p-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                              title="Xử lý đơn hàng (mở POS)"
                            >
                              <ClipboardEdit size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/don-hang/${order.id}`)}
                            className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={(e) => handlePrint(order, e)}
                            className="p-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title={view === 'invoices' ? 'Tải hóa đơn bán hàng' : 'Xuất phiếu tạm'}
                          >
                            <Printer size={16} />
                          </button>
                          {view === 'orders' && user?.role === 'admin' && (
                            <button
                              onClick={(e) => deleteOrder(order, e)}
                              className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors"
                              title="Xóa đơn hàng"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-t border-slate-100 bg-slate-50/70 text-xs sm:text-sm">
            <span className="text-slate-500">
              Trang {page + 1} / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold disabled:opacity-40"
              >
                <ChevronLeft size={15} /> Trước
              </button>
              <button
                type="button"
                disabled={(page + 1) * PAGE_SIZE >= totalCount || loading}
                onClick={() => setPage(p => p + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold disabled:opacity-40"
              >
                Sau <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* STICKY BOTTOM ACTION BAR (Chuẩn KiotViet: Nằm an toàn trên mobile nav) */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2.5 sm:gap-4 text-xs sm:text-sm animate-in slide-in-from-bottom-5 duration-200 max-w-[95vw] flex-wrap justify-center">
          <div className="flex items-center gap-1.5 font-bold text-slate-100">
            <CheckSquare size={17} className="text-emerald-400 shrink-0" />
            <span>Đã chọn <strong className="text-emerald-300">{selectedOrderIds.size}</strong> đơn</span>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Nút Gộp đơn */}
          {view === 'orders' && <button
            onClick={() => setIsMergeModalOpen(true)}
            disabled={selectedOrderIds.size < 2}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 transition-all shadow-sm"
          >
            <Package size={14} /> Gộp đơn
          </button>}

          {/* Menu Xuất file */}
          <button
            onClick={() => handleExportExcel('list', true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all"
          >
            <FileSpreadsheet size={14} className="text-emerald-400" /> Xuất Excel
          </button>

          <button
            onClick={() => handleBatchPrintSlips('temporary')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all"
          >
            <Printer size={14} /> In phiếu tạm
          </button>

          <button
            onClick={() => setSelectedOrderIds(new Set())}
            className="text-slate-400 hover:text-white text-xs underline underline-offset-2 ml-1"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL GỘP ĐƠN (2 BƯỚC: NHÓM KHÁCH HÀNG & BẢN XEM TRƯỚC)              */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {view === 'orders' && <MergeOrdersModal
        isOpen={isMergeModalOpen}
        preSelectedOrderIds={Array.from(selectedOrderIds)}
        onClose={() => setIsMergeModalOpen(false)}
        onSuccess={handleMergeSuccess}
        token={token}
        apiBase={apiBase}
      />}
    </div>
  );
}
