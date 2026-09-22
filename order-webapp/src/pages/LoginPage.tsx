import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Eye,
  EyeOff,
  Truck,
  ShieldCheck,
  Clock3,
  FileSpreadsheet,
  PhoneCall,
  HelpCircle,
  X,
  ArrowRight,
  Leaf,
  Sparkles,
  Building2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';

const REMEMBER_KEY = 'tps1_remembered_customer_code';

export default function LoginPage() {
  const [code, setCode] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
  const [password, setPassword] = useState('');
  const [rememberCode, setRememberCode] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Tự động đồng bộ việc lưu/xoá mã khách hàng khi toggle rememberCode
  useEffect(() => {
    if (rememberCode && code.trim()) {
      localStorage.setItem(REMEMBER_KEY, code.trim().toUpperCase());
    } else if (!rememberCode) {
      localStorage.removeItem(REMEMBER_KEY);
    }
  }, [rememberCode, code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      setError('Vui lòng nhập mã khách hàng');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }

    setLoading(true);
    try {
      if (rememberCode) {
        localStorage.setItem(REMEMBER_KEY, cleanCode);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      const session = await login(cleanCode, password);
      navigate(session.mustChangePassword ? '/doi-mat-khau' : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra, vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05140d] text-white flex flex-col lg:flex-row relative overflow-hidden selection:bg-emerald-500 selection:text-white">
      {/* Background ambient lighting effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[-10%] w-[55vw] h-[55vw] rounded-full bg-emerald-600/15 blur-[140px] animate-pulse-subtle" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-amber-600/10 blur-[130px] animate-pulse-subtle" />
      </div>

      {/* ========================================================================= */}
      {/* CỘT TRÁI (DESKTOP): HERO BRANDING, HÌNH NỀN ẨM THỰC CAO CẤP & SOCIAL PROOF */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[52%] relative flex-col justify-between p-10 xl:p-14 overflow-hidden">
        {/* Hình nền ẩm thực cao cấp */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-105 hover:scale-100"
          style={{ backgroundImage: `url('/images/tps1-bg-fresh.jpg')` }}
        />
        {/* Lớp phủ gradient màu thương hiệu sang trọng, tạo độ sâu và dễ đọc chữ */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#05140d] via-[#072418]/85 to-[#05140d]/70 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-radial from-transparent via-[#05140d]/40 to-[#05140d]/80" />

        {/* Top bar thương hiệu */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="inline-flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl shadow-black/40 border border-white/50">
            <img
              src="/images/tps1-logo-horizontal.png"
              alt="Thực Phẩm Số Một"
              className="h-9 w-auto object-contain"
            />
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 text-emerald-300 text-xs font-semibold tracking-wide shadow-lg">
            <Leaf size={14} className="text-emerald-400" />
            <span>CHUỖI CUNG ỨNG THỰC PHẨM SẠCH B2B</span>
          </div>
        </div>

        {/* Nội dung giới thiệu & Điểm chạm thương hiệu */}
        <div className="relative z-10 my-auto py-8 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-medium">
            <Sparkles size={13} className="text-amber-400" />
            <span>Hệ sinh thái đặt hàng chuyên nghiệp cho bếp ăn doanh nghiệp</span>
          </div>

          <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-extrabold text-white leading-[1.2] tracking-tight">
            Nguồn hàng thực phẩm tươi sạch, ổn định giá cho mọi bếp ăn.
          </h1>

          <p className="text-emerald-100/80 text-base xl:text-lg leading-relaxed font-light">
            Cổng đặt hàng trực tuyến dành cho khách hàng doanh nghiệp, giúp tra cứu bảng giá riêng,
            đặt hàng và theo dõi tiến độ xử lý trên cùng một hệ thống.
          </p>

          {/* 3 cam kết dịch vụ */}
          <div className="grid grid-cols-1 gap-3.5 pt-2">
            {[
              {
                icon: Truck,
                title: 'Giao hàng xe lạnh chuyên dụng',
                desc: 'Đảm bảo độ tươi ngon nguyên vẹn, giao đúng giờ theo từng ca bếp.',
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/15 border-emerald-500/25',
              },
              {
                icon: ShieldCheck,
                title: 'Bảng giá theo từng khách hàng',
                desc: 'Hiển thị mức giá đang áp dụng cho tài khoản và từng mặt hàng.',
                color: 'text-amber-400',
                bg: 'bg-amber-500/15 border-amber-500/25',
              },
              {
                icon: FileSpreadsheet,
                title: 'Đặt hàng đa kênh & File Excel',
                desc: 'Lên đơn trực tiếp hoặc tải file Excel khi cần nhập danh sách nhiều mặt hàng.',
                color: 'text-teal-300',
                bg: 'bg-teal-500/15 border-teal-500/25',
              },
            ].map(({ icon: Icon, title, desc, color, bg }) => (
              <div
                key={title}
                className="flex items-start gap-4 p-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] backdrop-blur-md border border-white/10 transition-all duration-300 shadow-md"
              >
                <div className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center shrink-0 ${color}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white tracking-wide">{title}</h2>
                  <p className="text-xs text-emerald-100/70 mt-0.5 leading-normal">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Social Proof / Doanh nghiệp tin cậy */}
        <div className="relative z-10 pt-4 border-t border-white/10 space-y-2">
          <p className="text-[11px] font-semibold text-emerald-100/50 uppercase tracking-widest flex items-center gap-1.5">
            <Building2 size={13} />
            Hệ thống đặt hàng dành cho khách hàng doanh nghiệp của TPS1
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-emerald-100/75 font-medium">
            {['Bếp ăn doanh nghiệp', 'Nhà máy', 'Trường học', 'Đơn vị suất ăn'].map((name) => (
              <span
                key={name}
                className="px-2.5 py-1 rounded-lg bg-white/[0.07] border border-white/10 backdrop-blur-sm"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CỘT PHẢI (DESKTOP) & TOÀN BỘ MÀN HÌNH (MOBILE): THẺ ĐĂNG NHẬP SANG TRỌNG */}
      <div className="flex-1 relative flex items-center justify-center p-5 sm:p-8 lg:p-12 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
        <div className="absolute inset-0 bg-gradient-to-b from-[#05140d]/90 via-[#05140d]/95 to-[#05140d] pointer-events-none" />

        <div className="tps1-rise relative z-10 w-full max-w-md">
          {/* Header trên Mobile (Logo + Tên thương hiệu) */}
          <div className="lg:hidden flex flex-col items-center text-center mb-6">
            <div className="bg-white/95 px-4 py-2.5 rounded-2xl shadow-xl border border-white/50 mb-3">
              <img
                src="/images/tps1-logo-horizontal.png"
                alt="Thực Phẩm Số Một"
                className="h-8 w-auto object-contain"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-medium bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/30">
              <Leaf size={12} className="text-emerald-400" />
              <span>CỔNG ĐẶT HÀNG KHÁCH HÀNG DOANH NGHIỆP</span>
            </div>
          </div>

          {/* Card Đăng nhập Frosted Glassmorphism cao cấp */}
          <div className="glass-panel rounded-[32px] shadow-2xl shadow-black/60 p-7 sm:p-9 relative overflow-hidden border border-white/[0.16]">
            {/* Viền sáng trên đỉnh card */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />

            {/* Tiêu đề form */}
            <div className="mb-7">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Đăng nhập</span>
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 tracking-wider">
                  TPS1 B2B
                </span>
              </div>
              <p className="text-sm text-emerald-100/65 mt-1.5 leading-relaxed">
                Nhập mã khách hàng và mật khẩu được TPS1 cấp để truy cập bảng giá &amp; đặt hàng.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {/* Field: Mã khách hàng */}
              <div>
                <label className="block text-xs font-semibold text-emerald-100/75 uppercase tracking-wider mb-2">
                  Mã khách hàng
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400/70">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="glass-input w-full rounded-2xl py-3.5 pl-12 pr-4 text-white font-medium tracking-wide placeholder:text-white/25 placeholder:font-normal focus:outline-none"
                    placeholder="VD: VIP001, KH-TOYOTA..."
                    autoCapitalize="characters"
                    autoComplete="username"
                    required
                  />
                  {code && (
                    <button
                      type="button"
                      onClick={() => setCode('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 p-1 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Field: Mật khẩu */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-emerald-100/75 uppercase tracking-wider">
                    Mật khẩu
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowHelpModal(true)}
                    className="text-xs text-amber-300 hover:text-amber-200 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle size={13} />
                    <span>Quên mật khẩu?</span>
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400/70">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="glass-input w-full rounded-2xl py-3.5 pl-12 pr-12 text-white font-medium placeholder:text-white/25 placeholder:font-normal focus:outline-none"
                    placeholder="Nhập mật khẩu của bạn..."
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/90 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Tiện ích: Ghi nhớ đăng nhập */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 text-xs text-emerald-100/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberCode}
                    onChange={(e) => setRememberCode(e.target.checked)}
                    className="w-4 h-4 rounded-md border-white/20 bg-white/10 text-emerald-500 focus:ring-emerald-400/30 accent-emerald-500 cursor-pointer"
                  />
                  <span>Ghi nhớ mã khách hàng</span>
                </label>
              </div>

              {/* Thông báo lỗi nếu có */}
              {error && (
                <div className="p-3.5 bg-red-500/15 border border-red-500/30 rounded-2xl animate-shake">
                  <p className="text-red-300 text-xs sm:text-sm text-center font-medium leading-relaxed">
                    {error}
                  </p>
                </div>
              )}

              {/* Nút bấm Submit CTA chính */}
              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer group relative overflow-hidden bg-gradient-to-r from-emerald-600 via-[#0f7d54] to-emerald-600 hover:from-emerald-500 hover:via-emerald-600 hover:to-emerald-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-emerald-950/60 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2.5 text-sm sm:text-base tracking-wide border border-emerald-400/20"
              >
                {/* Ánh sáng lướt qua khi hover */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>ĐANG XÁC THỰC...</span>
                  </>
                ) : (
                  <>
                    <span>ĐĂNG NHẬP ĐẶT HÀNG</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Chân thẻ: Hỗ trợ Hotline & CSKH */}
            <div className="mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-100/60">
              <span className="flex items-center gap-1.5">
                <Clock3 size={13} className="text-emerald-400" />
                <span>Đặt hàng và theo dõi đơn trực tuyến</span>
              </span>
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="text-emerald-300 hover:text-emerald-200 underline font-medium cursor-pointer"
              >
                Hotline hỗ trợ &amp; Cấp tài khoản
              </button>
            </div>
          </div>

          {/* Huy hiệu cam kết bảo mật & tiêu chuẩn dưới form */}
          <div className="mt-6 flex items-center justify-center gap-6 text-[11px] text-emerald-100/40">
            <span className="flex items-center gap-1">
              <ShieldCheck size={14} className="text-emerald-400/60" />
              <span>Kết nối được mã hóa</span>
            </span>
            <span className="flex items-center gap-1">
              <Leaf size={14} className="text-emerald-400/60" />
              <span>Dữ liệu tài khoản riêng biệt</span>
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL HỖ TRỢ KHÁCH HÀNG / QUÊN MẬT KHẨU / CẤP TÀI KHOẢN MỚI */}
      {/* ========================================================================= */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 sm:p-7 border border-white/20 shadow-2xl relative">
            <button
              onClick={() => setShowHelpModal(false)}
              className="absolute top-5 right-5 text-white/50 hover:text-white p-1 rounded-xl hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                <PhoneCall size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Hỗ trợ khách hàng</h3>
                <p className="text-xs text-emerald-100/60">Cấp mới tài khoản hoặc đặt lại mật khẩu</p>
              </div>
            </div>

            <p className="text-sm text-emerald-100/80 leading-relaxed mb-5">
              Vì lý do an toàn bảo mật đơn hàng doanh nghiệp và bảng giá hợp đồng, vui lòng liên hệ nhân viên
              kinh doanh phụ trách hoặc hotline TPS1 để được hỗ trợ cấp lại mật khẩu:
            </p>

            <div className="space-y-2.5 mb-5">
              <a
                href="tel:0898902222"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 transition-all text-white group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <PhoneCall size={16} />
                  </div>
                  <div>
                    <div className="text-xs text-emerald-100/60 font-medium">Tổng đài CSKH &amp; Đặt hàng</div>
                    <div className="text-base font-bold text-emerald-300">089 890 2222</div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                  Gọi ngay →
                </span>
              </a>

            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors"
            >
              Đóng cửa sổ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
