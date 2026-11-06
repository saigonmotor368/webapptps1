import { CheckCircle2, ArrowRight, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';

function money(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + 'đ';
}

interface OrderSuccessModalProps {
  order: { code: string; total: number; pendingPriceCount?: number } | null;
  onClose: () => void;
  pendingVerification?: boolean;
}

export default function OrderSuccessModal({ order, onClose, pendingVerification }: OrderSuccessModalProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#17231d]/10 text-center space-y-4 animate-scale-up">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-[#0f7a4f] flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 size={36} />
        </div>

        <div>
          <h3 className="text-xl font-black text-[#17231d]">{t('Gửi đơn đặt hàng thành công!')}</h3>
          {pendingVerification && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('Đã gửi đơn, chờ TPS1 xác minh tài khoản và xác nhận đơn.')}</p>}
          {order.pendingPriceCount ? <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('Có mặt hàng đang chờ sale báo giá. Sale sẽ nhập giá hoặc bỏ mặt hàng không có hàng trước khi xác nhận đơn.')}</p> : null}
          <p className="text-sm text-[#59665f] mt-1.5">
            {t('Mã đơn hàng:')}{' '}
            <span className="font-mono font-bold text-[#0f7a4f] text-base px-2 py-0.5 bg-[#0f7a4f]/10 rounded-lg">
              {order.code}
            </span>
          </p>
          {order.total > 0 && (
            <p className="text-xs text-[#59665f] mt-1">
              {t('Tạm tính:')} <strong className="font-mono text-[#17231d]">{money(order.total)}</strong>
            </p>
          )}
        </div>

        <div className="text-xs text-[#59665f] leading-relaxed bg-[#f8faf7] p-3.5 rounded-2xl border border-[#17231d]/8 text-left space-y-1.5">
          <p className="font-semibold text-[#17231d]">{t('Quy trình xử lý đơn:')}</p>
          <ul className="list-disc list-inside space-y-1 text-[#59665f]">
            <li>{t('Bộ phận Bán hàng TPS1 sẽ xác nhận đơn và giá thực tế.')}</li>
            <li>{t('Kho lạnh chuẩn bị hàng và xếp xe giao theo đúng ca hẹn.')}</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-[#17231d]/15 text-[#17231d] text-xs font-bold hover:bg-[#f5f7f3] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <ShoppingBag size={14} />
            <span>{t('Tiếp tục đặt đơn')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/don-hang')}
            className="flex-1 py-3 px-4 rounded-xl bg-[#0f7a4f] hover:bg-[#0b4f34] text-white text-xs font-bold transition-all shadow-sm shadow-[#0f7a4f]/25 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>{t('Đơn hàng của tôi')}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
