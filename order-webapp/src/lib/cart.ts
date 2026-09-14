import { useCallback, useEffect, useState } from 'react';
import type { Product } from './api';

export interface CartLine {
  product: Product;
  quantity: number;
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

// Giỏ hàng đơn giản (1 giỏ duy nhất), lưu sessionStorage — đủ cho bản đầu.
// sale-webapp/DatHangPage có mô hình nhiều tab đơn cùng lúc (khách tổ bếp cần
// tách nhiều đơn riêng); nếu khách hàng thật của app này cũng cần, làm thêm
// sau theo đúng mẫu đó, không cần thiết kế lại từ đầu.
export function useCart() {
  const [cart, setCart] = useState<Record<string, CartLine>>(() => readCart());

  useEffect(() => {
    sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const addItem = useCallback((product: Product, qty = 1) => {
    setCart((prev) => {
      const existing = prev[product.id];
      return { ...prev, [product.id]: { product, quantity: (existing?.quantity || 0) + qty } };
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

  return { cart, lines, count, total, addItem, setQty, removeItem, clear };
}
