import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, RefreshCw, Users, Plus, FileSpreadsheet, ShieldAlert } from 'lucide-react';

const TIER_COLORS: Record<string, string> = {
  VIP0: 'bg-slate-100 text-slate-600',
  VIP1: 'bg-sky-100 text-sky-700',
  VIP2: 'bg-blue-100 text-blue-700',
  VIP3: 'bg-purple-100 text-purple-700',
  CUSTOM: 'bg-amber-100 text-amber-700',
};
const VERIFICATION_LABELS: Record<string, string> = { pending: 'Chờ xác thực', verified: 'Đã xác thực', rejected: 'Đã từ chối' };
const VERIFICATION_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }

// LƯU Ý (2026-09-10): trang này trước đây đọc bảng "leads" (khách tiềm năng
// điền form yêu cầu báo giá trên website — vẫn còn dùng, KHÔNG xóa/đụng tới,
// quản lý ở quanly/Kanban) và bị đặt tên "Quản lý Khách hàng" gây lẫn lộn.
// Theo đúng kiến trúc đã chốt (mục 4 kế hoạch): 1 khi khách có tài khoản
// chính thức (mua hàng thật, có công nợ/hạng giá) thì họ nằm ở vip_accounts,
// tách hẳn khỏi leads. Trang "Quản lý Khách hàng" trong sale-webapp phải
// hiện đúng khách VIP thật (vip_accounts), không phải leads.
//
// Cập nhật (mục brief 2026-09-10): trước đây chỉ xem danh sách, không sửa/
// không thống kê được gì ("như đồ chơi chả làm gì"). Giờ bấm vào 1 dòng mở
// CustomerDetailPage để sửa thông tin/MK/hạng/chiết khấu/bảng giá riêng +
// xem thống kê đơn/công nợ; có nút thêm khách mới + xuất Excel toàn bộ.
export default function CustomersPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  const [customers, setCustomers] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyMissingContact, setOnlyMissingContact] = useState(false);

  // Chọn hàng loạt để gán người phụ trách (WP2b - G1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigningSaleId, setAssigningSaleId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Tải danh sách nhân viên để hiển thị tên và phân công
      const { data: staff } = await supabase
        .from('admin_profiles')
        .select('id, name, role')
        .eq('is_active', true)
        .order('name');
      setStaffList(staff || []);

      // 2. Tải khách hàng qua API backend (dùng service-role + can() kiểm quyền theo G1)
      const res = await fetch(`${apiBase}/api/admin/customers/list?all=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Không tải được danh sách khách hàng');
      }
      setCustomers(json.customers || []);
      if (Array.isArray(json.groups)) setGroups(json.groups);
    } catch (err: any) {
      console.error('Lỗi tải khách hàng:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const pendingCount = customers.filter((c) => (c.verification_status || 'pending') === 'pending').length;
  const unassignedCount = customers.filter((c) => !c.sales_rep_id).length;

  const filteredCustomers = customers.filter((c) => {
    const hay = [
      c.name,
      c.phone,
      c.partner_code,
      c.company,
      c.kiotviet_code,
      c.customer_group,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (onlyPending && (c.verification_status || 'pending') !== 'pending') return false;
    if (onlyUnassigned && c.sales_rep_id) return false;
    if (onlyMissingContact && (c.phone && c.address)) return false;
    if (selectedGroup && c.customer_group !== selectedGroup) return false;
    return !searchTerm || hay.includes(searchTerm.toLowerCase());
  });

  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCustomers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCustomers.map((c) => c.id)));
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredCustomers.map((c) => c.id)));
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
      const res = await fetch(`${apiBase}/api/admin/customers/assign-rep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerIds: Array.from(selectedIds),
          salesRepId: assigningSaleId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không thể phân công nhân viên');
      }

      alert(`✅ Đã gán thành công ${data.affectedRows} khách hàng cho ${data.salesRepName || staffName}`);
      setSelectedIds(new Set());
      setAssigningSaleId('');
      fetchCustomers();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể thực hiện'));
    } finally {
      setAssigning(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Không xuất được danh sách khách hàng');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `danh-sach-khach-hang_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không xuất được danh sách khách hàng'));
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản lý Khách hàng</h1>
          <p className="text-slate-500">{customers.length} khách hàng VIP · đang hiển thị {filteredCustomers.length}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Tìm theo tên, SĐT, mã KV, nhóm..." className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
            />
          </div>

          {/* Lọc theo nhóm khách hàng KiotViet */}
          {groups.length > 0 && (
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">-- Tất cả nhóm khách --</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}

          <button onClick={() => setOnlyPending((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 border ${onlyPending ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <ShieldAlert size={16} /> Chờ xác thực {pendingCount > 0 && `(${pendingCount})`}
          </button>
          <button onClick={() => setOnlyUnassigned((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 border ${onlyUnassigned ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <Users size={16} /> Chưa phân công {unassignedCount > 0 && `(${unassignedCount})`}
          </button>
          <button onClick={() => setOnlyMissingContact((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 border ${onlyMissingContact ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            Thiếu SĐT/Địa chỉ
          </button>
          <button onClick={exportExcel} disabled={exporting}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5">
            <FileSpreadsheet size={16} /> {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          <button onClick={() => navigate('/khach-hang/moi')}
            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5">
            <Plus size={16} /> Thêm khách hàng
          </button>
          <button onClick={fetchCustomers} className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50" title="Tải lại">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Thanh tác vụ gán người phụ trách hàng loạt */}
      {selectedIds.size > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
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
            {selectedIds.size < filteredCustomers.length && (
              <button
                onClick={selectAllFiltered}
                className="text-xs px-2.5 py-1 bg-green-200/70 hover:bg-green-200 text-green-900 rounded font-medium transition-colors"
              >
                Chọn tất cả {filteredCustomers.length} khách đang lọc
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-green-800 font-medium">Gán nhân viên phụ trách:</label>
            <select
              value={assigningSaleId}
              onChange={(e) => setAssigningSaleId(e.target.value)}
              className="border border-green-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
              className="px-3 py-1.5 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {assigning ? 'Đang gán...' : 'Gán hàng loạt'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-3 py-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredCustomers.length > 0 && selectedIds.size === filteredCustomers.length}
                    onChange={toggleSelectAll}
                    className="rounded text-green-600 focus:ring-green-500"
                  />
                </th>
                <th className="px-4 py-4">Mã KH</th>
                <th className="px-4 py-4">Khách hàng</th>
                <th className="px-4 py-4">SĐT</th>
                <th className="px-4 py-4">Người phụ trách</th>
                <th className="px-4 py-4">Hạng</th>
                <th className="px-4 py-4 text-right">Hạn mức công nợ</th>
                <th className="px-4 py-4 text-center">Xác thực</th>
                <th className="px-4 py-4 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-500">Đang tải dữ liệu...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <Users size={32} className="mx-auto mb-2 opacity-40" />
                    Không tìm thấy khách hàng nào
                  </td>
                </tr>
              ) : filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => navigate(`/khach-hang/${customer.id}`)}
                  className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${
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
                    <div className="font-mono text-xs font-semibold text-slate-700">{customer.partner_code}</div>
                    {customer.kiotviet_code && (
                      <div className="text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded inline-block mt-0.5 font-mono">
                        KV: {customer.kiotviet_code}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-slate-800">{customer.name}</p>
                      {customer.customer_group && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                          {customer.customer_group}
                        </span>
                      )}
                    </div>
                    {customer.company && <p className="text-xs text-slate-400">{customer.company}</p>}
                    <div className="flex gap-1.5 mt-1">
                      {!customer.phone && (
                        <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-200 px-1 rounded">
                          Thiếu SĐT
                        </span>
                      )}
                      {!customer.address && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1 rounded">
                          Thiếu địa chỉ
                        </span>
                      )}
                      {customer.kiotviet_opening_debt != null && Number(customer.kiotviet_opening_debt) !== 0 && (
                        <span className="text-[10px] text-slate-500">
                          Nợ KV: {money(customer.kiotviet_opening_debt)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-500">{customer.phone || '---'}</td>
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
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${TIER_COLORS[customer.discount_tier] || 'bg-slate-100 text-slate-600'}`}>
                      {customer.discount_tier || 'VIP0'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-slate-600">{money(customer.credit_limit)}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${VERIFICATION_COLORS[customer.verification_status] || VERIFICATION_COLORS.pending}`}>
                      {VERIFICATION_LABELS[customer.verification_status] || 'Chờ xác thực'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${customer.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {customer.is_active ? 'Hoạt động' : 'Khóa'}
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
