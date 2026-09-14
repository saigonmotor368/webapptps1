import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, User, Key, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginStaff, loginCustomer } = useAuth();
  const navigate = useNavigate();

  // Màn đăng nhập DUY NHẤT cho cả nhân viên và khách hàng (Giai đoạn A) —
  // không hỏi trước "bạn là ai". Backend (/api/sale-auth) tự thử nhân viên
  // trước rồi đến khách hàng, trả về userType để biết đường điều hướng.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // In dev we proxy to http://localhost:3000, in prod Vercel rewrite or full URL
      const apiUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${apiUrl}/sale-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.userType === 'staff') {
        await loginStaff(
          { ...data.user, userType: 'staff' },
          { accessToken: data.accessToken, refreshToken: data.refreshToken }
        );
        navigate('/');
      } else if (res.ok && data.ok && data.userType === 'customer') {
        loginCustomer({ ...data.user, userType: 'customer' }, data.customerToken);
        navigate('/');
      } else {
        setError(data.error || 'Đăng nhập thất bại');
      }
    } catch (err) {
      setError('Có lỗi xảy ra, vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B130E] relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-900/30 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-green-900/20 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl m-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-green-900/30 rounded-2xl flex items-center justify-center mb-4 border border-green-500/20">
            <Lock className="text-green-500 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-white text-center">TPS1 HỆ THỐNG</h1>
          <p className="text-sm text-green-100/60 mt-1">Dành cho nhân viên &amp; khách hàng TPS1</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-green-100/60 uppercase tracking-wider mb-2">
              Email nhân viên hoặc Mã khách hàng
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all"
                placeholder="vd: sale@tps1.vn hoặc VIP001"
                autoCapitalize="none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-green-100/60 uppercase tracking-wider mb-2">
              Mật khẩu
            </label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-12 text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all"
                placeholder="Nhập mật khẩu..."
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full cursor-pointer bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-green-900/50 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {loading ? 'Đang xác thực...' : 'ĐĂNG NHẬP'}
          </button>
        </form>
        
        <p className="text-center text-xs text-white/30 mt-8">
          © 2026 Thực phẩm số một.<br />Hệ thống bán hàng nội bộ.
        </p>
      </div>
    </div>
  );
}

