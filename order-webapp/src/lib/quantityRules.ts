/** Quy tắc định lượng dùng chung cho giao diện đặt hàng. Server vẫn kiểm tra lại. */
export type QuantityAdjustmentMode = 'reject' | 'ceil_to_step';

export type QuantityNormalizationResult =
  | { ok: true; requestedQuantity: number; normalizedQuantity: number; adjusted: boolean; message: string | null }
  | { ok: false; requestedQuantity: number; normalizedQuantity: null; adjusted: false; message: string; suggestedQuantities: number[] };

const round = (value: number, precision = 3) => {
  const factor = 10 ** Math.max(0, Math.min(6, precision));
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function normalizeOrderQuantity(quantity: number, minOrderQty = 1, orderStep = 1, enforceOrderStep = false, quantityPrecision = 3, adjustmentMode: QuantityAdjustmentMode = 'reject', unit = ''): QuantityNormalizationResult {
  const requested = Number(quantity);
  if (!(requested > 0) || !Number.isFinite(requested)) return { ok: false, requestedQuantity: requested, normalizedQuantity: null, adjusted: false, message: 'Số lượng phải lớn hơn 0', suggestedQuantities: [] };
  const minimum = Math.max(0, Number(minOrderQty) || 1);
  const step = Math.max(0.000001, Number(orderStep) || 1);
  const normalizedInput = round(requested, quantityPrecision);
  if (!enforceOrderStep) return { ok: true, requestedQuantity: requested, normalizedQuantity: normalizedInput, adjusted: normalizedInput !== requested, message: null };
  const units = (requested - minimum) / step;
  const below = requested + 1e-9 < minimum;
  const offStep = Math.abs(units - Math.round(units)) > 1e-7;
  const tooPrecise = Math.abs(requested - normalizedInput) > 1e-7;
  if (!below && !offStep && !tooPrecise) return { ok: true, requestedQuantity: requested, normalizedQuantity: normalizedInput, adjusted: false, message: null };
  if (adjustmentMode === 'ceil_to_step') {
    const steps = requested <= minimum ? 0 : Math.ceil((requested - minimum - 1e-9) / step);
    const normalized = round(Math.max(minimum, minimum + steps * step), quantityPrecision);
    return { ok: true, requestedQuantity: requested, normalizedQuantity: normalized, adjusted: true, message: `Đã điều chỉnh từ ${formatQuantityVN(requested)} thành ${formatQuantityVN(normalized)}${unit ? ` ${unit}` : ''} vì mặt hàng này bán theo ${step === 1 && quantityPrecision === 0 ? 'số nguyên' : `bước ${formatQuantityVN(step)}`}.` };
  }
  const lower = round(minimum + Math.max(0, Math.floor((requested - minimum) / step)) * step, quantityPrecision);
  const upper = round(minimum + Math.max(0, Math.ceil((requested - minimum) / step)) * step, quantityPrecision);
  return { ok: false, requestedQuantity: requested, normalizedQuantity: null, adjusted: false, message: below ? `Số lượng tối thiểu là ${formatQuantityVN(minimum)}${unit ? ` ${unit}` : ''}` : `Số lượng phải tăng theo bước ${formatQuantityVN(step)}${unit ? ` ${unit}` : ''}`, suggestedQuantities: [...new Set([lower, upper, minimum].filter(v => v > 0))].sort((a, b) => a - b) };
}

export function validateOrderQuantity(quantity: number, minOrderQty = 1, orderStep = 1, enforceOrderStep = false, quantityPrecision = 3, adjustmentMode: QuantityAdjustmentMode = 'reject', unit = ''): string | null {
  const result = normalizeOrderQuantity(quantity, minOrderQty, orderStep, enforceOrderStep, quantityPrecision, adjustmentMode, unit);
  return result.ok ? null : result.message;
}

export function formatQuantityVN(val: number): string {
  if (val == null || !Number.isFinite(val)) return '0';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(round(val));
}

export function getValidQuantityExamples(minOrderQty = 1, orderStep = 1, unit = 'Kg'): string {
  const min = Math.max(0, Number(minOrderQty) || 1); const step = Math.max(0.000001, Number(orderStep) || 1);
  return `${formatQuantityVN(min)} · ${formatQuantityVN(min + step)} · ${formatQuantityVN(min + step * 2)} ${unit}`;
}

export const roundTo3Decimals = (val: number) => round(val, 3);
