import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { can, ROLE_LABELS } from '../lib/permissions';
import {
  LayoutDashboard, ShoppingCart, Users, PackageOpen, LogOut, PlusSquare, Package,
  Wallet, BarChart3, MoreHorizontal, X, ClipboardList, Tag, Truck,
} from 'lucide-react';

// GIAI ĐOẠN A/E: 2 bộ khung điều hướng riêng theo userType — chặn thật sự
// nằm ở route guard trong App.tsx (StaffOnlyRoute/CustomerOnlyRoute), đây
// chỉ là ẩn/hiện menu cho gọn giao diện.
export default function SaleLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const isCustomer = user?.userType === 'customer';
  const role = user?.role ?? '';

  const navItems = isCustomer
    ? [
        { path: '/', icon: <ShoppingCart size={20} />, label: 'Đặt hàng' },
        { path: '/don-hang-cua-toi', icon: <ClipboardList size={20} />, label: 'Đơn hàng của tôi' },
      ]
    : [
        // Dashboard — mọi nhân viên
        { path: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard', perm: null },
        // Đơn hàng — mọi nhân viên có quyền xem
        can(role, 'orders.view') && { path: '/don-hang', icon: <ShoppingCart size={20} />, label: 'Quản lý Đơn hàng', perm: 'orders.view' },
        // Tạo đơn POS — chỉ sale/admin/truong_phong
        can(role, 'orders.create') && { path: '/tao-don-hang', icon: <PlusSquare size={20} />, label: 'Tạo đơn (POS)', perm: 'orders.create' },
        // Áp giá — admin/truong_phong/sale/thu_mua (Thu mua báo giá lại, sale áp giá rồi soạn đơn ra phiếu tạm)
        can(role, 'pricing.edit') && { path: '/ap-gia-hang-ngay', icon: <Tag size={20} />, label: 'Áp giá hàng ngày', perm: 'pricing.edit' },
        // Đơn tổng (Thu mua) — admin/truong_phong/sale/thu_mua/kho (yêu cầu 2026-09-20)
        can(role, 'procurement.view') && { path: '/don-tong', icon: <Truck size={20} />, label: 'Đơn tổng', perm: 'procurement.view' },
        // Khách hàng
        can(role, 'customers.view') && { path: '/khach-hang', icon: <Users size={20} />, label: 'Quản lý Khách hàng', perm: 'customers.view' },
        // Hàng hóa
        can(role, 'products.view') && { path: '/hang-hoa', icon: <Package size={20} />, label: 'Hàng hóa', perm: 'products.view' },
        // Soạn hàng — admin/truong_phong/sale/thu_mua/kho (sale soạn đơn ra phiếu tạm)
        can(role, 'orders.packing') && { path: '/soan-hang', icon: <PackageOpen size={20} />, label: 'Xử lý đơn hàng', perm: 'orders.packing' },
        // Công nợ — admin/truong_phong/ke_toan
        can(role, 'finance.view') && { path: '/cong-no', icon: <Wallet size={20} />, label: 'Công nợ', perm: 'finance.view' },
        // Báo cáo — admin/truong_phong/ke_toan
        can(role, 'reports.view') && { path: '/bao-cao', icon: <BarChart3 size={20} />, label: 'Báo cáo', perm: 'reports.view' },
      ].filter(Boolean) as { path: string; icon: React.ReactNode; label: string; perm: string | null }[];

  // Mobile: chỉ hiện 4 mục dùng nhiều nhất, còn lại gom vào nút "Thêm".
  const MOBILE_PRIMARY_PATHS = ['/', '/don-hang', '/tao-don-hang', '/hang-hoa'];
  const primaryItems = isCustomer ? navItems : navItems.filter((i) => MOBILE_PRIMARY_PATHS.includes(i.path));
  const moreItems = isCustomer ? [] : navItems.filter((i) => !MOBILE_PRIMARY_PATHS.includes(i.path));

  const isActivePath = (path: string) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <div className="flex h-screen bg-[#F4F7F6] text-slate-800 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm z-20">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-md">
            T1
          </div>
          <div>
            <h1 className="font-bold text-green-900 leading-tight">TPS1 System</h1>
            <p className="text-xs text-slate-500">
              {isCustomer ? `Khách hàng ${user?.tier || ''}`.trim() : (ROLE_LABELS[role] || role)}
            </p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                isActivePath(item.path) ? 'bg-green-100 text-green-800' : 'text-slate-600 hover:bg-green-50 hover:text-green-700'
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl mb-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm uppercase">
              {user?.name?.substring(0, 2) || 'AD'}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-semibold truncate">{user?.name || 'User'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 font-medium transition-colors"
          >
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col relative h-full overflow-y-auto overflow-x-hidden bg-slate-50/50">
        {/* Background Image / Decoration */}
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-green-600/10 to-transparent -z-10 pointer-events-none"></div>

        <div className="p-3 sm:p-4 md:p-6 xl:p-8 flex-1 min-w-0 w-full max-w-7xl mx-auto pb-24 md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile "Thêm" sheet */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-40 flex items-end" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/30"></div>
          <div className="relative w-full bg-white rounded-t-2xl p-4 pb-safe space-y-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-slate-700">Thêm</p>
              <button onClick={() => setShowMore(false)} className="p-1 text-slate-400"><X size={20} /></button>
            </div>
            {moreItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setShowMore(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  isActivePath(item.path) ? 'bg-green-100 text-green-800' : 'text-slate-600 hover:bg-green-50'
                }`}
              >
                {item.icon} {item.label}
              </Link>
            ))}
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 font-medium transition-colors"
            >
              <LogOut size={18} /> Đăng xuất
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex justify-around items-center h-16 z-30 px-2 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {primaryItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              isActivePath(item.path) ? 'text-green-600' : 'text-slate-500 hover:text-green-600'
            }`}
          >
            <div className="mb-1">{item.icon}</div>
            <span className="text-[10px] font-medium whitespace-nowrap">{item.label.replace('Quản lý ', '').replace('Tạo đơn ', '')}</span>
          </Link>
        ))}
        {isCustomer ? (
          <button
            onClick={logout}
            className="flex flex-col items-center justify-center w-full h-full text-red-500 hover:text-red-600 transition-colors"
          >
            <div className="mb-1"><LogOut size={20} /></div>
            <span className="text-[10px] font-medium whitespace-nowrap">Đăng xuất</span>
          </button>
        ) : (
          <button
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-green-600 transition-colors"
          >
            <div className="mb-1"><MoreHorizontal size={20} /></div>
            <span className="text-[10px] font-medium whitespace-nowrap">Thêm</span>
          </button>
        )}
      </nav>
    </div>
  );
}
