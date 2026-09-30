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
  sale: 'NV Vận hành',
  thu_mua: 'Thu mua',
  kho: 'Kho / Soạn hàng',
  ke_toan: 'Kế toán',
  tai_xe: 'Tài xế',
};

const PERMISSIONS: Record<string, Role[]> = {
  // ─── Đơn hàng ───────────────────────────────────────────────────
  /** Xem danh sách đơn hàng (mọi đơn) */
  'orders.view': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  /** Tạo đơn hàng mới (POS) */
  'orders.create': ['admin', 'ban_giam_doc', 'truong_phong', 'sale'],
  /** Xác nhận/chốt đơn hàng hàng loạt của phòng Vận hành */
  'orders.bulk_confirm': ['admin', 'ban_giam_doc', 'truong_phong', 'sale'],
  /** Sale/Văn phòng vận hành phân loại khách, chốt giá và chuyển Thu mua */
  'orders.finalize_pricing': ['admin', 'ban_giam_doc', 'truong_phong', 'sale'],
  /** Sửa thông tin đơn trước khi chốt, bổ sung giá tham khảo/ghi chú */
  'orders.edit': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua'],
  /** Duyệt yêu cầu điều chỉnh sau khi đơn đã xác nhận */
  'orders.approve_adjustment': ['admin', 'ban_giam_doc', 'truong_phong'],
  /** Duyệt đơn vượt hạn mức công nợ */
  'orders.credit_override': ['admin', 'ban_giam_doc'],
  /** Xem/Cập nhật trạng thái soạn hàng (nhận/hoàn tất/trả đơn) */
  'orders.packing': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  /** Giành lại/trả đơn đang do người khác nhận soạn */
  'orders.packing_override': ['admin', 'ban_giam_doc', 'truong_phong'],
  /** Gộp đơn hàng đủ điều kiện trước xác nhận */
  'orders.merge': ['admin', 'ban_giam_doc', 'truong_phong', 'sale'],
  /** Gộp/điều chỉnh đơn hàng đã xác nhận hoặc đã khóa */
  'orders.merge_locked': ['admin', 'ban_giam_doc', 'truong_phong'],
  /** Xuất danh sách, phiếu tạm, chi tiết đơn */
  'orders.export': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  /** Xuất phiếu giao hàng, danh sách giao theo xe/tuyến */
  'orders.export_delivery': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'kho', 'tai_xe'],
  /** Xuất hóa đơn bán hàng, báo cáo công nợ */
  'orders.export_invoice': ['admin', 'ban_giam_doc', 'truong_phong', 'ke_toan'],

  // ─── Thu mua / Đơn tổng ─────────────────────────────────────────
  /** Xem màn đơn tổng, xuất Excel đơn tổng */
  'procurement.view': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'kho'],
  /** Xuất file Excel đơn tổng / tuyến */
  'procurement.export': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'kho'],

  // ─── Hàng hóa ───────────────────────────────────────────────────
  /** Xem danh sách hàng hóa */
  'products.view': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  /** Tạo sản phẩm mới */
  'products.create': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'ke_toan'],
  /** Sửa thông tin sản phẩm (giá, mô tả, danh mục…) */
  'products.edit': ['admin', 'ban_giam_doc', 'truong_phong', 'thu_mua', 'ke_toan'],
  /** Nhập kho (tăng tồn kho qua inventory_transactions) */
  'products.stock_in': ['admin', 'ban_giam_doc', 'thu_mua'],

  // ─── Bảng giá ───────────────────────────────────────────────────
  /** Áp giá hàng ngày / sửa bảng giá */
  'pricing.view': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'kho', 'ke_toan'],
  'pricing.edit': ['admin', 'ban_giam_doc', 'ke_toan'],

  // ─── Khách hàng ─────────────────────────────────────────────────
  /** Xem danh sách khách hàng */
  'customers.view': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'thu_mua', 'ke_toan'],
  /** Tạo/sửa khách hàng, địa chỉ, xác thực tài khoản khách */
  'customers.edit': ['admin', 'ban_giam_doc', 'truong_phong', 'sale'],
  /** Phân công người phụ trách, đổi mã hoặc khóa/mở khách hàng */
  'customers.assign_rep': ['admin', 'ban_giam_doc', 'truong_phong'],

  // ─── Công nợ / Thanh toán ───────────────────────────────────────
  /** Xem công nợ */
  'finance.view': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'ke_toan'],
  /** Ghi nhận thanh toán, xuất hóa đơn, báo cáo */
  'finance.edit': ['admin', 'ban_giam_doc', 'ke_toan'],

  // ─── Báo cáo ────────────────────────────────────────────────────
  /** Xem báo cáo doanh thu */
  'reports.view': ['admin', 'ban_giam_doc', 'truong_phong', 'sale', 'ke_toan'],

  // ─── Quản trị hệ thống ──────────────────────────────────────────
  /** Quản lý tài khoản nhân viên (tạo/sửa/vô hiệu hóa) */
  'admin.manage_staff': ['admin'],
};

/** Kiểm tra xem `role` có quyền `perm` không. */
export function can(role: string | undefined | null, perm: string): boolean {
  if (!role) return false;
  const allowed = PERMISSIONS[perm];
  if (!allowed) return false;
  return (allowed as string[]).includes(role);
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
  if (profile.role === 'admin') return true;

  const rawDepartment = profile.department ?? profile.departments;
  const department = Array.isArray(rawDepartment) ? rawDepartment[0] : rawDepartment;
  const group = department?.function_group || null;

  // Chỉ role ban_giam_doc được hưởng quyền điều hành. Phòng/chức vụ là dữ
  // liệu tổ chức, không phải nguồn cấp quyền độc lập.
  if (profile.role === 'ban_giam_doc') {
    return can('ban_giam_doc', perm);
  }

  if ((profile.position === 'truong_phong' || profile.role === 'truong_phong') && group) {
    if (perm === 'orders.approve_adjustment') {
      return group === 'operations' || group === 'procurement';
    }
    if (perm === 'orders.packing_override') {
      return group === 'operations' || group === 'procurement';
    }
    if (perm === 'customers.assign_rep') {
      return group === 'operations' || group === 'business_marketing';
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
    return inheritedRole ? can(inheritedRole, perm) : false;
  }

  return can(profile.role, perm);
}
