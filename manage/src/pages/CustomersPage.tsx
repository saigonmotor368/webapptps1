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
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  // Khách tự đăng ký qua web/Mini App luôn "Chờ xác thực" (luồng cũ) — lọc
  // nhanh để nhân viên không bỏ sót khách mới cần xác minh (mục brief
  // 2026-09-11: tránh khách đặt đơn ảo).
  const [onlyPending, setOnlyPending] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      if (user?.role === 'sale' && user.id && user.id !== 'legacy-admin') {
        // Sale chỉ thấy khách được giao cho mình — cùng quy tắc với PosCreatePage.
        const { data } = await supabase
          .from('vip_accounts')
          .select('id, partner_code, name, phone, company, discount_tier, credit_limit, is_active, verification_status')
          .eq('sales_rep_id', user.id)
          .order('name');
        setCustomers(data || []);
      } else {
        const { data } = await supabase.rpc('admin_list_customers');
        setCustomers(data || []);
      }
    } catch (err) {
      console.error('Lỗi tải khách hàng:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const pendingCount = customers.filter((c) => (c.verification_status || 'pending') === 'pending').length;
  const filteredCustomers = customers.filter((c) => {
    const hay = [c.name, c.phone, c.partner_code, c.company].filter(Boolean).join(' ').toLowerCase();
    if (onlyPending && (c.verification_status || 'pending') !== 'pending') return false;
    return !searchTerm || hay.includes(searchTerm.toLowerCase());
  });

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
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Tìm theo tên, SĐT, mã KH..." className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
            />
          </div>
          <button onClick={() => setOnlyPending((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 border ${onlyPending ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <ShieldAlert size={16} /> Chờ xác thực {pendingCount > 0 && `(${pendingCount})`}
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-4">Mã KH</th>
                <th className="px-4 py-4">Khách hàng</th>
                <th className="px-4 py-4">SĐT</th>
                <th className="px-4 py-4">Hạng</th>
                <th className="px-4 py-4 text-right">Hạn mức công nợ</th>
                <th className="px-4 py-4 text-center">Xác thực</th>
                <th className="px-4 py-4 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-500">Đang tải dữ liệu...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <Users size={32} className="mx-auto mb-2 opacity-40" />
                    Không tìm thấy khách hàng nào
                  </td>
                </tr>
              ) : filteredCustomers.map((customer) => (
                <tr key={customer.id} onClick={() => navigate(`/khach-hang/${customer.id}`)} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                  <td className="px-4 py-4 text-slate-500 font-mono text-xs">{customer.partner_code}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-800">{customer.name}</p>
                    {customer.company && <p className="text-xs text-slate-400">{customer.company}</p>}
                  </td>
                  <td className="px-4 py-4 text-slate-500">{customer.phone}</td>
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
