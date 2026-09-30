/**
 * Phân quyền phía client — GIỮ ĐỒNG BỘ với lib/permissions.ts ở root repo.
 * Khi sửa ma trận quyền, sửa CẢ 2 file (yêu cầu 2026-09-20).
 *
 * Dùng trong SaleLayout (lọc menu) và StaffOnlyRoute (route guard).
 * Chặn THẬT SỰ vẫn ở phía API (401/403) — đây chỉ để gọn giao diện.
 */

export type Role =
  | 'admin'
  | 'ban_giam_doc'
  | 'truong_phong'
  | 'sale'
  | 'thu_mua'
  | 'kho'
  | 'ke_toan'
  | 'tai_xe';

/** Nhãn hiển thị cho từng role. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị hệ thống',
  ban_giam_doc: 'Ban Giám đốc',
  truong_phong: 'Trưởng phòng',
  sale: 'Sale / CSKH',
  thu_mua: 'Thu mua',
  kho: 'Vận hành / Kho',
  ke_toan: 'Kế toán',
  tai_xe: 'Tài xế',
};

const BASE_PERMISSIONS: Record<string, string[]> = {
  'orders.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  'orders.create': ['admin', 'truong_phong', 'sale'],
  'orders.bulk_confirm': ['admin', 'truong_phong', 'sale'],
  'orders.edit': ['admin', 'truong_phong', 'sale'],
  'orders.credit_override': ['admin', 'truong_phong'],
  'orders.packing': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  'orders.merge': ['admin', 'truong_phong', 'sale'],
  'orders.merge_locked': ['admin', 'truong_phong'],
  'orders.export': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  'orders.export_delivery': ['admin', 'truong_phong', 'sale', 'kho', 'tai_xe'],
  'orders.export_invoice': ['admin', 'truong_phong', 'ke_toan'],
  'procurement.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  'procurement.export': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  'products.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  'products.create': ['admin', 'thu_mua', 'sale'],
  'products.edit': ['admin', 'thu_mua'],
  'products.stock_in': ['admin', 'thu_mua'],
  'pricing.edit': ['admin', 'ke_toan'],
  'pricing.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  'customers.view': ['admin', 'truong_phong', 'sale', 'thu_mua', 'ke_toan'],
  'customers.edit': ['admin', 'truong_phong', 'sale'],
  'finance.view': ['admin', 'truong_phong', 'sale', 'ke_toan'],
  'finance.edit': ['admin', 'ke_toan'],
  'reports.view': ['admin', 'truong_phong', 'sale', 'ke_toan'],
  'admin.manage_staff': ['admin'],
};

const PERMISSIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(BASE_PERMISSIONS).map(([permission, roles]) => [
    permission,
    permission === 'admin.manage_staff' || roles.includes('ban_giam_doc')
      ? roles
      : roles.includes('admin')
        ? [...roles, 'ban_giam_doc']
        : roles,
  ]),
);

/** Kiểm tra xem `role` có quyền `perm` không. */
export function can(role: string | undefined | null, perm: string): boolean {
  if (!role) return false;
  const allowed = PERMISSIONS[perm];
  if (!allowed) return false;
  return allowed.includes(role);
}

export type StaffPermissionProfile = {
  role?: string | null;
  position?: string | null;
  department?: { function_group?: string | null } | { function_group?: string | null }[] | null;
  departments?: { function_group?: string | null } | { function_group?: string | null }[] | null;
};

/** Quyền theo hồ sơ đầy đủ, tách Ban Giám đốc khỏi Quản trị hệ thống. */
export function canForProfile(profile: StaffPermissionProfile | null | undefined, perm: string): boolean {
  if (!profile) return false;
  if (profile.role === 'admin' || profile.role === 'ban_giam_doc') return can(profile.role, perm);

  const rawDepartment = profile.department ?? profile.departments;
  const department = Array.isArray(rawDepartment) ? rawDepartment[0] : rawDepartment;
  const group = department?.function_group || null;

  if (profile.position === 'ban_giam_doc' || group === 'executive') {
    return can('ban_giam_doc', perm);
  }

  if (profile.position === 'truong_phong' && group) {
    if (perm === 'orders.approve_adjustment') {
      return group === 'operations' || group === 'procurement';
    }
    const inheritedRole = group === 'operations'
      ? 'sale'
      : group === 'procurement'
        ? 'thu_mua'
        : group === 'accounting'
          ? 'ke_toan'
          : group === 'business_marketing'
            ? 'sale'
            : null;
    if (!inheritedRole) return false;
    return can(inheritedRole, perm);
  }

  return can(profile.role, perm);
}
