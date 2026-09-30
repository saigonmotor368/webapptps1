import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, UserPlus, RefreshCw, Search, ShieldAlert,
  CheckCircle2, AlertCircle, Pencil, X, Check, Eye, EyeOff,
  Building2, Lock, Unlock, Mail, Shield
} from 'lucide-react';

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị hệ thống',
  ban_giam_doc: 'Ban Giám đốc',
  truong_phong: 'Trưởng phòng',
  sale: 'NV Vận hành',
  thu_mua: 'Thu mua',
  kho: 'Kho / Soạn hàng',
  ke_toan: 'Kế toán',
  tai_xe: 'Tài xế',
};

function accessLabel(user: Pick<AdminUser, 'role' | 'position'>): string {
  if (user.role === 'ban_giam_doc' || user.position === 'ban_giam_doc') return 'Ban Giám đốc';
  if (user.position === 'quan_tri_he_thong') return 'Quản trị hệ thống';
  return ROLE_LABELS[user.role] || user.role;
}

export const POSITION_LABELS: Record<string, string> = {
  nhan_vien: 'Nhân viên',
  tro_ly: 'Trợ lý',
  truong_nhom: 'Trưởng nhóm',
  truong_phong: 'Trưởng phòng',
  ban_giam_doc: 'Ban giám đốc',
  quan_tri_he_thong: 'Quản trị hệ thống',
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: 'bg-red-50 text-red-700 border-red-200',
  ban_giam_doc: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  truong_phong: 'bg-purple-50 text-purple-700 border-purple-200',
  sale: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  thu_mua: 'bg-blue-50 text-blue-700 border-blue-200',
  kho: 'bg-amber-50 text-amber-700 border-amber-200',
  ke_toan: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  tai_xe: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

interface Department {
  id: string;
  code: string;
  name: string;
  function_group: string;
  is_active: boolean;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  position: string;
  department_id: string | null;
  is_active: boolean;
  departments?: {
    id: string;
    code: string;
    name: string;
    function_group: string;
  } | null;
}

export default function UsersPage() {
  const { user, authFetch } = useAuth();
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'sale',
    position: 'nhan_vien',
    departmentId: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    role: 'sale',
    position: 'nhan_vien',
    departmentId: '',
    isActive: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 4000);
  };

  const departmentByGroup = (group: string) =>
    departments.find((department) => department.function_group === group)?.id || '';

  const changeAddRole = (role: string) => {
    if (role === 'ban_giam_doc') {
      setAddForm({ ...addForm, role, position: 'ban_giam_doc', departmentId: departmentByGroup('executive') });
      return;
    }
    if (role === 'admin') {
      setAddForm({ ...addForm, role, position: 'quan_tri_he_thong', departmentId: '' });
      return;
    }
    setAddForm({ ...addForm, role });
  };

  const changeEditRole = (role: string) => {
    if (role === 'ban_giam_doc') {
      setEditForm({ ...editForm, role, position: 'ban_giam_doc', departmentId: departmentByGroup('executive') });
      return;
    }
    if (role === 'admin') {
      setEditForm({ ...editForm, role, position: 'quan_tri_he_thong', departmentId: '' });
      return;
    }
    setEditForm({ ...editForm, role });
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authFetch(`${apiBase}/api/admin/users`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không tải được danh sách nhân viên');
      }
      setUsers(data.users || []);
      setDepartments(data.departments || []);
    } catch (err: any) {
      console.error('Lỗi tải danh sách nhân viên:', err);
      setLoadError(err.message || 'Lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [apiBase, authFetch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Compute stats
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.is_active).length;
    const missingDept = users.filter((u) => u.is_active && !u.department_id && u.role !== 'admin').length;
    return { total, active, missingDept, totalDepts: departments.length };
  }, [users, departments]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Search
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const hay = `${u.name || ''} ${u.email || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      // Department filter
      if (selectedDept === 'missing') {
        if (u.department_id) return false;
      } else if (selectedDept !== 'all') {
        if (u.department_id !== selectedDept) return false;
      }
      // Role filter
      if (selectedRole !== 'all' && u.role !== selectedRole) return false;
      // Status filter
      if (selectedStatus === 'active' && !u.is_active) return false;
      if (selectedStatus === 'inactive' && u.is_active) return false;

      return true;
    });
  }, [users, searchTerm, selectedDept, selectedRole, selectedStatus]);

  // Check admin guard
  if (user?.role !== 'admin') {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Quyền truy cập bị từ chối</h2>
        <p className="text-slate-600 text-sm">
          Màn hình &quot;Nhân viên & phân quyền&quot; chỉ dành cho tài khoản Quản trị hệ thống (Admin).
        </p>
      </div>
    );
  }

  // Handle Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password) {
      setAddError('Vui lòng điền đầy đủ họ tên, email và mật khẩu');
      return;
    }
    if (addForm.password.length < 6) {
      setAddError('Mật khẩu phải có tối thiểu 6 ký tự');
      return;
    }
    if (addForm.role !== 'admin' && !addForm.departmentId) {
      setAddError('Vui lòng chọn phòng ban cho nhân viên');
      return;
    }

    setAdding(true);
    try {
      const res = await authFetch(`${apiBase}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          email: addForm.email.trim().toLowerCase(),
          password: addForm.password,
          role: addForm.role,
          position: addForm.position,
          departmentId: addForm.departmentId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không thể tạo nhân viên');
      }

      showToast(`Đã tạo tài khoản cho nhân viên "${data.user?.name}" thành công`);
      setShowAddModal(false);
      setAddForm({
        name: '',
        email: '',
        password: '',
        role: 'sale',
        position: 'nhan_vien',
        departmentId: '',
      });
      fetchUsers();
    } catch (err: any) {
      setAddError(err.message || 'Lỗi khi tạo nhân viên');
    } finally {
      setAdding(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (targetUser: AdminUser) => {
    setEditingUser(targetUser);
    setEditForm({
      role: targetUser.role,
      position: targetUser.position || 'nhan_vien',
      departmentId: targetUser.department_id || '',
      isActive: targetUser.is_active,
    });
    setEditError(null);
  };

  // Handle Save Edit
  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setEditError(null);

    if (editForm.role !== 'admin' && !editForm.departmentId) {
      setEditError('Nhân viên nghiệp vụ bắt buộc phải gán phòng ban');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await authFetch(`${apiBase}/api/admin/users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          role: editForm.role,
          position: editForm.position,
          departmentId: editForm.departmentId || null,
          isActive: editForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không cập nhật được nhân viên');
      }

      showToast(`Đã cập nhật thông tin nhân viên "${editingUser.name}"`);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setEditError(err.message || 'Lỗi khi lưu thông tin');
    } finally {
      setSavingEdit(false);
    }
  };

  // Quick toggle active
  const handleToggleActive = async (targetUser: AdminUser, e: React.MouseEvent) => {
    e.stopPropagation();
    const action = targetUser.is_active ? 'Khóa' : 'Kích hoạt';
    if (!confirm(`Bạn có chắc muốn ${action.toLowerCase()} tài khoản "${targetUser.name}"?`)) return;

    try {
      const res = await authFetch(`${apiBase}/api/admin/users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUser.id,
          isActive: !targetUser.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không thể thay đổi trạng thái tài khoản');
      }
      showToast(`Đã ${action.toLowerCase()} tài khoản "${targetUser.name}"`);
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thao tác', 'error');
    }
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
          <h1 className="text-2xl font-bold text-slate-800">Nhân viên & Phân quyền</h1>
          <p className="text-slate-500 text-sm">
            Quản lý tài khoản đăng nhập nội bộ, vai trò nghiệp vụ, chức vụ và phân công phòng ban.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 flex items-center gap-1.5 shadow-sm shadow-green-600/20"
          >
            <UserPlus size={16} /> Thêm nhân viên mới
          </button>
          <button
            onClick={fetchUsers}
            className="p-2 border border-slate-200 bg-white text-slate-600 rounded-xl hover:bg-slate-50 shadow-sm"
            title="Tải lại dữ liệu"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Thẻ thống kê tổng quan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Tổng nhân sự</span>
            <Users size={17} className="text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.total}</div>
          <div className="text-xs text-slate-500 mt-1">Tài khoản trong hệ thống</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Đang hoạt động</span>
            <CheckCircle2 size={17} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{stats.active}</div>
          <div className="text-xs text-slate-500 mt-1">Được phép đăng nhập</div>
        </div>

        <button
          onClick={() => setSelectedDept('missing')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedDept === 'missing'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Chưa gán phòng ban</span>
            <AlertCircle size={17} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">{stats.missingDept}</div>
          <div className="text-xs text-amber-700/80 mt-1">Bấm để lọc danh sách</div>
        </button>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Phòng ban</span>
            <Building2 size={17} className="text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.totalDepts}</div>
          <div className="text-xs text-slate-500 mt-1">Cơ cấu phòng ban TPS1</div>
        </div>
      </div>

      {/* Cảnh báo tài khoản chưa gán phòng ban (G4) */}
      {stats.missingDept > 0 && (
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-start sm:items-center justify-between gap-3 text-amber-900 animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-semibold text-sm">
                Phát hiện {stats.missingDept} tài khoản đang hoạt động nhưng chưa được phân công phòng ban
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Vui lòng bấm &quot;Sửa&quot; trên từng tài khoản để gán phòng ban, giúp đảm bảo luồng phê duyệt và báo cáo vận hành.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedDept('missing')}
            className="px-3 py-1.5 bg-amber-200/80 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-semibold shrink-0 transition-colors"
          >
            Lọc ngay ({stats.missingDept})
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo họ tên hoặc email đăng nhập..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Lọc theo phòng ban */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">-- Tất cả phòng ban --</option>
            <option value="missing">⚠️ Chưa gán phòng ban</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>

          {/* Lọc theo vai trò */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">-- Tất cả vai trò --</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          {/* Lọc theo trạng thái */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">-- Tất cả trạng thái --</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
        </div>
      </div>

      {/* Lỗi tải */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between text-red-800">
          <p className="text-sm">{loadError}</p>
          <button onClick={fetchUsers} className="text-xs font-semibold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* Danh sách nhân viên */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        {/* Mobile View */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="text-center py-10 text-slate-500">Đang tải dữ liệu...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              Không tìm thấy nhân viên nào phù hợp
            </div>
          ) : (
            filteredUsers.map((u) => (
              <article key={u.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">{u.name}</h3>
                    <p className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                      <Mail size={12} className="text-slate-400" /> {u.email}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {u.is_active ? 'Hoạt động' : 'Đã khóa'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-full font-semibold border ${
                      ROLE_BADGE_COLORS[u.role] || 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {accessLabel(u)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {POSITION_LABELS[u.position] || u.position || 'Nhân viên'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-400 block mb-1">Phòng ban</span>
                  {u.departments?.name ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                      <Building2 size={13} className="text-slate-500" />
                      {u.departments.name} ({u.departments.code})
                    </span>
                  ) : u.role === 'admin' ? (
                    <span className="text-xs text-slate-400 italic">Quản trị toàn quyền</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <AlertCircle size={12} className="text-amber-500" /> Chưa gán phòng ban
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-50">
                  <button
                    onClick={() => openEditModal(u)}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 flex items-center gap-1"
                  >
                    <Pencil size={13} /> Sửa
                  </button>
                  <button
                    onClick={(e) => handleToggleActive(u, e)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                      u.is_active ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {u.is_active ? <Lock size={13} /> : <Unlock size={13} />}
                    {u.is_active ? 'Khóa' : 'Kích hoạt'}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block max-w-full overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200/80">
              <tr>
                <th className="px-5 py-3.5">Họ và tên & Email</th>
                <th className="px-4 py-3.5">Vai trò nghiệp vụ</th>
                <th className="px-4 py-3.5">Chức vụ</th>
                <th className="px-4 py-3.5">Phòng ban</th>
                <th className="px-4 py-3.5 text-center">Trạng thái</th>
                <th className="px-5 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-slate-400" />
                    Đang tải danh sách nhân viên...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <Users size={32} className="mx-auto mb-2 opacity-40" />
                    Không tìm thấy nhân viên nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                        <Mail size={11} className="text-slate-400" />
                        {u.email}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          ROLE_BADGE_COLORS[u.role] || 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <Shield size={12} />
                        {accessLabel(u)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                        {POSITION_LABELS[u.position] || u.position || 'Nhân viên'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {u.departments?.name ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <Building2 size={14} className="text-slate-400" />
                          <span>{u.departments.name}</span>
                          <span className="font-mono text-slate-400 text-[11px]">({u.departments.code})</span>
                        </div>
                      ) : u.role === 'admin' ? (
                        <span className="text-xs text-slate-400 italic">Quản trị toàn quyền</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                          <AlertCircle size={13} className="text-amber-500" /> Chưa gán phòng ban
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}
                        />
                        {u.is_active ? 'Đang hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium flex items-center gap-1 transition-colors"
                        >
                          <Pencil size={13} /> Sửa
                        </button>
                        <button
                          onClick={(e) => handleToggleActive(u, e)}
                          className={`p-1.5 rounded-lg text-xs transition-colors ${
                            u.is_active
                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                          title={u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                        >
                          {u.is_active ? <Lock size={15} /> : <Unlock size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm nhân viên mới (G4) */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-100 text-green-700 flex items-center justify-center">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Thêm nhân viên mới</h2>
                  <p className="text-xs text-slate-500">Tạo tài khoản đăng nhập nội bộ TPS1</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 overflow-y-auto space-y-4 text-sm flex-1">
              {addError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-500" />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Họ và tên nhân viên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Email đăng nhập <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="nhanvien@tps1.vn"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Mật khẩu khởi tạo <span className="text-rose-500">*</span>
                  <span className="text-slate-400 font-normal"> (tối thiểu 6 ký tự)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    placeholder="Nhập mật khẩu an toàn..."
                    className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Vai trò nghiệp vụ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={addForm.role}
                    onChange={(e) => changeAddRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Chức vụ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={addForm.position}
                    onChange={(e) => setAddForm({ ...addForm, position: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  >
                    {Object.entries(POSITION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Phòng ban phân công {addForm.role !== 'admin' && <span className="text-rose-500">*</span>}
                </label>
                <select
                  value={addForm.departmentId}
                  onChange={(e) => setAddForm({ ...addForm, departmentId: e.target.value })}
                  className={`w-full px-3 py-2 border bg-white rounded-xl focus:ring-2 focus:outline-none ${
                    addForm.role !== 'admin' && !addForm.departmentId
                      ? 'border-amber-300 focus:border-amber-500'
                      : 'border-slate-200 focus:border-green-500'
                  }`}
                >
                  <option value="">-- Chọn phòng ban --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                {addForm.role !== 'admin' ? (
                  <p className="text-[11px] text-amber-600 mt-1">
                    * Bắt buộc chọn phòng ban đối với nhân viên nghiệp vụ
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tài khoản Quản trị viên (Admin) có thể để trống phòng ban
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium text-sm transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-5 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {adding ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" /> Đang tạo...
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Tạo tài khoản
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sửa nhân viên (G4) */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Pencil size={17} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Cập nhật thông tin nhân viên</h2>
                  <p className="text-xs text-slate-500">
                    {editingUser.name} · <span className="font-mono">{editingUser.email}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm flex-1">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-500" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <div className="text-xs font-semibold text-slate-500">Tài khoản nhân viên</div>
                <div className="font-bold text-slate-800">{editingUser.name}</div>
                <div className="text-xs text-slate-600 font-mono">{editingUser.email}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Vai trò nghiệp vụ</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => changeEditRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Chức vụ</label>
                  <select
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  >
                    {Object.entries(POSITION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Phòng ban phân công {editForm.role !== 'admin' && <span className="text-rose-500">*</span>}
                </label>
                <select
                  value={editForm.departmentId}
                  onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
                  className={`w-full px-3 py-2 border bg-white rounded-xl focus:ring-2 focus:outline-none ${
                    editForm.role !== 'admin' && !editForm.departmentId
                      ? 'border-amber-300 focus:border-amber-500'
                      : 'border-slate-200 focus:border-green-500'
                  }`}
                >
                  <option value="">-- Chưa gán phòng ban --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                {editForm.role !== 'admin' && !editForm.departmentId && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    * Lưu ý: Cần gán phòng ban cho nhân viên nghiệp vụ
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Trạng thái tài khoản</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={editForm.isActive === true}
                      onChange={() => setEditForm({ ...editForm, isActive: true })}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-emerald-700">Đang hoạt động</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={editForm.isActive === false}
                      onChange={() => setEditForm({ ...editForm, isActive: false })}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm font-medium text-slate-600">Khóa tài khoản</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 font-medium text-sm transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Đang lưu...
                  </>
                ) : (
                  <>
                    <Check size={16} /> Lưu thay đổi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
