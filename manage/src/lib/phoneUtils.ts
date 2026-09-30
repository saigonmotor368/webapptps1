/**
 * Utility chuẩn hóa và kiểm tra số điện thoại Việt Nam (TPS1)
 */

export function cleanPhoneNumber(phone: string): string {
  return String(phone || '').replace(/[\s.-]/g, '');
}

export function isValidVietnamesePhone(phone: string): boolean {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return false;
  // Di động 10 số (03, 05, 07, 08, 09) hoặc Cố định 11 số (02x)
  return /^(0|\+84)(([35789][0-9]{8})|(2[0-9]{9}))$/.test(cleaned);
}

export function formatVietnamesePhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const cleaned = cleanPhoneNumber(phone);
  if (/^0[35789][0-9]{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  if (/^02[0-9]{9}$/.test(cleaned)) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}
