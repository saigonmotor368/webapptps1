import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronRight, KeyRound, LogOut, MapPin, PackageCheck, Pencil, Plus, ShieldCheck, Truck, UserRound, X } from 'lucide-react';
import { api, type CustomerAccountResponse, type CustomerAddress, type CustomerAddressInput } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0) + 'đ';
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
const emptyAddress = (): CustomerAddressInput => ({ label: '', address: '', contactName: '', contactPhone: '', isDefault: false });

export default function AccountPage() {
  const { logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CustomerAccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState({ name: '', phone: '', email: '', address: '' });
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | 'new' | null>(null);
  const [addressForm, setAddressForm] = useState<CustomerAddressInput>(emptyAddress());
  const [legalOpen, setLegalOpen] = useState(false);
  const [legal, setLegal] = useState({ company: '', taxCode: '', reason: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setError('');
      const result = await api.account();
      setData(result);
      setProfile({ name: result.profile.contactName || '', phone: result.profile.phone || '', email: result.profile.email || '', address: result.profile.address || '' });
    } catch (e: any) { setError(e?.message || 'Không tải được tài khoản'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    try { setSaving(true); const result = await api.updateProfile(profile); await refresh(); setEditingProfile(false); setNotice('Đã cập nhật thông tin liên hệ.'); setData(prev => prev ? { ...prev, profile: { ...prev.profile, contactName: result.session.name, phone: result.session.phone, email: result.session.email, address: result.session.address } } : prev); }
    catch (e: any) { setError(e?.message || 'Không lưu được thông tin'); } finally { setSaving(false); }
  };
  const openAddress = (address?: CustomerAddress) => {
    setEditingAddress(address || 'new');
    setAddressForm(address ? { label: address.label, address: address.address, contactName: address.contact_name, contactPhone: address.contact_phone, isDefault: address.is_default } : emptyAddress());
  };
  const saveAddress = async () => {
    try { setSaving(true); if (editingAddress === 'new') await api.createAddress(addressForm); else if (editingAddress) await api.updateAddress(editingAddress.id, addressForm); setEditingAddress(null); setNotice('Đã lưu địa chỉ giao hàng.'); await load(); }
    catch (e: any) { setError(e?.message || 'Không lưu được địa chỉ'); } finally { setSaving(false); }
  };
  const setDefault = async (id: string) => { try { await api.setDefaultAddress(id); await load(); } catch (e: any) { setError(e?.message || 'Không đổi được địa chỉ mặc định'); } };
  const deactivate = async (address: CustomerAddress) => { if (address.is_default) return setError('Hãy chọn địa chỉ mặc định khác trước khi ngừng sử dụng địa chỉ này.'); try { await api.deactivateAddress(address.id); await load(); } catch (e: any) { setError(e?.message || 'Không ngừng được địa chỉ'); } };
  const sendLegalRequest = async () => { try { setSaving(true); await api.requestLegalProfileChange(legal); setLegalOpen(false); setLegal({ company: '', taxCode: '', reason: '' }); setNotice('Yêu cầu đã được gửi tới TPS1.'); await load(); } catch (e: any) { setError(e?.message || 'Không gửi được yêu cầu'); } finally { setSaving(false); } };

  if (loading) return <div className="grid lg:grid-cols-3 gap-4 animate-pulse"><div className="h-72 bg-white rounded-2xl"/><div className="lg:col-span-2 h-72 bg-white rounded-2xl"/></div>;
  if (!data) return <div className="bg-white rounded-2xl p-8 text-center text-red-600">{error || 'Không tải được tài khoản'} <button onClick={load} className="ml-2 underline">Thử lại</button></div>;
  const { profile: p, orderSummary: stats } = data;

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl sm:text-2xl font-bold text-[#17231d]">Tài khoản khách hàng</h1><p className="text-sm text-[#59665f]">Quản lý hồ sơ, địa chỉ giao hàng và bảo mật</p></div><span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck size={14}/> Tài khoản đang hoạt động</span></div>
    {(error || notice) && <div className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}
    <div className="grid lg:grid-cols-[0.9fr_1.6fr] gap-4 items-start">
      <section className="bg-white rounded-2xl border border-[#17231d]/10 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between"><div className="flex gap-3"><div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#0f7a4f] flex items-center justify-center"><Building2/></div><div><p className="font-bold text-[#17231d]">{p.company || p.contactName}</p><p className="text-xs text-[#59665f] font-mono">{p.code}</p></div></div><button onClick={() => setEditingProfile(v => !v)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Sửa hồ sơ"><Pencil size={16}/></button></div>
        {editingProfile ? <div className="space-y-3">{[['Người liên hệ','name'],['Số điện thoại','phone'],['Email','email'],['Địa chỉ liên hệ','address']].map(([label,key]) => <label key={key} className="block text-xs font-semibold text-slate-600">{label}<input value={(profile as any)[key]} onChange={e => setProfile(v => ({...v,[key]:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label>)}<div className="flex gap-2"><button onClick={saveProfile} disabled={saving} className="flex-1 rounded-xl bg-[#0f7a4f] text-white py-2.5 font-semibold">Lưu</button><button onClick={() => setEditingProfile(false)} className="rounded-xl border px-4">Hủy</button></div></div> : <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 text-sm"><dt className="text-slate-500">Người liên hệ</dt><dd>{p.contactName || '—'}</dd><dt className="text-slate-500">Điện thoại</dt><dd>{p.phone || '—'}</dd><dt className="text-slate-500">Email</dt><dd className="break-all">{p.email || '—'}</dd><dt className="text-slate-500">Địa chỉ</dt><dd>{p.address || '—'}</dd><dt className="text-slate-500">Mã số thuế</dt><dd>{p.taxCode || '—'}</dd><dt className="text-slate-500">Bảng giá</dt><dd className="font-semibold text-[#0f7a4f]">{p.priceBook?.name || 'Bảng giá chung'}</dd></dl>}
        <button onClick={() => setLegalOpen(true)} className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">Yêu cầu đổi tên công ty / mã số thuế</button>
        <div className="border-t pt-3 space-y-2"><Link to="/doi-mat-khau" className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-slate-50 text-sm font-semibold"><span className="flex items-center gap-2"><KeyRound size={17}/> Đổi mật khẩu</span><ChevronRight size={16}/></Link><button onClick={() => { logout(); navigate('/dang-nhap'); }} className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-red-50 text-sm font-semibold text-red-600"><LogOut size={17}/> Đăng xuất</button></div>
      </section>
      <div className="space-y-4">
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[[PackageCheck,'Tổng đơn',stats.total],[UserRound,'Đang xử lý',stats.processing],[Truck,'Đang giao',stats.shipping],[Check,'Hoàn thành',stats.completed]].map(([Icon,label,value]: any) => <div key={label} className="bg-white rounded-2xl border p-4"><Icon size={19} className="text-[#0f7a4f]"/><p className="mt-3 text-2xl font-bold">{value}</p><p className="text-xs text-slate-500">{label}</p></div>)}</section>
        <section className="bg-white rounded-2xl border border-[#17231d]/10 overflow-hidden"><div className="p-4 border-b flex justify-between"><div><h2 className="font-bold">Đơn hàng gần đây</h2><p className="text-xs text-slate-500">5 đơn mới nhất</p></div><Link to="/don-hang" className="text-sm font-semibold text-[#0f7a4f]">Xem tất cả</Link></div>{data.recentOrders.length ? data.recentOrders.map(o => <Link key={o.id} to={`/don-hang/${o.id}`} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-b last:border-0 hover:bg-slate-50"><div><p className="font-semibold text-sm">{o.order_code}</p><p className="text-xs text-slate-500">{date(o.created_at)} · {o.status}</p></div><p className="font-bold text-sm">{money(o.grand_total)}</p></Link>) : <p className="p-6 text-center text-sm text-slate-500">Chưa có đơn hàng</p>}</section>
        <section className="bg-white rounded-2xl border border-[#17231d]/10"><div className="p-4 border-b flex items-center justify-between"><div><h2 className="font-bold">Địa chỉ giao hàng</h2><p className="text-xs text-slate-500">Đơn cũ vẫn giữ nguyên địa chỉ đã giao</p></div><button onClick={() => openAddress()} className="inline-flex items-center gap-1 rounded-xl bg-[#0f7a4f] text-white px-3 py-2 text-sm font-semibold"><Plus size={16}/> Thêm</button></div><div className="p-3 grid md:grid-cols-2 gap-3">{data.addresses.map(a => <div key={a.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><p className="font-bold text-sm flex items-center gap-1.5"><MapPin size={15} className="text-[#0f7a4f]"/>{a.label}{a.is_default && <span className="text-[10px] bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">Mặc định</span>}</p><button onClick={() => openAddress(a)} className="p-1"><Pencil size={14}/></button></div><p className="mt-2 text-sm">{a.address}</p><p className="mt-1 text-xs text-slate-500">{a.contact_name} · {a.contact_phone}</p><div className="mt-3 flex gap-2">{!a.is_default && <button onClick={() => setDefault(a.id)} className="text-xs font-semibold text-[#0f7a4f]">Đặt mặc định</button>}{!a.is_default && <button onClick={() => deactivate(a)} className="text-xs text-red-600">Ngừng dùng</button>}</div></div>)}</div></section>
      </div>
    </div>
    {editingAddress && <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3"><div className="bg-white rounded-2xl w-full max-w-lg p-5"><div className="flex justify-between"><h2 className="font-bold text-lg">{editingAddress === 'new' ? 'Thêm địa chỉ' : 'Sửa địa chỉ'}</h2><button onClick={() => setEditingAddress(null)}><X/></button></div><div className="grid sm:grid-cols-2 gap-3 mt-4">{[['Tên gợi nhớ','label'],['Người nhận','contactName'],['Số điện thoại','contactPhone'],['Địa chỉ đầy đủ','address']].map(([label,key]) => <label key={key} className={key === 'address' ? 'sm:col-span-2 text-xs font-semibold' : 'text-xs font-semibold'}>{label}<input value={(addressForm as any)[key]} onChange={e => setAddressForm(v => ({...v,[key]:e.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"/></label>)}</div><button onClick={saveAddress} disabled={saving} className="mt-4 w-full rounded-xl bg-[#0f7a4f] text-white py-3 font-bold">Lưu địa chỉ</button></div></div>}
    {legalOpen && <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3"><div className="bg-white rounded-2xl w-full max-w-lg p-5"><div className="flex justify-between"><div><h2 className="font-bold text-lg">Yêu cầu cập nhật hồ sơ pháp lý</h2><p className="text-xs text-slate-500">TPS1 sẽ kiểm tra trước khi cập nhật.</p></div><button onClick={() => setLegalOpen(false)}><X/></button></div><div className="space-y-3 mt-4"><input placeholder={`Tên công ty mới (hiện tại: ${p.company || 'chưa có'})`} value={legal.company} onChange={e => setLegal(v => ({...v,company:e.target.value}))} className="w-full rounded-xl border px-3 py-2.5"/><input placeholder={`Mã số thuế mới (hiện tại: ${p.taxCode || 'chưa có'})`} value={legal.taxCode} onChange={e => setLegal(v => ({...v,taxCode:e.target.value}))} className="w-full rounded-xl border px-3 py-2.5"/><textarea placeholder="Lý do cập nhật" value={legal.reason} onChange={e => setLegal(v => ({...v,reason:e.target.value}))} className="w-full rounded-xl border px-3 py-2.5 min-h-24"/></div><button onClick={sendLegalRequest} disabled={saving} className="mt-3 w-full rounded-xl bg-[#0f7a4f] text-white py-3 font-bold">Gửi yêu cầu</button></div></div>}
  </div>;
}
