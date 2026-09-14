import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../lib/api';

// Dùng chung cho 2 trường hợp: (1) bắt buộc đổi ngay sau lần đăng nhập đầu
// (session.mustChangePassword=true, mật khẩu do sale cấp) và (2) khách tự
// vào đổi mật khẩu bình thường sau này — cùng 1 form, chỉ khác chỗ điều
// hướng sau khi đổi xong.
export default function ChangePasswordPage() {
  const { session, setSession } = useAuth();
  const navigate = useNavigate();
  const forced = Boolean(session?.mustChangePassword);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải từ 6 ký tự trở lên');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setLoading(true);
    try {
      const res = await api.changePassword(oldPassword, newPassword);
      setSession(res.session);
      setDone(true);
      setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đổi được mật khẩu, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-sm border border-[#14231c]/10 p-8 max-w-md w-full">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#0f6f4b]/10 text-[#0f6f4b] flex items-center justify-center mb-3">
            <KeyRound size={26} />
          </div>
          <h1 className="text-xl font-bold text-[#14231c]">
            {forced ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}
          </h1>
          {forced && (
            <p className="text-sm text-[#59665f] mt-1">
              Đây là lần đăng nhập đầu tiên — vui lòng đặt mật khẩu mới trước khi tiếp tục sử dụng.
            </p>
          )}
        </div>

        {done ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 className="mx-auto text-[#0f6f4b]" size={36} />
            <p className="font-medium text-[#14231c]">Đổi mật khẩu thành công!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">
                {forced ? 'Mật khẩu được cấp' : 'Mật khẩu hiện tại'}
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/30"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">
                Mật khẩu mới (từ 6 ký tự)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/30"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#59665f] uppercase tracking-wider mb-1.5">
                Nhập lại mật khẩu mới
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-[#14231c]/15 rounded-xl py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-[#0f6f4b]/30"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0f6f4b] hover:bg-[#0b5a3c] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
