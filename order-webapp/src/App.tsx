import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import CustomerLayout from './layouts/CustomerLayout';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProductsPage from './pages/ProductsPage';
import CartPage from './pages/CartPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import ExcelOrderPage from './pages/ExcelOrderPage';

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0B130E] text-white">Đang tải...</div>
);

// Toàn bộ app này CHỈ dành cho khách hàng — không có khái niệm nhân viên
// hay route nội bộ nào để bảo vệ, nên không cần StaffOnlyRoute/CustomerOnlyRoute
// như sale-webapp. Route guard duy nhất cần là "đã đăng nhập chưa" và "có bị
// bắt buộc đổi mật khẩu không".
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/dang-nhap" />;
  // Mật khẩu do sale cấp lần đầu bắt buộc phải đổi trước khi làm gì khác —
  // chặn cứng ở đây, không chỉ ẩn/hiện nút trên giao diện.
  if (session.mustChangePassword && location.pathname !== '/doi-mat-khau') {
    return <Navigate to="/doi-mat-khau" replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Router>
          <Routes>
            <Route path="/dang-nhap" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <CustomerLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<ProductsPage />} />
              <Route path="gio-hang" element={<CartPage />} />
              <Route path="dat-hang/excel" element={<ExcelOrderPage />} />
              <Route path="don-hang" element={<OrdersPage />} />
              <Route path="don-hang/:id" element={<OrderDetailPage />} />
              <Route path="doi-mat-khau" element={<ChangePasswordPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
