/**
 * Utility chuẩn hóa và kiểm tra số lượng đặt hàng TPS1 cho manage (POS/Admin).
 */

export function validateOrderQuantity(
  quantity: number,
  minOrderQty: number = 1,
  orderStep: number = 1,
  enforceOrderStep: boolean = false
): string | null {
  if (!(quantity > 0) || !Number.isFinite(quantity)) {
    return "Số lượng phải lớn hơn 0";
  }
  if (!enforceOrderStep) {
    return null;
  }
  const minimum = Math.max(0, Number(minOrderQty) || 1);
  const step = Math.max(0.000001, Number(orderStep) || 1);
  if (quantity + 1e-9 < minimum) {
    return `Số lượng tối thiểu là ${minimum}`;
  }
  const units = (quantity - minimum) / step;
  if (Math.abs(units - Math.round(units)) > 1e-7) {
    return `Số lượng phải từ ${minimum} và tăng theo bước ${step}`;
  }
  return null;
}

export function formatQuantityVN(val: number): string {
  if (val == null || !Number.isFinite(val)) return "0";
  return String(Math.round(val * 1000) / 1000).replace(".", ",");
}

export function getValidQuantityExamples(
  minOrderQty: number = 1,
  orderStep: number = 1,
  unit: string = "Kg"
): string {
  const min = Math.max(0, Number(minOrderQty) || 1);
  const step = Math.max(0.000001, Number(orderStep) || 1);
  const v1 = min;
  const v2 = Math.round((min + step) * 1000) / 1000;
  const v3 = Math.round((min + step * 2) * 1000) / 1000;
  return `${formatQuantityVN(v1)} · ${formatQuantityVN(v2)} · ${formatQuantityVN(v3)} ${unit}`;
}

export function roundTo3Decimals(val: number): number {
  return Math.round(val * 1000) / 1000;
}
