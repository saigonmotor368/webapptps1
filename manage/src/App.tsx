import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { can } from './lib/permissions';
import SaleLayout from './layouts/SaleLayout';
import LoginPage from './pages/LoginPage';
const CHUNK_RELOAD_KEY = 'tps1_manage_chunk_reload';
function lazyPage(loader: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(async () => {
    try {
      const module = await loader();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return module;
    } catch (error) {
      // Khi deploy, tab đang mở có thể giữ index cũ nhưng chunk cũ đã đổi tên.
      // Tự reload đúng một lần để lấy manifest mới, tránh màn hình trắng.
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return await new Promise<never>(() => undefined);
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      throw error;
    }
  });
}

const DashboardPage = lazyPage(() => import('./pages/WorkspaceDashboardPage'));
const OrdersPage = lazyPage(() => import('./pages/OrdersPage'));
const OrderDetailPage = lazyPage(() => import('./pages/OrderDetailPage'));
const PosCreatePage = lazyPage(() => import('./pages/PosCreatePage'));
const CustomersPage = lazyPage(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazyPage(() => import('./pages/CustomerDetailPage'));
const SoanHangPage = lazyPage(() => import('./pages/SoanHangPage'));
const BulkPricingPage = lazyPage(() => import('./pages/BulkPricingPage'));
const MyOrdersPage = lazyPage(() => import('./pages/MyOrdersPage'));
const MyOrderDetailPage = lazyPage(() => import('./pages/MyOrderDetailPage'));
const ProductsPage = lazyPage(() => import('./pages/ProductsPage'));
const ProductDetailPage = lazyPage(() => import('./pages/ProductDetailPage'));
const CongNoPage = lazyPage(() => import('./pages/CongNoPage'));
const BaoCaoPage = lazyPage(() => import('./pages/BaoCaoPage'));
const DatHangPage = lazyPage(() => import('./pages/DatHangPage'));
const DatHangExcelPage = lazyPage(() => import('./pages/DatHangExcelPage'));
const DonTongPage = lazyPage(() => import('./pages/DonTongPage'));

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0B130E] text-white">Đang tải...</div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/dang-nhap" />;
  return <>{children}</>;
};

// GIAI ĐOẠN A: route guard chặn CỨNG ở tầng router — không chỉ ẩn menu trong
// SaleLayout. Khách hàng gõ thẳng URL nội bộ như /pos, /don-hang, /khach-hang
// phải bị redirect về "/" (Đơn hàng của tôi), không được render nội dung nhân
// viên dù chỉ trong một khoảnh khắc.
// `perm` (tùy chọn): nếu có, nhân viên không đủ quyền bị chuyển về "/" kèm
// cảnh báo. Chặn thật sự vẫn ở API (401/403). (yêu cầu 2026-09-20)
const StaffOnlyRoute = ({ children, perm }: { children: React.ReactNode; perm?: string }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/dang-nhap" />;
  if (user.userType !== 'staff') return <Navigate to="/" replace />;
  if (perm && !can(user.role, perm)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Giai đoạn E: khách hàng vào "/" giờ thấy trang Đặt hàng (tự lên đơn) thay
// vì chỉ xem lại đơn cũ như trước — "Đơn hàng của tôi" chuyển thành mục
// riêng /don-hang-cua-toi.
const HomeRoute = () => {
  const { user } = useAuth();
  return user?.userType === 'customer' ? <DatHangPage /> : <DashboardPage />;
};

// Ngược lại với StaffOnlyRoute — chặn nhân viên vào nhầm luồng đặt hàng của
// khách (vd gõ thẳng URL), không chỉ dựa vào việc ẩn menu.
const CustomerOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/dang-nhap" />;
  if (user.userType !== 'customer') return <Navigate to="/" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><SaleLayout /></ProtectedRoute>}>
            <Route index element={<HomeRoute />} />
            <Route path="don-hang" element={<StaffOnlyRoute perm="orders.view"><OrdersPage /></StaffOnlyRoute>} />
            <Route path="don-hang/:id" element={<StaffOnlyRoute perm="orders.view"><OrderDetailPage /></StaffOnlyRoute>} />
            <Route path="tao-don-hang" element={<StaffOnlyRoute perm="orders.create"><PosCreatePage /></StaffOnlyRoute>} />
            <Route path="khach-hang" element={<StaffOnlyRoute perm="customers.view"><CustomersPage /></StaffOnlyRoute>} />
            <Route path="khach-hang/moi" element={<StaffOnlyRoute perm="customers.edit"><CustomerDetailPage /></StaffOnlyRoute>} />
            <Route path="khach-hang/:id" element={<StaffOnlyRoute perm="customers.view"><CustomerDetailPage /></StaffOnlyRoute>} />
            <Route path="hang-hoa" element={<StaffOnlyRoute perm="products.view"><ProductsPage /></StaffOnlyRoute>} />
            <Route path="hang-hoa/:id" element={<StaffOnlyRoute perm="products.view"><ProductDetailPage /></StaffOnlyRoute>} />
            <Route path="soan-hang" element={<StaffOnlyRoute perm="orders.packing"><SoanHangPage /></StaffOnlyRoute>} />
            <Route path="ap-gia-hang-ngay" element={<StaffOnlyRoute perm="pricing.edit"><BulkPricingPage /></StaffOnlyRoute>} />
            {/* /don-tong: WP5 - Đơn tổng & tổng hợp soạn hàng cho Thu mua */}
            <Route path="don-tong" element={<StaffOnlyRoute perm="procurement.view"><DonTongPage /></StaffOnlyRoute>} />
            <Route path="cong-no" element={<StaffOnlyRoute perm="finance.view"><CongNoPage /></StaffOnlyRoute>} />
            <Route path="bao-cao" element={<StaffOnlyRoute perm="reports.view"><BaoCaoPage /></StaffOnlyRoute>} />
            <Route path="don-hang-cua-toi" element={<CustomerOnlyRoute><MyOrdersPage /></CustomerOnlyRoute>} />
            <Route path="don-hang-cua-toi/:id" element={<CustomerOnlyRoute><MyOrderDetailPage /></CustomerOnlyRoute>} />
            <Route path="dat-hang/excel" element={<CustomerOnlyRoute><DatHangExcelPage /></CustomerOnlyRoute>} />
          </Route>
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
