import { useCallback, useEffect, useState } from 'react';
import type { Product } from './api';

export interface CartLine {
  product: Product;
  quantity: number;
  note?: string;
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
