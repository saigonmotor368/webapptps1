import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SaleLayout from './layouts/SaleLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import PosCreatePage from './pages/PosCreatePage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import SoanHangPage from './pages/SoanHangPage';
import BulkPricingPage from './pages/BulkPricingPage';
import MyOrdersPage from './pages/MyOrdersPage';
import MyOrderDetailPage from './pages/MyOrderDetailPage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CongNoPage from './pages/CongNoPage';
import BaoCaoPage from './pages/BaoCaoPage';
import DatHangPage from './pages/DatHangPage';
import DatHangExcelPage from './pages/DatHangExcelPage';

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
const StaffOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/dang-nhap" />;
  if (user.userType !== 'staff') return <Navigate to="/" replace />;
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
        <Routes>
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><SaleLayout /></ProtectedRoute>}>
            <Route index element={<HomeRoute />} />
            <Route path="don-hang" element={<StaffOnlyRoute><OrdersPage /></StaffOnlyRoute>} />
            <Route path="don-hang/:id" element={<StaffOnlyRoute><OrderDetailPage /></StaffOnlyRoute>} />
            <Route path="tao-don-hang" element={<StaffOnlyRoute><PosCreatePage /></StaffOnlyRoute>} />
            <Route path="khach-hang" element={<StaffOnlyRoute><CustomersPage /></StaffOnlyRoute>} />
            <Route path="khach-hang/moi" element={<StaffOnlyRoute><CustomerDetailPage /></StaffOnlyRoute>} />
            <Route path="khach-hang/:id" element={<StaffOnlyRoute><CustomerDetailPage /></StaffOnlyRoute>} />
            <Route path="hang-hoa" element={<StaffOnlyRoute><ProductsPage /></StaffOnlyRoute>} />
            <Route path="hang-hoa/:id" element={<StaffOnlyRoute><ProductDetailPage /></StaffOnlyRoute>} />
            <Route path="soan-hang" element={<StaffOnlyRoute><SoanHangPage /></StaffOnlyRoute>} />
            <Route path="ap-gia-hang-ngay" element={<StaffOnlyRoute><BulkPricingPage /></StaffOnlyRoute>} />
            <Route path="cong-no" element={<StaffOnlyRoute><CongNoPage /></StaffOnlyRoute>} />
            <Route path="bao-cao" element={<StaffOnlyRoute><BaoCaoPage /></StaffOnlyRoute>} />
            <Route path="don-hang-cua-toi" element={<CustomerOnlyRoute><MyOrdersPage /></CustomerOnlyRoute>} />
            <Route path="don-hang-cua-toi/:id" element={<CustomerOnlyRoute><MyOrderDetailPage /></CustomerOnlyRoute>} />
            <Route path="dat-hang/excel" element={<CustomerOnlyRoute><DatHangExcelPage /></CustomerOnlyRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
