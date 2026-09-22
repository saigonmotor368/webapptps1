import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Package, ClipboardList, LogOut, FileSpreadsheet, UserCircle2, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from '../components/NotificationBell';

const tabs = [
  { to: '/', label: 'Đặt hàng', icon: Package, end: true },
  { to: '/dat-hang/excel', label: 'Đặt hàng Excel', icon: FileSpreadsheet },
  { to: '/don-hang', label: 'Đơn hàng của tôi', icon: ClipboardList },
];

export default function CustomerLayout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/dang-nhap');
  };

  const initial = (session?.name || session?.company || 'K').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f7f3] flex flex-col selection:bg-[#0f7a4f] selection:text-white">
      {/* Top Header */}
      <header className="bg-gradient-to-r from-[#0b4f34] via-[#0d593c] to-[#0f7a4f] sticky top-0 z-30 shadow-md border-b border-white/10">
        <div className="max-w-[1520px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          {/* Brand Logo & Customer Info */}
          <div className="flex items-center gap-3.5 min-w-0">
            <NavLink to="/" className="bg-white/95 px-3 py-1.5 rounded-xl shadow-sm border border-white/50 shrink-0 hover:bg-white transition-colors">
              <img
                src="/images/tps1-logo-horizontal.png"
                alt="Thực Phẩm Số Một (TPS1)"
                className="h-7 w-auto object-contain"
              />
            </NavLink>
            <div className="min-w-0 hidden sm:block">
              <p className="font-semibold text-white text-sm leading-tight truncate">
                {session?.name || session?.company || 'Khách hàng VIP'}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-100/80 font-mono mt-0.5">
                <span className="font-bold">{session?.code}</span>
                {session?.tier && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-900/60 text-emerald-200 border border-emerald-400/30 text-[10px]">
                    Hạng {session.tier}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1.5">
            {tabs.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white text-[#0b4f34] shadow-sm font-semibold'
                      : 'text-white/85 hover:bg-white/12 hover:text-white'
                  }`
                }
              >
                <Icon size={16} /> {label}
              </NavLink>
            ))}
            <NavLink
              to="/doi-mat-khau"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-[#0b4f34] font-semibold' : 'text-white/85 hover:bg-white/12'
                }`
              }
            >
              <UserCircle2 size={16} /> Tài khoản
            </NavLink>

            {/* Hotline B2B TPS1 */}
            <a
              href="tel:0898902222"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/35 text-xs font-bold tracking-wide ml-2 transition-all active:scale-[0.98]"
              title="Tổng đài CSKH & Đặt hàng TPS1"
            >
              <Phone size={13} className="text-amber-300" />
              <span>089 890 2222</span>
            </a>

            <div className="h-4 w-[1px] bg-white/20 mx-1" />

            <NotificationBell />

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white/75 hover:bg-white/12 hover:text-white transition-colors cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut size={16} />
            </button>
          </nav>

          {/* Mobile Top Bar */}
          <div className="flex md:hidden items-center gap-2">
            <a
              href="tel:0898902222"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-400/35 text-[11px] font-bold"
              title="Gọi hotline TPS1"
            >
              <Phone size={11} className="text-amber-300" />
              <span>0898902222</span>
            </a>
            <NotificationBell />
            <button
              onClick={() => navigate('/doi-mat-khau')}
              className="w-8 h-8 rounded-full bg-white/15 border border-white/20 text-white font-bold flex items-center justify-center text-xs active:scale-95 transition-transform"
              aria-label="Tài khoản"
            >
              {initial}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1520px] mx-auto w-full px-2.5 sm:px-4 lg:px-6 py-3.5 flex-1 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Bottom Navigation for Mobile (App-like feel) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-lg border-t border-[#17231d]/10 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
          {[
            ...tabs,
            { to: '/doi-mat-khau', label: 'Tài khoản', icon: UserCircle2 },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-[#0f7a4f]' : 'text-[#59665f]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex items-center justify-center w-8 h-8 rounded-xl transition-colors ${
                      isActive ? 'bg-[#0f7a4f]/12 text-[#0f7a4f]' : ''
                    }`}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  <span className={isActive ? 'font-bold' : 'font-medium'}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
