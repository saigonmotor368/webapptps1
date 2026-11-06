import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import CustomerLayout from './layouts/CustomerLayout';
import LoginPage from './pages/LoginPage';
import ProductsPage from './pages/ProductsPage';
import RegisterPage from './pages/RegisterPage';
import { LanguageProvider } from './contexts/LanguageContext';

const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'));
const ExcelOrderPage = lazy(() => import('./pages/ExcelOrderPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));

const LoadingScreen = () => (
  <div className="fixed inset-0 min-h-screen bg-white flex flex-col items-center justify-center z-50">
    <img
      src={`${import.meta.env.BASE_URL}images/tps1-logo-vertical.png`}
      alt="Thực Phẩm Số Một"
      className="w-36 max-w-[50vw] h-auto object-contain mb-6 animate-pulse"
    />
    <div className="w-8 h-8 border-3 border-[#eaf6ef] border-t-[#0f7a4f] rounded-full animate-spin" />
    <p className="mt-3 text-xs font-medium text-[#59665f] tracking-wide">Đang tải dữ liệu...</p>
  </div>
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

function NativeBackButton() {
  const location = useLocation();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (location.pathname === '/') void NativeApp.exitApp();
      else window.history.back();
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [location.pathname]);
  return null;
}

function App() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) void SplashScreen.hide();
  }, []);
  const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;
  return (
    <LanguageProvider><AuthProvider>
      <CartProvider>
        <Router>
          <NativeBackButton />
          <Suspense fallback={<LoadingScreen />}><Routes>
            <Route path="/dang-nhap" element={<LoginPage />} />
            <Route path="/dang-ky" element={<RegisterPage />} />
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
              <Route path="tai-khoan" element={<AccountPage />} />
              <Route path="doi-mat-khau" element={<ChangePasswordPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes></Suspense>
        </Router>
      </CartProvider>
    </AuthProvider></LanguageProvider>
  );
}

export default App;
