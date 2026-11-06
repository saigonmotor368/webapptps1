import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, HelpCircle, LockKeyhole, PhoneCall, UserRound, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSwitcher, useLanguage } from '../contexts/LanguageContext';
import { ApiError } from '../lib/api';

const REMEMBER_KEY = 'tps1_remembered_customer_code';

export default function LoginPage() {
  const [code, setCode] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
  const [password, setPassword] = useState('');
  const [rememberCode, setRememberCode] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { t, errorText } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (rememberCode && code.trim()) localStorage.setItem(REMEMBER_KEY, code.trim());
    else if (!rememberCode) localStorage.removeItem(REMEMBER_KEY);
  }, [rememberCode, code]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const cleanCode = code.trim();
    if (!cleanCode) { setError(t('Vui lòng nhập SĐT hoặc tên đăng nhập')); return; }
    if (!password) { setError(t('Vui lòng nhập mật khẩu')); return; }
    setLoading(true);
    try {
      if (rememberCode) localStorage.setItem(REMEMBER_KEY, cleanCode);
      else localStorage.removeItem(REMEMBER_KEY);
      const session = await login(cleanCode, password);
      navigate(session.mustChangePassword ? '/doi-mat-khau' : '/');
    } catch (cause) {
      setError(errorText(cause instanceof ApiError ? cause : { message: 'Có lỗi xảy ra, vui lòng thử lại sau.' }));
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-dvh bg-[#f7faf6] text-[#18382b] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,520px)]">
      <section
        className="tps1-login-hero relative h-[clamp(168px,25dvh,216px)] shrink-0 overflow-hidden bg-[#123c2c] bg-cover bg-[center_35%] lg:h-dvh lg:bg-center"
        style={{ backgroundImage: `linear-gradient(180deg, rgba(4,36,24,.16), rgba(4,36,24,.66)), url('${import.meta.env.BASE_URL}images/login-fresh-food-v2.webp')` }}
      >
        <div className="relative mx-auto flex h-full max-w-md flex-col justify-between px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))] lg:max-w-none lg:px-12 lg:pb-14 lg:pt-12">
          <div className="flex items-start justify-between gap-3">
            <div className="inline-flex h-12 items-center rounded-xl bg-white px-3 shadow-lg shadow-black/15 lg:h-14 lg:px-4">
              <img src={`${import.meta.env.BASE_URL}images/tps1-logo-horizontal.png`} alt="Thực Phẩm Số Một" className="h-7 w-auto object-contain lg:h-8" />
            </div>
            <LanguageSwitcher dark />
          </div>
          <div className="max-w-sm text-white">
            <p className="tps1-login-kicker text-[11px] font-bold uppercase tracking-[.18em] text-white/80">TPS1 · B2B</p>
            <p className="tps1-login-title mt-1 text-xl font-bold tracking-tight drop-shadow-sm lg:text-4xl lg:leading-tight">{t('Đặt hàng cho bếp')}</p>
            <p className="hidden text-base text-white/85 lg:mt-3 lg:block">{t('Đặt hàng và theo dõi đơn trực tuyến')}</p>
          </div>
        </div>
      </section>

      <section className="tps1-login-sheet relative z-10 -mt-5 flex min-h-[calc(75dvh+5px)] flex-col justify-center rounded-t-[28px] bg-[#f7faf6] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-10px_24px_rgba(3,36,23,.1)] lg:m-0 lg:min-h-dvh lg:rounded-none lg:px-10 lg:py-10 lg:shadow-none">
        <div className="mx-auto w-full max-w-md lg:max-w-sm">
          <header className="tps1-login-header mb-4">
            <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-[#113b2b]">{t('Đăng nhập')}</h1>
            <p className="mt-1 text-[13px] leading-snug text-[#65796d]">{t('Đặt hàng và theo dõi đơn trực tuyến')}</p>
          </header>

          <form onSubmit={handleSubmit} className="tps1-login-form space-y-3">
            <div>
              <label htmlFor="customer-code" className="mb-1.5 block text-[13px] font-semibold text-[#315141]">{t('SĐT hoặc tên đăng nhập')}</label>
              <div className="relative">
                <UserRound size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#799486]" />
                <input id="customer-code" type="text" value={code} onChange={event => setCode(event.target.value)}
                  placeholder={t('Nhập SĐT hoặc tên đăng nhập')} autoCapitalize="none" autoComplete="username" required
                  className="h-12 w-full rounded-xl border border-[#d7e3d9] bg-white pl-11 pr-11 text-base font-medium text-[#17382a] outline-none placeholder:font-normal placeholder:text-[#9aa9a0] focus:border-[#0b8b60] focus:ring-2 focus:ring-[#0b8b60]/15" />
                {code && <button type="button" onClick={() => setCode('')} aria-label={t('Xóa thông tin đăng nhập')}
                  className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#7d9184]"><X size={17} /></button>}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="customer-password" className="text-[13px] font-semibold text-[#315141]">{t('Mật khẩu')}</label>
                <button type="button" onClick={() => setShowHelp(true)} className="text-[13px] font-semibold text-[#0b7a55]">{t('Quên mật khẩu?')}</button>
              </div>
              <div className="relative">
                <LockKeyhole size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#799486]" />
                <input id="customer-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)}
                  placeholder={t('Nhập mật khẩu của bạn...')} autoComplete="current-password" required
                  className="h-12 w-full rounded-xl border border-[#d7e3d9] bg-white pl-11 pr-11 text-base text-[#17382a] outline-none placeholder:text-[#9aa9a0] focus:border-[#0b8b60] focus:ring-2 focus:ring-[#0b8b60]/15" />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={t(showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu')}
                  className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#6d8475]">
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <label className="flex min-h-9 items-center gap-2.5 text-[13px] text-[#536d5c]">
              <input type="checkbox" checked={rememberCode} onChange={event => setRememberCode(event.target.checked)} className="size-[18px] accent-[#0b8b60]" />
              {t('Ghi nhớ đăng nhập')}
            </label>

            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button type="submit" disabled={loading}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#087d57] text-base font-bold text-white shadow-[0_8px_18px_rgba(8,125,87,.18)] transition active:scale-[.99] disabled:opacity-60">
              {loading ? t('Đang xử lý...') : t('Đăng nhập')}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="mt-4 text-center text-[13px] text-[#6c7d71]">
            {t('Chưa có tài khoản?')}{' '}
            <Link to="/dang-ky" className="font-bold text-[#087d57] underline-offset-2 hover:underline">{t('Đăng ký tài khoản')}</Link>
          </p>
          <button type="button" onClick={() => setShowHelp(true)} className="tps1-login-support mx-auto mt-5 flex min-h-8 items-center justify-center gap-1.5 text-[13px] font-medium text-[#536d5c]">
            <HelpCircle size={16} /> {t('Hỗ trợ khách hàng')}
          </button>
        </div>
      </section>

      {showHelp && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#08271c]/70 p-4 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
        <div role="dialog" aria-modal="true" aria-label={t('Hỗ trợ khách hàng')} onClick={event => event.stopPropagation()}
          className="w-full max-w-sm rounded-3xl bg-white p-6 text-[#18382b] shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-[#e1f3e9] text-[#0b7a55]"><PhoneCall size={21} /></div>
              <div><h2 className="text-lg font-bold">{t('Hỗ trợ khách hàng')}</h2><p className="text-xs text-[#63776b]">{t('Cấp mới tài khoản hoặc đặt lại mật khẩu')}</p></div></div>
            <button type="button" onClick={() => setShowHelp(false)} aria-label={t('Đóng cửa sổ')} className="flex size-9 items-center justify-center rounded-lg text-[#63776b]"><X size={20} /></button>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[#53695c]">{t('Vui lòng liên hệ sale phụ trách hoặc hotline TPS1 để được hỗ trợ đặt lại mật khẩu:')}</p>
          <a href="tel:0898902222" className="mt-4 flex min-h-14 items-center justify-between rounded-xl bg-[#eef7f0] px-4 font-bold text-[#087d57]">
            <span>089 890 2222</span><span className="text-sm">{t('Gọi ngay')} <ArrowRight size={16} className="inline" /></span>
          </a>
        </div>
      </div>}
    </main>
  );
}
