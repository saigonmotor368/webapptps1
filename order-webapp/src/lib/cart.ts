import { useCallback, useEffect, useState } from 'react';
import type { Product } from './api';

export interface CartLine {
  product: Product;
  quantity: number;
  note?: string;
  requestedQuantity?: number;
  adjustmentAcknowledged?: boolean;
  quantityAdjustmentMessage?: string;
}

const CART_KEY = 'tps1_order_cart_v1';

function readCart(): Record<string, CartLine> {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useCart() {
  const [cart, setCart] = useState<Record<string, CartLine>>(() => readCart());

  useEffect(() => {
    sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const addItem = useCallback((product: Product, qty = 1, note = '', adjustment?: { requestedQuantity: number; acknowledged: boolean; message?: string }) => {
    setCart((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: (existing?.quantity || 0) + qty,
          note: note || existing?.note || '',
          requestedQuantity: (existing?.requestedQuantity ?? existing?.quantity ?? 0) + (adjustment?.requestedQuantity ?? qty),
          adjustmentAcknowledged: adjustment?.acknowledged ?? existing?.adjustmentAcknowledged ?? false,
          quantityAdjustmentMessage: adjustment?.message || existing?.quantityAdjustmentMessage,
        },
      };
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number, adjustment?: { requestedQuantity: number; acknowledged: boolean; message?: string }) => {
    setCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { ...prev[productId], quantity: qty, requestedQuantity: adjustment?.requestedQuantity ?? qty, adjustmentAcknowledged: adjustment?.acknowledged ?? false, quantityAdjustmentMessage: adjustment?.message } };
    });
  }, []);

  const setNote = useCallback((productId: string, note: string) => {
    setCart((prev) => {
      if (!prev[productId]) return prev;
      return { ...prev, [productId]: { ...prev[productId], note } };
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const clear = useCallback(() => setCart({}), []);

  const lines = Object.values(cart);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const total = lines.reduce((s, l) => s + l.quantity * (l.product.price || 0), 0);

  return { cart, lines, count, total, addItem, setQty, setNote, removeItem, clear };
}
