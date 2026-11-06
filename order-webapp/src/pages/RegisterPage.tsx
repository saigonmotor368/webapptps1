import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSwitcher, useLanguage } from '../contexts/LanguageContext';

export default function RegisterPage() {
  const { login } = useAuth();
  const { t, errorText } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', company: '', phone: '', username: '', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [registeredCode, setRegisteredCode] = useState('');
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (form.password.length < 8 || form.password !== form.confirmPassword) {
      setError(t('Mật khẩu cần ít nhất 8 ký tự và hai lần nhập phải khớp.'));
      return;
    }
    setError(''); setBusy(true);
    try {
      const { account } = await api.register(form);
      setRegisteredCode(account.code);
      await login(form.username, form.password);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(errorText(cause instanceof ApiError ? cause : { message: 'Có lỗi xảy ra, vui lòng thử lại sau.' }));
    } finally { setBusy(false); }
  };
  return <main className="min-h-dvh bg-[#f5f7f3] px-4 py-6 pb-[env(safe-area-inset-bottom)]">
    <div className="mx-auto max-w-md">
      <div className="flex justify-end mb-5"><LanguageSwitcher /></div>
      <div className="rounded-3xl bg-white border border-[#17231d]/10 p-6 shadow-sm">
        <img src={`${import.meta.env.BASE_URL}images/tps1-logo-horizontal.png`} alt="TPS1" className="h-11 w-auto mb-6" />
        <h1 className="text-2xl font-black text-[#17231d]">{t('Đăng ký tài khoản')}</h1>
        <p className="text-sm text-[#59665f] mt-2 mb-5">{t('Dành cho công ty, cửa hàng và bếp ăn đặt hàng từ TPS1.')}</p>
        {registeredCode && <p className="rounded-xl bg-emerald-50 p-3 text-sm">{t('Mã khách hàng')}: <strong>{registeredCode}</strong></p>}
        <form onSubmit={submit} className="space-y-4">
          {([['name', 'Tên người liên hệ'], ['company', 'Tên công ty / cửa hàng'], ['phone', 'Số điện thoại'], ['username', 'Tên đăng nhập'], ['email', 'Email (không bắt buộc)'], ['password', 'Mật khẩu'], ['confirmPassword', 'Xác nhận mật khẩu']] as const).map(([key, label]) =>
            <label className="block text-sm font-semibold text-[#17231d]" key={key}>{t(label)}
              <input value={form[key]} onChange={event => update(key, event.target.value)}
                type={key.includes('assword') ? 'password' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                autoComplete={key === 'name' ? 'name' : key === 'company' ? 'organization' : key === 'phone' ? 'tel' : key === 'username' ? 'username' : key === 'email' ? 'email' : key === 'password' ? 'new-password' : 'off'}
                autoCapitalize={key === 'username' ? 'none' : undefined}
                pattern={key === 'username' ? '[a-zA-Z][a-zA-Z0-9._-]{3,29}' : undefined}
                minLength={key === 'password' || key === 'confirmPassword' ? 8 : undefined}
                required={key !== 'email'} maxLength={key === 'company' ? 180 : 120}
                className="mt-1 block w-full min-h-12 rounded-xl border border-[#17231d]/20 px-3 text-base focus:outline-none focus:ring-2 focus:ring-[#0f7a4f]/40" />
            </label>)}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <button disabled={busy} className="w-full min-h-12 rounded-xl bg-[#0f7a4f] px-4 font-bold text-white disabled:opacity-60">{busy ? t('Đang xử lý...') : t('Tạo tài khoản')}</button>
        </form>
        <Link to="/dang-nhap" className="mt-5 block text-center text-sm font-semibold text-[#0b4f34]">{t('Đã có tài khoản? Đăng nhập')}</Link>
      </div>
    </div>
  </main>;
}
