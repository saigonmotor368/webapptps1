import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, ClipboardList, LogOut, FileSpreadsheet, UserCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import NotificationBell from '../components/NotificationBell';

const tabs = [
  { to: '/', label: 'Đặt hàng (POS)', icon: Package, end: true },
  { to: '/dat-hang/excel', label: 'Đặt hàng Excel', icon: FileSpreadsheet },
  { to: '/don-hang', label: 'Đơn hàng của tôi', icon: ClipboardList },
];

export default function CustomerLayout() {
  const { session, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/dang-nhap');
  };

  const initial = (session?.name || session?.company || 'K').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f1f3f0] flex flex-col">
      <header className="bg-gradient-to-r from-[#0a3d29] via-[#0d5337] to-[#0f6f4b] sticky top-0 z-30 shadow-md">
        <div className="max-w-[1720px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="bg-white/95 px-3 py-1.5 rounded-xl shadow-sm border border-white/40 shrink-0">
              <img
                src="/images/tps1-logo-horizontal.png"
                alt="TPS1"
                className="h-7 w-auto object-contain"
              />
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="font-semibold text-white text-sm leading-tight truncate">
                {session?.name || session?.company || 'Khách hàng VIP'}
              </p>
              <p className="text-[11px] text-emerald-100/75 truncate font-mono">
                {session?.code} {session?.tier ? `• Hạng ${session.tier}` : ''}
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1.5">
            {tabs.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white text-[#0a3d29] shadow-sm'
                      : 'text-white/85 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon size={16} /> {label}
              </NavLink>
            ))}
            <NavLink
              to="/doi-mat-khau"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-[#0a3d29]' : 'text-white/80 hover:bg-white/10'
                }`
              }
            >
              <UserCircle2 size={16} /> Tài khoản
            </NavLink>

            {/* Hotline hiển thị ngay góc phải giống KiotViet */}
            <a
              href="tel:0898902222"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 text-xs font-semibold tracking-wide ml-2"
              title="Tổng đài CSKH & Đặt hàng TPS1"
            >
              <span>☎ 089 890 2222</span>
            </a>

            <NotificationBell />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/10 transition-colors"
              title="Đăng xuất"
            >
              <LogOut size={16} />
            </button>
          </nav>

          <div className="flex md:hidden items-center gap-2">
            <a
              href="tel:0898902222"
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-400/30 text-[11px] font-bold"
            >
              0898902222
            </a>
            <NotificationBell />
            <button
              onClick={() => navigate('/doi-mat-khau')}
              className="w-8 h-8 rounded-full bg-white/15 border border-white/10 text-white font-bold flex items-center justify-center text-xs"
              aria-label="Tài khoản"
            >
              {initial}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1720px] mx-auto w-full px-2 sm:px-4 lg:px-6 py-3.5 flex-1 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Bottom tab bar — chỉ hiện trên mobile, đúng cảm giác app cài trên máy */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-lg border-t border-black/5 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]"
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
                  isActive ? 'text-[#0070f3]' : 'text-[#59665f]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex items-center justify-center w-8 h-8 rounded-xl transition-colors ${
                      isActive ? 'bg-[#0070f3]/10 text-[#0070f3]' : ''
                    }`}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
