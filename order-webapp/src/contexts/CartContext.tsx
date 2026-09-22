import React, { createContext, useContext } from 'react';
import { useCart as useCartState, type CartLine } from '../lib/cart';
import type { Product } from '../lib/api';

interface CartContextType {
  lines: CartLine[];
  count: number;
  total: number;
  addItem: (product: Product, qty?: number, note?: string) => void;
  setQty: (productId: string, qty: number) => void;
  setNote: (productId: string, note: string) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useCartState();
  return <CartContext.Provider value={state}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart phải dùng bên trong CartProvider');
  return ctx;
};
