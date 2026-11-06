import { useCallback, useEffect, useState } from 'react';
import type { Product } from './api';

export interface CartLine {
  product: Product;
  quantity: number;
  note?: string;
}

const cartKey = (customerId: string) => `tps1_order_cart_v2_${customerId}`;

function readCart(customerId: string): Record<string, CartLine> {
  try {
    const raw = localStorage.getItem(cartKey(customerId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useCart(customerId: string) {
  const [cart, setCart] = useState<Record<string, CartLine>>(() => readCart(customerId));

  useEffect(() => {
    localStorage.setItem(cartKey(customerId), JSON.stringify(cart));
  }, [cart, customerId]);

  const addItem = useCallback((product: Product, qty = 1, note = '') => {
    setCart((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: (existing?.quantity || 0) + qty,
          note: note || existing?.note || '',
        },
      };
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { ...prev[productId], quantity: qty } };
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
