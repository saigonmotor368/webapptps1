/**
 * Lấy URL base cho các API backend (/api/**).
 * - Nếu có VITE_API_BASE_URL (trong env) -> ưu tiên dùng
 * - Nếu đang ở chế độ dev (Vite localhost:5173 có proxy /api -> 3001) -> dùng ''
 * - Nếu ở production (đặc biệt là bản build manage triển khai trên origin khác) -> fallback https://thucphamsomot.vn
 */
export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (import.meta.env.DEV) return '';
  return 'https://thucphamsomot.vn';
}

export const API_BASE = getApiBase();
