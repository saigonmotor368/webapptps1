import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Save, KeyRound, Lock, Unlock, ShoppingBag, Wallet, Clock,
  Trash2, Plus, Search as SearchIcon, RefreshCw, MapPin, Star, ShieldCheck, ShieldAlert, ShieldX,
  FileSpreadsheet, Download, X, CheckCircle2, CalendarClock,
} from 'lucide-react';

function money(v: number) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(v) || 0)) + 'đ'; }
function dt(v: string) { return v ? new Date(v).toLocaleDateString('vi-VN') : '—'; }
function dtFull(v: string) { return v ? new Date(v).toLocaleString('vi-VN') : '—'; }

const VERIFICATION_LABELS: Record<string, string> = { pending: 'Chờ xác thực', verified: 'Đã xác thực', rejected: 'Đã từ chối' };
const VERIFICATION_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};
const SOURCE_LABELS: Record<string, string> = { admin: 'Nhân viên tạo', website: 'Tự đăng ký (Website)', zalo_mini_app: 'Tự đăng ký (Mini App)' };

const TIERS = [
  { code: 'VIP0', label: 'VIP0 — Không chiết khấu' },
  { code: 'VIP1', label: 'VIP1' },
  { code: 'VIP2', label: 'VIP2' },
  { code: 'VIP3', label: 'VIP3' },
  { code: 'CUSTOM', label: 'CUSTOM — Chiết khấu riêng theo hợp đồng' },
];

// Trang chi tiết/sửa khách hàng — thay cho CustomersPage trước đây chỉ xem
// danh sách, không sửa/không thống kê được gì (mục brief 2026-09-10: "phần
// quản lý khách hàng như đồ chơi chả làm gì"). Dùng lại đúng các RPC
// admin_update_customer/admin_create_customer/admin_toggle_customer_active/
// admin_reset_customer_password đã có sẵn và đang chạy thật trong quanly
// (js/vip-accounts.js) — không tạo RPC mới, tránh trùng logic 2 nơi.
export default function CustomerDetailPage() {
  const { id } = useParams();
  const isNew = id === 'moi';
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';

  const [form, setForm] = useState<Record<string, any>>({ discount_tier: 'VIP0', credit_limit: 0 });
  const [salesReps, setSalesReps] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [contractPrices, setContractPrices] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);

  const [stats, setStats] = useState<{ orderCount: number; revenue: number; debt: number; lastOrderAt: string | null }>({ orderCount: 0, revenue: 0, debt: 0, lastOrderAt: null });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  // Nhiều địa chỉ giao hàng (mục 14.3-5 KE_HOACH) — khách công ty lớn giao
  // tới nhiều địa điểm khác nhau (xưởng/bếp/chi nhánh), khác với 1 địa chỉ
  // mặc định default_shipping_* ở trên.
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrForm, setAddrForm] = useState({ label: '', address: '', contact_name: '', contact_phone: '' });
  const [savingAddress, setSavingAddress] = useState(false);

  const setField = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const loadSalesReps = useCallback(async () => {
    const { data } = await supabase.from('admin_profiles').select('id, name, role').eq('is_active', true).order('name');
    setSalesReps(data || []);
  }, []);

  const loadCustomer = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc('admin_list_customers');
      const found = (data || []).find((c: any) => c.id === id);
      if (!found) { alert('Không tìm thấy khách hàng'); navigate('/khach-hang'); return; }
      setForm(found);
    } finally { setLoading(false); }
  }, [id, isNew, navigate]);

  const loadContractPrices = useCallback(async () => {
    if (isNew || !id) return;
    const { data } = await supabase
      .from('customer_contract_prices')
      .select('product_id, price, valid_until, products(name, sku, unit, price_retail, price_wholesale)')
      .eq('customer_id', id);
    setContractPrices(data || []);
  }, [id, isNew]);

  const loadStats = useCallback(async () => {
    if (isNew || !id) return;
    const { data } = await supabase
      .from('orders')
      .select('id, grand_total, paid_amount, debt_amount, status, created_at, order_code, item_count')
      .eq('customer_id', id)
      .order('created_at', { ascending: false });
    const list = data || [];
    const nonCanceled = list.filter((o: any) => o.status !== 'canceled');
    setStats({
      orderCount: nonCanceled.length,
      revenue: nonCanceled.reduce((s: number, o: any) => s + (Number(o.grand_total) || 0), 0),
      debt: nonCanceled.reduce((s: number, o: any) => s + (o.debt_amount != null ? Number(o.debt_amount) : Math.max(0, Number(o.grand_total) - Number(o.paid_amount || 0))), 0),
      lastOrderAt: list[0]?.created_at || null,
    });
    setRecentOrders(list.slice(0, 10));
  }, [id, isNew]);

  const loadAddresses = useCallback(async () => {
    if (isNew || !id) return;
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', id)
      .order('is_default', { ascending: false })
      .order('created_at');
    if (error) { console.warn('Chưa chạy migration customer_addresses:', error.message); return; }
    setAddresses(data || []);
  }, [id, isNew]);

  useEffect(() => { loadSalesReps(); }, [loadSalesReps]);
  useEffect(() => { loadCustomer(); loadContractPrices(); loadStats(); loadAddresses(); }, [loadCustomer, loadContractPrices, loadStats, loadAddresses]);

  const addAddress = async () => {
    if (!addrForm.label.trim() || !addrForm.address.trim()) { alert('Vui lòng nhập tên gợi nhớ và địa chỉ'); return; }
    setSavingAddress(true);
    try {
      const { error } = await supabase.from('customer_addresses').insert({
        customer_id: id,
        label: addrForm.label.trim(),
        address: addrForm.address.trim(),
        contact_name: addrForm.contact_name.trim() || null,
        contact_phone: addrForm.contact_phone.trim() || null,
        is_default: addresses.length === 0,
      });
      if (error) throw error;
      setAddrForm({ label: '', address: '', contact_name: '', contact_phone: '' });
      setShowAddAddress(false);
      loadAddresses();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thêm được địa chỉ'));
    } finally { setSavingAddress(false); }
  };

  const setDefaultAddress = async (addressId: string) => {
    try {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', id);
      const { error } = await supabase.from('customer_addresses').update({ is_default: true }).eq('id', addressId);
      if (error) throw error;
      loadAddresses();
    } catch (err: any) { alert('Lỗi: ' + err.message); }
  };

  const deleteAddress = async (addressId: string) => {
    if (!confirm('Xóa địa chỉ giao hàng này?')) return;
    const { error } = await supabase.from('customer_addresses').delete().eq('id', addressId);
    if (error) { alert('Lỗi: ' + error.message); return; }
    loadAddresses();
  };

  // Xác thực khách hàng thủ công (mục brief 2026-09-11) — bổ sung cạnh luồng
  // đã có sẵn (đơn tự đăng ký luôn "pending", tự chuyển "verified" khi nhân
  // viên chốt giá đơn đầu). Dùng khi cần xác minh trước khi khách kịp đặt
  // đơn, để tránh khách đặt đơn ảo mà không ai đánh dấu được đã xác thực.
  const [verifying, setVerifying] = useState(false);
  const verifyCustomer = async (status: 'verified' | 'rejected') => {
    const label = status === 'verified' ? 'xác thực' : 'từ chối';
    const note = status === 'rejected' ? (prompt(`Lý do từ chối khách hàng "${form.name}"?`, '') ?? null) : '';
    if (note === null) return;
    if (!confirm(`Xác nhận ${label} khách hàng "${form.name}"?`)) return;
    setVerifying(true);
    try {
      const { error } = await supabase.rpc('admin_verify_customer', {
        p_id: id, p_status: status, p_actor: user?.name || 'Nhân viên', p_note: note || null,
      });
      if (error) throw error;
      alert(`✅ Đã ${label} khách hàng`);
      await loadCustomer();
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || `Không ${label} được khách hàng`));
    } finally { setVerifying(false); }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { alert('Vui lòng nhập tên khách hàng'); return; }
    if (!form.phone?.trim()) { alert('Vui lòng nhập số điện thoại'); return; }
    setSaving(true);
    try {
      const payload = {
        p_name: form.name.trim(),
        p_phone: form.phone.trim(),
        p_company: form.company || '',
        p_email: form.email || '',
        p_tax_code: form.tax_code || '',
        p_address: form.address || '',
        p_shipping_alias: form.default_shipping_alias || 'Địa chỉ mặc định',
        p_shipping_address: form.default_shipping_address || '',
        p_shipping_name: form.default_shipping_name || '',
        p_shipping_phone: form.default_shipping_phone || '',
        p_tier: form.discount_tier || 'VIP0',
      };
      if (isNew) {
        const { data, error } = await supabase.rpc('admin_create_customer', payload);
        if (error) throw error;
        const created = Array.isArray(data) ? data[0] : data;
        if (created?.id) {
          await supabase.rpc('admin_update_customer', {
            p_id: created.id, ...payload,
            p_credit_limit: Number(form.credit_limit) || 0,
            p_notes: form.notes || '',
            p_sales_rep_id: form.sales_rep_id || null,
            p_contract_discount_percent: form.discount_tier === 'CUSTOM' ? Number(form.contract_discount_percent) || null : null,
            p_tier_expiry_date: form.discount_tier === 'CUSTOM' ? form.tier_expiry_date || null : null,
          });
        }
        alert(`✅ Đã tạo khách hàng! Mã: ${created?.partner_code}${created?.temp_password ? `, mật khẩu tạm: ${created.temp_password}` : ''}`);
        navigate(`/khach-hang/${created.id}`, { replace: true });
      } else {
        const { error } = await supabase.rpc('admin_update_customer', {
          p_id: id, ...payload,
          p_credit_limit: Number(form.credit_limit) || 0,
          p_notes: form.notes || '',
          p_sales_rep_id: form.sales_rep_id || null,
          p_contract_discount_percent: form.discount_tier === 'CUSTOM' ? Number(form.contract_discount_percent) || null : null,
          p_tier_expiry_date: form.discount_tier === 'CUSTOM' ? form.tier_expiry_date || null : null,
        });
        if (error) throw error;
        // Nhóm khách hàng là dữ liệu vận hành nội bộ của TPS1.
        try {
          await supabase
            .from('vip_accounts')
            .update({
              customer_group: form.customer_group?.trim() || null,
            })
            .eq('id', id);
        } catch (groupErr) {
          console.warn('Chưa cập nhật nhóm khách hàng:', groupErr);
        }
        alert('✅ Đã lưu thông tin khách hàng');
        await loadCustomer();
      }
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không lưu được'));
    } finally { setSaving(false); }
  };

  const toggleActive = async () => {
    const target = !form.is_active;
    if (!confirm(`${target ? 'Mở khóa' : 'Khóa'} tài khoản khách hàng này?`)) return;
    try {
      const { error } = await supabase.rpc('admin_toggle_customer_active', { p_id: id, p_is_active: target });
      if (error) throw error;
      setField('is_active', target);
      alert(`✅ Đã ${target ? 'mở khóa' : 'khóa'} tài khoản`);
    } catch (err: any) { alert('Lỗi: ' + err.message); }
  };

  const resetPassword = async () => {
    if (!confirm(`Tạo mật khẩu tạm mới cho "${form.name}" (mã ${form.partner_code})? Mật khẩu cũ sẽ không dùng được nữa.`)) return;
    try {
      const { data, error } = await supabase.rpc('admin_reset_customer_password', { p_code: form.partner_code });
      if (error) throw error;
      alert(`✅ Mật khẩu tạm mới cho ${form.partner_code}: ${data}\n\nGửi lại cho khách hàng, khách bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo.`);
    } catch (err: any) { alert('Lỗi: ' + err.message); }
  };

  const changePartnerCode = async () => {
    if (!['admin', 'truong_phong'].includes(user?.role || '')) {
      alert('Chỉ Admin hoặc Trưởng phòng mới được phép đổi mã khách hàng.');
      return;
    }
    const currentCode = form.partner_code || '';
    const input = prompt(
      `Đổi mã khách hàng cho "${form.name}":\n(Mã nên có dạng TPS1-<VIẾTTẮT>, ví dụ: TPS1-TANVAN)\n\nNhập mã mới:`,
      currentCode
    );
    if (!input) return;
    const clean = input.trim().toUpperCase();
    if (!clean || clean === currentCode) return;

    if (!clean.startsWith('TPS1-')) {
      alert('Mã khách hàng phải bắt đầu bằng "TPS1-", ví dụ: TPS1-TANVAN');
      return;
    }

    if (
      !confirm(
        `⚠️ CẢNH BÁO QUAN TRỌNG:\nĐổi mã từ "${currentCode}" thành "${clean}"?\n\nKhách hàng sẽ phải dùng mã mới "${clean}" để đăng nhập vào hệ thống!`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/admin/customers/change-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: id,
          newCode: clean,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không thể đổi mã khách hàng');
      }

      setField('partner_code', data.newCode || clean);
      alert(`✅ Đã đổi mã khách hàng thành công: ${data.newCode || clean}`);
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể đổi mã khách hàng'));
    }
  };

  const searchProducts = async () => {
    if (productSearch.trim().length < 2) { setProductResults([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, unit, price_retail, price_wholesale')
      .ilike('name', `%${productSearch.trim()}%`)
      .eq('active', true)
      .limit(10);
    setProductResults(data || []);
  };
  useEffect(() => { const t = setTimeout(searchProducts, 300); return () => clearTimeout(t); }, [productSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const addContractPrice = async (product: any) => {
    if (contractPrices.some((c) => c.product_id === product.id)) { alert('Sản phẩm đã có trong bảng giá hợp đồng'); return; }
    const defaultPrice = Number(product.price_retail) || Number(product.price_wholesale) || 0;
    const priceStr = prompt(`Nhập giá hợp đồng riêng cho "${product.name}" (đ):`, String(defaultPrice));
    if (priceStr === null) return;
    const price = Number(priceStr);
    if (!Number.isFinite(price) || price < 0) { alert('Giá không hợp lệ'); return; }
    const { error } = await supabase.from('customer_contract_prices').insert({ customer_id: id, product_id: product.id, price });
    if (error) { alert('Lỗi: ' + error.message); return; }
    setProductSearch(''); setProductResults([]);
    loadContractPrices();
  };

  const updateContractPrice = async (productId: string, currentPrice: number) => {
    const priceStr = prompt('Sửa giá hợp đồng (đ):', String(currentPrice));
    if (priceStr === null) return;
    const price = Number(priceStr);
    if (!Number.isFinite(price) || price < 0) { alert('Giá không hợp lệ'); return; }
    const { error } = await supabase.from('customer_contract_prices').update({ price }).eq('customer_id', id).eq('product_id', productId);
    if (error) { alert('Lỗi: ' + error.message); return; }
    loadContractPrices();
  };

  const deleteContractPrice = async (productId: string) => {
    if (!confirm('Xóa sản phẩm này khỏi bảng giá hợp đồng riêng?')) return;
    const { error } = await supabase.from('customer_contract_prices').delete().eq('customer_id', id).eq('product_id', productId);
    if (error) { alert('Lỗi: ' + error.message); return; }
    loadContractPrices();
  };

  const updateContractExpiry = async (productId: string, validUntil: string) => {
    const { error } = await supabase
      .from('customer_contract_prices')
      .update({ valid_until: validUntil || null })
      .eq('customer_id', id).eq('product_id', productId);
    if (error) { alert('Lỗi: ' + error.message); return; }
    loadContractPrices();
  };

  const [showImportContractPrices, setShowImportContractPrices] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'truong_phong' || user?.role === 'sale';

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-500">
      <RefreshCw className="animate-spin mr-2" size={20} /> Đang tải khách hàng...
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/khach-hang')} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">{isNew ? 'Thêm khách hàng mới' : form.name}</h1>
              {!isNew && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${form.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {form.is_active ? 'Hoạt động' : 'Đã khóa'}
                </span>
              )}
              {!isNew && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${VERIFICATION_COLORS[form.verification_status] || VERIFICATION_COLORS.pending}`}>
                  {VERIFICATION_LABELS[form.verification_status] || 'Chờ xác thực'}
                </span>
              )}
            </div>
            {!isNew && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 font-mono font-medium">{form.partner_code}</span>
                {['admin', 'truong_phong'].includes(user?.role || '') && (
                  <button
                    type="button"
                    onClick={changePartnerCode}
                    className="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium transition-colors"
                    title="Đổi mã khách hàng (TPS1-<VIẾTTẮT>)"
                  >
                    Đổi mã
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {!isNew && (
          <div className="flex gap-2">
            <button onClick={resetPassword} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
              <KeyRound size={15} /> Reset mật khẩu
            </button>
            <button onClick={toggleActive} className={`px-3 py-2 border rounded-xl text-sm flex items-center gap-1.5 ${form.is_active ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'}`}>
              {form.is_active ? <Lock size={15} /> : <Unlock size={15} />} {form.is_active ? 'Khóa' : 'Mở khóa'}
            </button>
          </div>
        )}
      </header>

      {!isNew && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2"><ShoppingBag size={18} /></div>
            <div className="font-bold text-slate-800 text-xl">{stats.orderCount}</div>
            <div className="text-xs text-slate-500">Đơn đã mua</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mb-2"><Wallet size={18} /></div>
            <div className="font-bold text-slate-800 text-xl">{money(stats.revenue)}</div>
            <div className="text-xs text-slate-500">Tổng doanh thu</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mb-2"><Wallet size={18} /></div>
            <div className="font-bold text-xl text-red-600">{money(stats.debt)}</div>
            <div className="text-xs text-slate-500">Công nợ hiện tại</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center mb-2"><Clock size={18} /></div>
            <div className="font-bold text-slate-800 text-xl">{dt(stats.lastOrderAt || '')}</div>
            <div className="text-xs text-slate-500">Đơn gần nhất</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800">Thông tin khách hàng</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Tên khách hàng *</label>
                <input disabled={!canEdit} type="text" value={form.name || ''} onChange={(e) => setField('name', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Số điện thoại *</label>
                <input disabled={!canEdit} type="text" value={form.phone || ''} onChange={(e) => setField('phone', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Tên công ty (nếu là khách B2B)</label>
                <input disabled={!canEdit} type="text" value={form.company || ''} onChange={(e) => setField('company', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Mã số thuế (để xuất hóa đơn)</label>
                <input disabled={!canEdit} type="text" value={form.tax_code || ''} onChange={(e) => setField('tax_code', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Email</label>
                <input disabled={!canEdit} type="email" value={form.email || ''} onChange={(e) => setField('email', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Địa chỉ</label>
                <input disabled={!canEdit} type="text" value={form.address || ''} onChange={(e) => setField('address', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Nhóm khách hàng</label>
                <input disabled={!canEdit} type="text" value={form.customer_group || ''} onChange={(e) => setField('customer_group', e.target.value)}
                  placeholder="VD: Nhà hàng, trường học, bếp công nghiệp..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
            </div>
            <p className="text-xs text-slate-400 italic">
              Xuất hóa đơn điện tử (VAT) chưa được tích hợp — cần thêm nhà cung cấp hóa đơn điện tử (MISA/VNPT/Viettel...) mới xuất được hóa đơn thật. Mã số thuế ở đây lưu sẵn để dùng khi tích hợp.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800">Địa chỉ giao hàng mặc định</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Tên gợi nhớ</label>
                <input disabled={!canEdit} type="text" value={form.default_shipping_alias || ''} onChange={(e) => setField('default_shipping_alias', e.target.value)}
                  placeholder="VD: Kho chính" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Người nhận</label>
                <input disabled={!canEdit} type="text" value={form.default_shipping_name || ''} onChange={(e) => setField('default_shipping_name', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">SĐT người nhận</label>
                <input disabled={!canEdit} type="text" value={form.default_shipping_phone || ''} onChange={(e) => setField('default_shipping_phone', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Địa chỉ giao</label>
                <input disabled={!canEdit} type="text" value={form.default_shipping_address || ''} onChange={(e) => setField('default_shipping_address', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
              </div>
            </div>
          </div>

          {/* Nhiều địa chỉ giao hàng — khách công ty lớn giao nhiều địa điểm
              (mục 14.3-5 KE_HOACH), khác với 1 địa chỉ mặc định ở trên */}
          {!isNew && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-800 flex items-center gap-2"><MapPin size={18} className="text-green-600" />Các địa chỉ giao hàng khác</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Dùng cho khách công ty giao tới nhiều địa điểm (xưởng, bếp, chi nhánh...) — chọn nhanh khi tạo đơn ở POS.</p>
                </div>
                {canEdit && !showAddAddress && (
                  <button onClick={() => setShowAddAddress(true)} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100">
                    <Plus size={16} />
                  </button>
                )}
              </div>

              {showAddAddress && (
                <div className="border border-dashed border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={addrForm.label} onChange={(e) => setAddrForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Tên gợi nhớ (VD: Xưởng G8) *" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    <input type="text" value={addrForm.contact_name} onChange={(e) => setAddrForm((f) => ({ ...f, contact_name: e.target.value }))}
                      placeholder="Người nhận" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    <input type="text" value={addrForm.contact_phone} onChange={(e) => setAddrForm((f) => ({ ...f, contact_phone: e.target.value }))}
                      placeholder="SĐT người nhận" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    <input type="text" value={addrForm.address} onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="Địa chỉ giao *" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddAddress(false)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600">Hủy</button>
                    <button onClick={addAddress} disabled={savingAddress} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                      {savingAddress ? 'Đang lưu...' : 'Thêm địa chỉ'}
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100">
                {addresses.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">Chưa có địa chỉ nào ngoài địa chỉ mặc định ở trên.</p>
                ) : addresses.map((a) => (
                  <div key={a.id} className="flex items-start justify-between py-2.5 text-sm gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <button onClick={() => setDefaultAddress(a.id)} title={a.is_default ? 'Địa chỉ ưu tiên' : 'Đặt làm ưu tiên'} className="mt-0.5 shrink-0">
                        <Star size={15} className={a.is_default ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
                      </button>
                      <div>
                        <p className="font-medium text-slate-800">{a.label}</p>
                        <p className="text-xs text-slate-500">{a.address}</p>
                        {(a.contact_name || a.contact_phone) && <p className="text-xs text-slate-400">{a.contact_name} {a.contact_phone ? `· ${a.contact_phone}` : ''}</p>}
                      </div>
                    </div>
                    {canEdit && (
                      <button onClick={() => deleteAddress(a.id)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={15} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bảng giá hợp đồng riêng */}
          {!isNew && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-slate-800">Bảng giá hợp đồng riêng</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Giá cố định riêng từng mặt hàng — ưu tiên cao nhất, không bị ảnh hưởng bởi % chiết khấu hay biến động giá chung.</p>
                </div>
                {canEdit && (
                  <button onClick={() => setShowImportContractPrices(true)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <FileSpreadsheet size={14} /> Nhập Excel
                  </button>
                )}
              </div>
              {canEdit && (
                <div className="relative">
                  <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Tìm sản phẩm để thêm vào hợp đồng..."
                    className="pl-8 pr-3 py-2 w-full border border-slate-200 rounded-lg text-sm" />
                  {productResults.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden absolute z-10 bg-white w-full shadow-lg">
                      {productResults.map((p) => (
                        <button key={p.id} onClick={() => addContractPrice(p)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-green-50 text-left border-b border-slate-100 last:border-0">
                          <span className="text-sm">{p.name}</span>
                          <Plus size={15} className="text-green-600" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {contractPrices.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">Chưa có giá hợp đồng riêng nào.</p>
                ) : contractPrices.map((c) => (
                  <div key={c.product_id} className="flex items-center justify-between py-2.5 text-sm gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{c.products?.name}</p>
                      <p className="text-xs text-slate-400">{c.products?.sku} · {c.products?.unit}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {canEdit ? (
                        <label className="flex items-center gap-1 text-xs text-slate-400" title="Ngày hết hạn giá cố định này">
                          <CalendarClock size={13} />
                          <input type="date" value={c.valid_until ? String(c.valid_until).slice(0, 10) : ''}
                            onChange={(e) => updateContractExpiry(c.product_id, e.target.value)}
                            className="border border-slate-200 rounded-md px-1.5 py-1 text-xs" />
                        </label>
                      ) : (
                        c.valid_until && <span className="text-xs text-slate-400">Hết hạn {dt(c.valid_until)}</span>
                      )}
                      <button onClick={() => updateContractPrice(c.product_id, c.price)} className="font-semibold text-green-700 hover:underline whitespace-nowrap">{money(c.price)}</button>
                      {canEdit && (
                        <button onClick={() => deleteContractPrice(c.product_id)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Đơn hàng gần đây */}
          {!isNew && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
              <h2 className="font-bold text-slate-800">Đơn hàng gần đây</h2>
              {recentOrders.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">Chưa có đơn hàng nào.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentOrders.map((o) => (
                    <button key={o.order_code} onClick={() => navigate(`/don-hang/${o.id || ''}`)}
                      className="w-full flex items-center justify-between py-2.5 text-sm text-left hover:bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-800">{o.order_code}</p>
                        <p className="text-xs text-slate-400">{dt(o.created_at)} · {o.item_count || 0} SP</p>
                      </div>
                      <span className="font-semibold text-slate-700">{money(o.grand_total)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Xác thực khách hàng — khách tự đăng ký qua web/Mini App luôn ở
              "Chờ xác thực" cho tới khi nhân viên chốt giá đơn đầu (tự động)
              hoặc xác thực thủ công tại đây (mục brief 2026-09-11, để tránh
              khách đặt đơn ảo mà không ai đánh dấu được đã xác thực). */}
          {!isNew && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                {form.verification_status === 'verified' ? <ShieldCheck size={18} className="text-green-600" />
                  : form.verification_status === 'rejected' ? <ShieldX size={18} className="text-red-600" />
                  : <ShieldAlert size={18} className="text-amber-600" />}
                Xác thực khách hàng
              </h2>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Nguồn đăng ký</span><span className="text-slate-700">{SOURCE_LABELS[form.registration_source] || form.registration_source || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Đăng ký lúc</span><span className="text-slate-700">{dtFull(form.registered_at)}</span></div>
                {form.verification_status === 'verified' && (
                  <>
                    <div className="flex justify-between"><span className="text-slate-400">Xác thực bởi</span><span className="text-slate-700">{form.verified_by || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Xác thực lúc</span><span className="text-slate-700">{dtFull(form.verified_at)}</span></div>
                  </>
                )}
                {form.verification_note && <div className="pt-1 text-xs text-slate-500 italic">"{form.verification_note}"</div>}
              </dl>
              {form.verification_status !== 'verified' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Khách chưa xác thực — tự động chuyển "Đã xác thực" khi nhân viên chốt giá đơn hàng đầu tiên, hoặc xác thực thủ công ngay tại đây trước khi khách kịp đặt đơn.
                </p>
              )}
              {canEdit && form.verification_status !== 'verified' && (
                <div className="flex gap-2">
                  <button onClick={() => verifyCustomer('verified')} disabled={verifying}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {verifying ? 'Đang xử lý...' : 'Xác thực khách hàng'}
                  </button>
                  {form.verification_status !== 'rejected' && (
                    <button onClick={() => verifyCustomer('rejected')} disabled={verifying}
                      className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                      Từ chối
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-bold text-slate-800">Hạng & công nợ</h2>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Hạng khách hàng</label>
              <select disabled={!canEdit} value={form.discount_tier || 'VIP0'} onChange={(e) => setField('discount_tier', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50">
                {TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
            {form.discount_tier === 'CUSTOM' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Chiết khấu riêng (%)</label>
                  <input disabled={!canEdit} type="number" min="0" max="100" value={form.contract_discount_percent ?? ''} onChange={(e) => setField('contract_discount_percent', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Hết hạn</label>
                  <input disabled={!canEdit} type="date" value={form.tier_expiry_date || ''} onChange={(e) => setField('tier_expiry_date', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Hạn mức công nợ (0 = không giới hạn)</label>
              <input disabled={!canEdit} type="number" min="0" step="1000" value={form.credit_limit ?? 0} onChange={(e) => setField('credit_limit', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Sale phụ trách</label>
              <select disabled={!canEdit} value={form.sales_rep_id || ''} onChange={(e) => setField('sales_rep_id', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50">
                <option value="">-- Chưa gán Sale --</option>
                {salesReps.map((r) => <option key={r.id} value={r.id}>{r.role === 'admin' ? `👑 ${r.name} (Admin)` : r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Ghi chú nội bộ</label>
              <textarea disabled={!canEdit} rows={3} value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 resize-none" />
            </div>
            {canEdit && (
              <button onClick={handleSave} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60">
                <Save size={18} /> {saving ? 'Đang lưu...' : isNew ? 'Tạo khách hàng' : 'Lưu thay đổi'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showImportContractPrices && !isNew && (
        <ImportContractPricesModal
          apiBase={apiBase}
          token={token}
          customerId={id!}
          onClose={() => setShowImportContractPrices(false)}
          onDone={() => { setShowImportContractPrices(false); loadContractPrices(); }}
        />
      )}
    </div>
  );
}

interface ContractPriceSummary { total: number; ok: number; notFound: number; invalidPrice: number }
interface ContractPriceProblem { row: number; sku: string; status: string; productName?: string }
const CONTRACT_PRICE_PROBLEM_LABELS: Record<string, string> = {
  not_found: 'Không tìm thấy mã hàng',
  invalid_price: 'Giá cố định không hợp lệ',
};

// Modal nhập hàng loạt giá cố định theo hợp đồng bằng Excel (mục 23 kế
// hoạch, 14/09/2026) — cùng khuôn với ImportInventoryModal/ImportPricebookModal
// ở ProductsPage.tsx, chỉ khác gọi route customers/import-contract-prices và
// gắn cứng customerId của trang đang mở.
function ImportContractPricesModal({ apiBase, token, customerId, onClose, onDone }: { apiBase: string; token: string | null; customerId: string; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<ContractPriceSummary | null>(null);
  const [problems, setProblems] = useState<ContractPriceProblem[]>([]);
  const [error, setError] = useState('');

  const runImport = async (apply: boolean) => {
    if (!file) return;
    setError('');
    apply ? setApplying(true) : setChecking(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('customerId', customerId);
      if (apply) form.append('apply', '1');
      const res = await fetch(`${apiBase}/api/admin/customers/import-contract-prices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSummary(data.summary);
      setProblems(data.problems || []);
      if (apply) {
        alert(`✅ Đã cập nhật giá cố định cho ${data.summary.ok} mã hàng`);
        onDone();
      }
    } catch (err: any) {
      setError(err.message || 'Không xử lý được file');
    } finally {
      apply ? setApplying(false) : setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Nhập giá cố định hợp đồng từ Excel</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-400 -mt-2">
          Dùng cho khách có mặt hàng chốt giá cố định suốt hợp đồng (VD: thịt heo 100k/kg 1 năm, không đổi theo bảng giá chung).
        </p>

        <a href={`${apiBase}/api/admin/customers/import-contract-prices`} target="_blank" rel="noreferrer"
          onClick={(e) => {
            e.preventDefault();
            fetch(`${apiBase}/api/admin/customers/import-contract-prices`, { headers: { Authorization: `Bearer ${token}` } })
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'mau-gia-co-dinh-hop-dong.xlsx'; a.click();
                URL.revokeObjectURL(url);
              });
          }}
          className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium">
          <Download size={14} /> Tải file mẫu
        </a>

        <div>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setSummary(null); setProblems([]); setError(''); }}
            className="text-sm w-full border border-slate-200 rounded-lg px-3 py-2" />
        </div>

        {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

        {summary && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2.5 bg-green-50 rounded-lg text-green-700 flex items-center gap-2">
                <CheckCircle2 size={16} /> Hợp lệ: <b>{summary.ok}</b>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-slate-600">Tổng dòng: <b>{summary.total}</b></div>
              {summary.notFound > 0 && <div className="p-2.5 bg-red-50 rounded-lg text-red-600">Không tìm thấy: <b>{summary.notFound}</b></div>}
              {summary.invalidPrice > 0 && <div className="p-2.5 bg-red-50 rounded-lg text-red-600">Giá không hợp lệ: <b>{summary.invalidPrice}</b></div>}
            </div>
            {problems.length > 0 && (
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto text-xs">
                {problems.map((p, i) => (
                  <div key={i} className="px-2.5 py-1.5 border-b border-slate-50 last:border-0 flex justify-between gap-2">
                    <span>Dòng {p.row}: {p.sku} {p.productName ? `(${p.productName})` : ''}</span>
                    <span className="text-slate-400 shrink-0">{CONTRACT_PRICE_PROBLEM_LABELS[p.status] || p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Đóng</button>
          {!summary ? (
            <button onClick={() => runImport(false)} disabled={!file || checking}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
              {checking ? 'Đang kiểm tra...' : 'Xem trước'}
            </button>
          ) : (
            <button onClick={() => runImport(true)} disabled={applying || summary.ok === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {applying ? 'Đang ghi...' : `Xác nhận nhập ${summary.ok} mã`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
