/**
 * Lấy URL base cho các API backend (/api/**).
 * - Nếu có VITE_API_BASE_URL (trong env) -> ưu tiên dùng
 * - Nếu đang ở localhost (cả dev 5173 lẫn preview 4173) -> dùng '' để đi qua Vite proxy
 * - Nếu ở production (đặc biệt là bản build manage triển khai trên origin khác) -> fallback https://thucphamsomot.vn
 */
export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return '';
  }
  if (import.meta.env.DEV) return '';
  return 'https://thucphamsomot.vn';
}

export const API_BASE = getApiBase();
