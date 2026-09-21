/**
 * Phân quyền phía client — GIỮ ĐỒNG BỘ với lib/permissions.ts ở root repo.
 * Khi sửa ma trận quyền, sửa CẢ 2 file (yêu cầu 2026-09-20).
 *
 * Dùng trong SaleLayout (lọc menu) và StaffOnlyRoute (route guard).
 * Chặn THẬT SỰ vẫn ở phía API (401/403) — đây chỉ để gọn giao diện.
 */

export type Role =
  | 'admin'
  | 'truong_phong'
  | 'sale'
  | 'thu_mua'
  | 'kho'
  | 'ke_toan'
  | 'tai_xe';

/** Nhãn hiển thị cho từng role. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị / BGĐ',
  truong_phong: 'Trưởng phòng',
  sale: 'Sale / CSKH',
  thu_mua: 'Thu mua',
  kho: 'Vận hành / Kho',
  ke_toan: 'Kế toán',
  tai_xe: 'Tài xế',
};

const PERMISSIONS: Record<string, string[]> = {
  'orders.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  'orders.create': ['admin', 'truong_phong', 'sale'],
  'orders.bulk_confirm': ['admin', 'truong_phong', 'sale'],
  'orders.edit': ['admin', 'truong_phong', 'sale'],
  'orders.credit_override': ['admin', 'truong_phong'],
  'orders.packing': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  'procurement.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  'procurement.export': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  'products.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  'products.create': ['admin', 'thu_mua', 'sale'],
  'products.edit': ['admin', 'thu_mua'],
  'products.stock_in': ['admin', 'thu_mua'],
  'pricing.edit': ['admin', 'truong_phong', 'sale', 'thu_mua'],
  'customers.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'ke_toan'],
  'customers.edit': ['admin', 'truong_phong', 'sale'],
  'finance.view': ['admin', 'truong_phong', 'sale', 'ke_toan'],
  'finance.edit': ['admin', 'ke_toan'],
  'reports.view': ['admin', 'truong_phong', 'sale', 'ke_toan'],
  'admin.manage_staff': ['admin'],
};

/** Kiểm tra xem `role` có quyền `perm` không. */
export function can(role: string | undefined | null, perm: string): boolean {
  if (!role) return false;
  const allowed = PERMISSIONS[perm];
  if (!allowed) return false;
  return allowed.includes(role);
}
