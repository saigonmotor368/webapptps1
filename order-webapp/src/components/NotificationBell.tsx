import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { disablePush, enablePush, getPushStatus, isPushSupported } from '../lib/push';

// Nút bật/tắt thông báo đẩy — chủ động để khách bấm thay vì tự động xin quyền
// lúc mở app (trình duyệt/iOS chặn prompt tự động và tỉ lệ khách bấm "Cho
// phép" thấp hơn nhiều nếu không giải thích trước lý do).
export default function NotificationBell() {
  const [status, setStatus] = useState<'unsupported' | 'denied' | 'subscribed' | 'not-subscribed' | 'loading'>(
    'loading'
  );

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus('unsupported');
      return;
    }
    getPushStatus().then(setStatus);
  }, []);

  if (status === 'unsupported' || status === 'loading') return null;

  const handleClick = async () => {
    if (status === 'subscribed') {
      await disablePush();
      setStatus('not-subscribed');
      return;
    }
    setStatus('loading');
    const ok = await enablePush();
    setStatus(await getPushStatus());
    if (!ok) return;
  };

  const Icon = status === 'subscribed' ? BellRing : status === 'denied' ? BellOff : Bell;
  const title =
    status === 'subscribed'
      ? 'Đã bật thông báo — bấm để tắt'
      : status === 'denied'
        ? 'Bạn đã chặn thông báo trong cài đặt trình duyệt'
        : 'Bật thông báo đơn hàng';

  return (
    <button
      onClick={handleClick}
      disabled={status === 'denied'}
      title={title}
      className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
        status === 'subscribed' ? 'bg-[#e0742f]/90 text-white' : 'bg-white/15 text-white/90 hover:bg-white/25'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <Icon size={17} />
    </button>
  );
}
