import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, RefreshCw, Users, Plus, FileSpreadsheet, ShieldAlert, Pencil,
  KeyRound, Trash2, Copy, Check, X, MapPin, AlertCircle,
  CheckCircle2, UserCheck, Smartphone, ChevronLeft, ChevronRight
} from 'lucide-react';
import { isValidVietnamesePhone, formatVietnamesePhone } from '../lib/phoneUtils';

const TIER_COLORS: Record<string, string> = {
  VIP0: 'bg-slate-100 text-slate-600',
  VIP1: 'bg-sky-100 text-sky-700',
  VIP2: 'bg-blue-100 text-blue-700',
  VIP3: 'bg-purple-100 text-purple-700',
  CUSTOM: 'bg-amber-100 text-amber-700',
};
const VERIFICATION_LABELS: Record<string, string> = {
  pending: 'Chờ xác thực',
  verified: 'Đã xác thực',
  rejected: 'Đã từ chối',
};
const VERIFICATION_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ';
}

interface CustomerStats {
  total: number;
  missingPhone: number;
  missingAddress: number;
  missingBoth: number;
  complete: number;
}

export default function CustomersPage() {
  const { user, authFetch } = useAuth();
  const navigate = useNavigate();
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

  const [customers, setCustomers] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pagination state (Server-side)
  const [page, setPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 50;

  // Search input & debounced search term
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Stats & Filters
  const [stats, setStats] = useState<CustomerStats>({
    total: 0,
    missingPhone: 0,
    missingAddress: 0,
    missingBoth: 0,
    complete: 0,
  });
  const [filterMissing, setFilterMissing] = useState<string>('all');
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  // Actions state
  const [exporting, setExporting] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{ code: string; password: string } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Quick edit modal state
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErrors, setEditErrors] = useState<{ phone?: string; email?: string; shippingPhone?: string }>({});

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Bulk assign sales rep
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigningSaleId, setAssigningSaleId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Khi thay đổi bộ lọc hoặc từ khóa tìm kiếm, reset về trang 1
  const prevFiltersRef = useRef({ searchTerm, selectedGroup, onlyPending, onlyUnassigned, filterMissing });
  useEffect(() => {
    const cur = { searchTerm, selectedGroup, onlyPending, onlyUnassigned, filterMissing };
    if (JSON.stringify(prevFiltersRef.current) !== JSON.stringify(cur)) {
      prevFiltersRef.current = cur;
      setPage(1);
    }
  }, [searchTerm, selectedGroup, onlyPending, onlyUnassigned, filterMissing]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 4000);
  };

  const fetchCustomers = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLoadError(null);
    try {
      // 1. Tải danh sách nhân viên nếu chưa có
      if (staffList.length === 0) {
        const { data: staff } = await supabase
          .from('admin_profiles')
          .select('id, name, role')
          .eq('is_active', true)
          .order('name');
        if (staff) setStaffList(staff);
      }

      // 2. Query URL params (gửi page và limit xuống server)
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (searchTerm) params.set('search', searchTerm);
      if (selectedGroup) params.set('group', selectedGroup);
      if (onlyPending) params.set('onlyPending', '1');
      if (onlyUnassigned) params.set('unassigned', '1');
      if (filterMissing && filterMissing !== 'all') params.set('filterMissing', filterMissing);

      const res = await authFetch(`${apiBase}/api/admin/customers/list?${params.toString()}`, {
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Không tải được danh sách khách hàng');
      }

      setCustomers(json.customers || []);
      setTotalCustomers(json.total || 0);
      setTotalPages(json.totalPages || 1);
      if (json.stats) {
        setStats(json.stats);
      }
      if (Array.isArray(json.groups)) setGroups(json.groups);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Lỗi tải khách hàng:', err);
      setLoadError(err?.message || 'Không thể tải danh sách khách hàng');
    } finally {
      setLoading(false);
    }
  }, [apiBase, authFetch, filterMissing, onlyPending, onlyUnassigned, page, searchTerm, selectedGroup, staffList.length]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Nạp trước màn hình tạo/sửa khách khi trình duyệt rảnh. Danh sách vẫn hiện
  // ngay, nhưng lúc bấm "Thêm khách hàng" chunk đã nằm trong cache nên không
  // còn thêm một vòng chờ tải route riêng.
  useEffect(() => {
    let cancelled = false;
    const preload = () => {
      if (!cancelled) void import('./CustomerDetailPage');
    };
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const usesIdleCallback = typeof win.requestIdleCallback === 'function';
    const idleId = usesIdleCallback
      ? win.requestIdleCallback!(preload, { timeout: 1500 })
      : window.setTimeout(preload, 250);
    return () => {
      cancelled = true;
      if (usesIdleCallback && win.cancelIdleCallback) win.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, []);

  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));

  // Row selection
  const toggleSelectAll = () => {
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(customers.map((c) => c.id)));
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAssignSalesRep = async () => {
    if (!assigningSaleId) {
      alert('Vui lòng chọn nhân viên phụ trách');
      return;
    }
    if (selectedIds.size === 0) return;
    const staffName = staffMap.get(assigningSaleId) || 'nhân viên';
    if (!confirm(`Gán ${selectedIds.size} khách hàng đã chọn cho ${staffName}?`)) return;

    setAssigning(true);
    try {
      const res = await authFetch(`${apiBase}/api/admin/customers/assign-rep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerIds: Array.from(selectedIds),
          salesRepId: assigningSaleId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không thể phân công nhân viên');
      }

      showToast(`Đã gán thành công ${data.affectedRows} khách hàng cho ${data.salesRepName || staffName}`);
      setSelectedIds(new Set());
      setAssigningSaleId('');
      fetchCustomers();
    } catch (err: any) {
      showToast(err.message || 'Không thể thực hiện', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await authFetch(`${apiBase}/api/admin/customers/export`);
      if (!res.ok) throw new Error('Không xuất được danh sách khách hàng');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `danh-sach-khach-hang_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Đã xuất file Excel danh sách khách hàng thành công');
    } catch (err: any) {
      showToast(err.message || 'Không xuất được danh sách khách hàng', 'error');
    } finally {
      setExporting(false);
    }
  };

  const resetCustomerPassword = async (customer: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Reset mật khẩu cho ${customer.name} (${customer.partner_code})?\nMật khẩu hiện tại sẽ không còn sử dụng được.`)) return;
    try {
      const res = await authFetch(`${apiBase}/api/admin/customers/${customer.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không reset được mật khẩu');
      setPasswordCopied(false);
      setTemporaryPassword({ code: data.partnerCode, password: String(data.temporaryPassword || '') });
    } catch (err: any) {
      showToast(err.message || 'Không reset được mật khẩu', 'error');
    }
  };

  const deleteCustomer = async (customer: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Xóa vĩnh viễn khách hàng ${customer.name} (${customer.partner_code})?\n\nChỉ khách chưa có đơn hàng mới xóa được. Nếu đã giao dịch, hãy vào Sửa để khóa tài khoản.`)) return;
    try {
      const res = await authFetch(`${apiBase}/api/admin/customers/${customer.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Không xóa được khách hàng');
      showToast(`Đã xóa khách hàng ${customer.name}`);
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(customer.id);
        return next;
      });
      fetchCustomers();
    } catch (err: any) {
      showToast('Không thể xóa: ' + (err.message || 'Đã xảy ra lỗi'), 'error');
    }
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword?.password) return;
    const credentials = `Mã khách hàng: ${temporaryPassword.code}\nMật khẩu tạm: ${temporaryPassword.password}`;
    try {
      await navigator.clipboard.writeText(credentials);
      setPasswordCopied(true);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = credentials;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (copied) setPasswordCopied(true);
      else alert(credentials);
    }
  };

  // Quick edit handlers
  const openQuickEdit = (customer: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      company: customer.company || '',
      customer_group: customer.customer_group || '',
      default_shipping_name: customer.default_shipping_name || customer.name || '',
      default_shipping_phone: customer.default_shipping_phone || customer.phone || '',
      default_shipping_address: customer.default_shipping_address || customer.address || '',
    });
    setEditErrors({});
  };

  const handleEditFieldChange = (key: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    const errors = { ...editErrors };

    if (key === 'phone') {
      const val = value.trim();
      if (val && !isValidVietnamesePhone(val)) {
        errors.phone = 'Số điện thoại không đúng chuẩn Việt Nam (10 số, ví dụ 0901234567 hoặc cố định 028...)';
      } else {
        delete errors.phone;
      }
    }
    if (key === 'shippingPhone') {
      const val = value.trim();
      if (val && !isValidVietnamesePhone(val)) {
        errors.shippingPhone = 'SĐT người nhận không đúng chuẩn Việt Nam';
      } else {
        delete errors.shippingPhone;
      }
    }
    if (key === 'email') {
      const val = value.trim();
      if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors.email = 'Email không đúng định dạng';
      } else {
        delete errors.email;
      }
    }

    setEditErrors(errors);
  };

  const handleSaveQuickEdit = async () => {
    if (!editingCustomer) return;

    // Validate
    const errors: { phone?: string; email?: string; shippingPhone?: string } = {};
    if (editForm.phone?.trim() && !isValidVietnamesePhone(editForm.phone.trim())) {
      errors.phone = 'Số điện thoại không đúng chuẩn Việt Nam';
    }
    if (editForm.default_shipping_phone?.trim() && !isValidVietnamesePhone(editForm.default_shipping_phone.trim())) {
      errors.shippingPhone = 'SĐT người nhận không đúng chuẩn Việt Nam';
    }
    if (editForm.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())) {
      errors.email = 'Email không đúng định dạng';
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setSavingEdit(true);
    try {
      const payload: Record<string, any> = {
        name: editForm.name.trim(),
        phone: editForm.phone?.trim() || null,
        email: editForm.email?.trim() || null,
        address: editForm.address?.trim() || null,
        company: editForm.company?.trim() || null,
        customer_group: editForm.customer_group?.trim() || null,
        default_shipping_name: editForm.default_shipping_name?.trim() || null,
        default_shipping_phone: editForm.default_shipping_phone?.trim() || null,
        default_shipping_address: editForm.default_shipping_address?.trim() || null,
      };

      const res = await authFetch(`${apiBase}/api/admin/customers/${editingCustomer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không cập nhật được khách hàng');
      }

      // Update state without full re-fetch for seamless UX
      setCustomers((current) =>
        current.map((c) => (c.id === editingCustomer.id ? { ...c, ...data.customer } : c))
      );

      showToast(`Đã cập nhật thông tin khách hàng "${data.customer.name}"`);
      setEditingCustomer(null);

      // Re-fetch to update stats correctly
      fetchCustomers();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu thông tin', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Helper to render customer completeness badge
  const renderReadinessBadge = (c: any) => {
    const hasPhone = Boolean(c.phone && String(c.phone).trim());
    const hasAddress = Boolean(c.address && String(c.address).trim());

    if (!hasPhone && !hasAddress) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
          <AlertCircle size={12} className="shrink-0 text-rose-500" /> Thiếu SĐT & Địa chỉ
        </span>
      );
    }
    if (!hasPhone) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full">
          <Smartphone size={12} className="shrink-0 text-rose-500" /> Thiếu SĐT
        </span>
      );
    }
    if (!hasAddress) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
          <MapPin size={12} className="shrink-0 text-amber-600" /> Thiếu địa chỉ
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 size={12} className="shrink-0 text-emerald-600" /> Đầy đủ
      </span>
    );
  };

  return (
    <div className="space-y-5 min-w-0 max-w-full">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border transition-all animate-in fade-in slide-in-from-top-2 text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertCircle size={18} className="text-rose-600" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 p-1 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản lý Khách hàng</h1>
          <p className="text-slate-500">
            {stats.total} khách hàng VIP · Đang hiển thị {customers.length} kết quả
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={exportExcel}
            disabled={exporting}
            className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"
          >
            <FileSpreadsheet size={16} /> {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          <button
            onMouseEnter={() => { void import('./CustomerDetailPage'); }}
            onFocus={() => { void import('./CustomerDetailPage'); }}
            onClick={() => navigate('/khach-hang/moi')}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 flex items-center gap-1.5 shadow-sm shadow-green-600/20"
          >
            <Plus size={16} /> Thêm khách hàng
          </button>
          <button
            onClick={fetchCustomers}
            className="p-2 border border-slate-200 bg-white text-slate-600 rounded-xl hover:bg-slate-50 shadow-sm"
            title="Tải lại"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* 4 Thẻ thống kê chuẩn bị dữ liệu (G3) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          onClick={() => setFilterMissing('all')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterMissing === 'all'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng khách hàng</span>
            <Users size={18} className={filterMissing === 'all' ? 'text-emerald-600' : 'text-slate-400'} />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.total}</div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span className="font-semibold text-emerald-600">{stats.complete}</span> đã đầy đủ hồ sơ
          </div>
        </button>

        <button
          onClick={() => setFilterMissing('missing_phone')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterMissing === 'missing_phone'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thiếu SĐT</span>
            <Smartphone size={18} className={filterMissing === 'missing_phone' ? 'text-rose-600' : 'text-slate-400'} />
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-2">{stats.missingPhone}</div>
          <div className="text-xs text-rose-600/80 mt-1">Chưa có số liên lạc đặt hàng</div>
        </button>

        <button
          onClick={() => setFilterMissing('missing_address')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterMissing === 'missing_address'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thiếu địa chỉ</span>
            <MapPin size={18} className={filterMissing === 'missing_address' ? 'text-amber-600' : 'text-slate-400'} />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">{stats.missingAddress}</div>
          <div className="text-xs text-amber-700/80 mt-1">Chưa có địa chỉ giao / xuất hóa đơn</div>
        </button>

        <button
          onClick={() => setFilterMissing('missing_both')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterMissing === 'missing_both'
              ? 'bg-red-50 border-red-300 ring-2 ring-red-500/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Thiếu cả hai</span>
            <AlertCircle size={18} className={filterMissing === 'missing_both' ? 'text-red-600' : 'text-slate-400'} />
          </div>
          <div className="text-2xl font-bold text-red-600 mt-2">{stats.missingBoth}</div>
          <div className="text-xs text-red-600/80 mt-1">Cần bổ sung gấp trước khi giao</div>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên, SĐT, mã KH, nhóm, email..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Lọc theo nhóm khách hàng */}
          {groups.length > 0 && (
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">-- Tất cả nhóm khách --</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setOnlyPending((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1.5 border transition-colors ${
              onlyPending ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ShieldAlert size={15} /> Chờ xác thực
          </button>
          <button
            onClick={() => setOnlyUnassigned((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1.5 border transition-colors ${
              onlyUnassigned ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Users size={15} /> Chưa phân công
          </button>
        </div>
      </div>

      {/* Thanh tác vụ gán người phụ trách hàng loạt */}
      {selectedIds.size > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-green-900 text-sm">
              Đã chọn {selectedIds.size} khách hàng
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-green-700 hover:underline"
            >
              (Bỏ chọn)
            </button>
            {selectedIds.size < customers.length && (
              <button
                onClick={selectAllFiltered}
                className="text-xs px-2.5 py-1 bg-green-200/70 hover:bg-green-200 text-green-900 rounded-lg font-medium transition-colors"
              >
                Chọn tất cả {customers.length} khách đang lọc
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-green-800 font-medium">Gán nhân viên phụ trách:</label>
            <select
              value={assigningSaleId}
              onChange={(e) => setAssigningSaleId(e.target.value)}
              className="border border-green-300 bg-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">-- Chọn nhân viên --</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
            <button
              disabled={assigning || !assigningSaleId}
              onClick={handleBulkAssignSalesRep}
              className="px-3.5 py-1.5 bg-green-700 text-white rounded-xl text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {assigning ? 'Đang gán...' : 'Gán hàng loạt'}
            </button>
          </div>
        </div>
      )}

      {/* Thông báo lỗi tải */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-red-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Không thể tải danh sách khách hàng</p>
              <p className="text-xs text-red-600 mt-0.5">{loadError}</p>
            </div>
          </div>
          <button
            onClick={fetchCustomers}
            className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw size={14} /> Thử lại
          </button>
        </div>
      )}

      {/* Bảng danh sách khách hàng */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        {/* Mobile View */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="text-center py-10 text-slate-500">Đang tải dữ liệu...</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={30} className="mx-auto mb-2 opacity-40" />
              Không tìm thấy khách hàng nào
            </div>
          ) : (
            customers.map((customer) => (
              <article
                key={customer.id}
                onClick={() => navigate(`/khach-hang/${customer.id}`)}
                className="p-4 space-y-3 active:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{customer.name}</p>
                    <p className="font-mono text-xs text-slate-500 mt-0.5">{customer.partner_code}</p>
                    {customer.company && <p className="text-xs text-slate-400 truncate mt-0.5">{customer.company}</p>}
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      TIER_COLORS[customer.discount_tier] || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {customer.discount_tier || 'VIP0'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {renderReadinessBadge(customer)}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      VERIFICATION_COLORS[customer.verification_status] || VERIFICATION_COLORS.pending
                    }`}
                  >
                    {VERIFICATION_LABELS[customer.verification_status] || 'Chờ xác thực'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block">Điện thoại</span>
                    <span className="text-slate-700 font-medium">
                      {customer.phone ? formatVietnamesePhone(customer.phone) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Phụ trách</span>
                    <span className="text-slate-700">{staffMap.get(customer.sales_rep_id) || 'Chưa phân công'}</span>
                  </div>
                </div>

                {customer.address && (
                  <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                    <MapPin size={12} className="shrink-0 text-slate-400" />
                    {customer.address}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => openQuickEdit(customer, e)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 flex items-center gap-1"
                  >
                    <Pencil size={13} /> Sửa nhanh
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => navigate(`/khach-hang/${customer.id}`)}
                      className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                      title="Chi tiết hồ sơ"
                    >
                      <UserCheck size={15} />
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={(e) => resetCustomerPassword(customer, e)}
                        className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100"
                        title="Reset mật khẩu"
                      >
                        <KeyRound size={15} />
                      </button>
                    )}
                    {user?.role === 'admin' && (
                      <button
                        onClick={(e) => deleteCustomer(customer, e)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                        title="Xóa khách hàng"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block max-w-full overflow-x-auto">
          <table className="min-w-[1150px] w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200/80">
              <tr>
                <th className="px-3 py-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={customers.length > 0 && selectedIds.size === customers.length}
                    onChange={toggleSelectAll}
                    className="rounded text-green-600 focus:ring-green-500"
                  />
                </th>
                <th className="px-4 py-3.5">Mã KH</th>
                <th className="px-4 py-3.5">Khách hàng & Doanh nghiệp</th>
                <th className="px-4 py-3.5">Số điện thoại</th>
                <th className="px-4 py-3.5">Hồ sơ</th>
                <th className="px-4 py-3.5">Phụ trách</th>
                <th className="px-4 py-3.5">Hạng</th>
                <th className="px-4 py-3.5 text-right">Hạn mức</th>
                <th className="px-4 py-3.5 text-center">Xác thực</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-slate-500">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-slate-400" />
                    Đang tải dữ liệu khách hàng...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    <Users size={32} className="mx-auto mb-2 opacity-40" />
                    Không tìm thấy khách hàng nào phù hợp
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => navigate(`/khach-hang/${customer.id}`)}
                    className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                      selectedIds.has(customer.id) ? 'bg-green-50/40' : ''
                    }`}
                  >
                    <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={(e) => toggleSelect(customer.id, e as any)}
                        className="rounded text-green-600 focus:ring-green-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs font-bold text-slate-700">{customer.partner_code}</div>
                    </td>
                    <td className="px-4 py-4 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-800 truncate">{customer.name}</p>
                        {customer.customer_group && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            {customer.customer_group}
                          </span>
                        )}
                      </div>
                      {customer.company && <p className="text-xs text-slate-400 truncate">{customer.company}</p>}
                      {customer.address ? (
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <MapPin size={11} className="shrink-0 text-slate-400" />
                          <span className="truncate">{customer.address}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-600 italic mt-0.5">Chưa có địa chỉ</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {customer.phone ? (
                        <span className="font-mono text-sm font-medium text-slate-800">
                          {formatVietnamesePhone(customer.phone)}
                        </span>
                      ) : (
                        <span className="text-xs text-rose-500 italic">Chưa có SĐT</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {renderReadinessBadge(customer)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {staffMap.get(customer.sales_rep_id) ? (
                        <span className="text-xs font-medium text-slate-700">
                          {staffMap.get(customer.sales_rep_id)}
                        </span>
                      ) : (
                        <span className="text-xs italic text-slate-400">Chưa phân công</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          TIER_COLORS[customer.discount_tier] || 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {customer.discount_tier || 'VIP0'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-slate-600 font-medium">
                      {money(customer.credit_limit)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          VERIFICATION_COLORS[customer.verification_status] || VERIFICATION_COLORS.pending
                        }`}
                      >
                        {VERIFICATION_LABELS[customer.verification_status] || 'Chờ xác thực'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end items-center gap-1.5">
                        <button
                          onClick={(e) => openQuickEdit(customer, e)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium flex items-center gap-1 transition-colors"
                          title="Sửa nhanh SĐT, địa chỉ, email"
                        >
                          <Pencil size={13} /> Sửa nhanh
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={(e) => resetCustomerPassword(customer, e)}
                            className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                            title="Reset mật khẩu"
                          >
                            <KeyRound size={15} />
                          </button>
                        )}
                        {user?.role === 'admin' && (
                          <button
                            onClick={(e) => deleteCustomer(customer, e)}
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            title="Xóa khách hàng"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang Server-side */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
            <div className="text-xs text-slate-500">
              Hiển thị trang {page} / {totalPages} ({totalCustomers} khách hàng)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 border border-slate-200 bg-white rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                title="Trang trước"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-semibold px-2">Trang {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 border border-slate-200 bg-white rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                title="Trang sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Sửa nhanh thông tin khách hàng (G3) */}
      {editingCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Sửa nhanh thông tin liên hệ & địa chỉ</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Khách hàng: <span className="font-semibold text-slate-700">{editingCustomer.name}</span> ({editingCustomer.partner_code})
                </p>
              </div>
              <button
                onClick={() => setEditingCustomer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tên khách hàng <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => handleEditFieldChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Công ty / Doanh nghiệp</label>
                  <input
                    type="text"
                    value={editForm.company || ''}
                    onChange={(e) => handleEditFieldChange('company', e.target.value)}
                    placeholder="Tên công ty hoặc cửa hàng"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Số điện thoại chính <span className="text-slate-400 font-normal">(10 số chuẩn VN)</span>
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone || ''}
                    onChange={(e) => handleEditFieldChange('phone', e.target.value)}
                    placeholder="0901234567"
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:outline-none ${
                      editErrors.phone
                        ? 'border-rose-300 ring-rose-500/20 focus:border-rose-500'
                        : 'border-slate-200 focus:ring-green-500/20 focus:border-green-500'
                    }`}
                  />
                  {editErrors.phone ? (
                    <p className="text-xs text-rose-500 mt-1">{editErrors.phone}</p>
                  ) : editForm.phone && isValidVietnamesePhone(editForm.phone) ? (
                    <p className="text-xs text-emerald-600 mt-1">Định dạng hiển thị: {formatVietnamesePhone(editForm.phone)}</p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email || ''}
                    onChange={(e) => handleEditFieldChange('email', e.target.value)}
                    placeholder="example@tps1.vn"
                    className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:outline-none ${
                      editErrors.email
                        ? 'border-rose-300 ring-rose-500/20 focus:border-rose-500'
                        : 'border-slate-200 focus:ring-green-500/20 focus:border-green-500'
                    }`}
                  />
                  {editErrors.email && <p className="text-xs text-rose-500 mt-1">{editErrors.email}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Địa chỉ giao dịch / Xuất hóa đơn
                </label>
                <input
                  type="text"
                  value={editForm.address || ''}
                  onChange={(e) => handleEditFieldChange('address', e.target.value)}
                  placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nhóm khách hàng</label>
                <input
                  type="text"
                  value={editForm.customer_group || ''}
                  onChange={(e) => handleEditFieldChange('customer_group', e.target.value)}
                  placeholder="Ví dụ: Đại lý, Nhà hàng, Bếp ăn công nghiệp..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Thông tin giao hàng mặc định
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tên người nhận</label>
                    <input
                      type="text"
                      value={editForm.default_shipping_name || ''}
                      onChange={(e) => handleEditFieldChange('default_shipping_name', e.target.value)}
                      placeholder="Người nhận tại điểm giao"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">SĐT người nhận</label>
                    <input
                      type="tel"
                      value={editForm.default_shipping_phone || ''}
                      onChange={(e) => handleEditFieldChange('shippingPhone', e.target.value)}
                      placeholder="SĐT liên hệ khi giao"
                      className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:outline-none ${
                        editErrors.shippingPhone
                          ? 'border-rose-300 ring-rose-500/20 focus:border-rose-500'
                          : 'border-slate-200 focus:ring-green-500/20 focus:border-green-500'
                      }`}
                    />
                    {editErrors.shippingPhone && (
                      <p className="text-xs text-rose-500 mt-1">{editErrors.shippingPhone}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Địa chỉ nhận hàng mặc định</label>
                  <input
                    type="text"
                    value={editForm.default_shipping_address || ''}
                    onChange={(e) => handleEditFieldChange('default_shipping_address', e.target.value)}
                    placeholder="Địa điểm kho/bếp nhận hàng"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 font-medium text-sm transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={savingEdit || Object.keys(editErrors).length > 0}
                onClick={handleSaveQuickEdit}
                className="px-5 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Đang lưu...
                  </>
                ) : (
                  <>
                    <Check size={16} /> Lưu thông tin
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Mật khẩu tạm thời */}
      {temporaryPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Đã reset mật khẩu</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Mã khách hàng: <b className="text-slate-700">{temporaryPassword.code}</b>
                </p>
              </div>
              <button
                onClick={() => setTemporaryPassword(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>
            <label className="block text-xs font-semibold text-slate-500 mt-5 mb-1.5">Mật khẩu tạm thời</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                data-temporary-password
                type="text"
                value={temporaryPassword.password}
                readOnly
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onFocus={(e) => e.currentTarget.select()}
                style={{ textTransform: 'none' }}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 font-mono text-base font-bold tracking-wide text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
              <button
                onClick={copyTemporaryPassword}
                title="Copy cả mã khách hàng và mật khẩu tạm"
                className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
                  passwordCopied ? 'bg-green-100 text-green-700' : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {passwordCopied ? <Check size={17} /> : <Copy size={17} />}{' '}
                {passwordCopied ? 'Đã copy' : 'Copy thông tin'}
              </button>
            </div>
            <p className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              Mật khẩu có phân biệt chữ hoa/chữ thường. Nút copy sẽ lấy cả mã khách hàng và mật khẩu tạm. Khách bắt buộc
              đổi mật khẩu ở lần đăng nhập tiếp theo.
            </p>
            <button
              onClick={() => setTemporaryPassword(null)}
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
