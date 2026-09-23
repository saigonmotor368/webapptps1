"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { usePathname } from "next/navigation";
import { useCustomerSession } from "@/lib/customer-session-context";

export function FloatingCart() {
  const { count } = useCart();
  const pathname = usePathname();
  const { session, loading } = useCustomerSession();
  const destination = session ? "/portal/gio-hang" : "/bao-gia";
  const label = session ? "Xem giỏ hàng đặt hàng" : "Xem giỏ báo giá";

  // The marketing site no longer owns a cart. Ordering lives in the
  // dedicated order webapp; keep this affordance only inside the legacy
  // customer portal while its migration is completed.
  if (loading || !pathname.startsWith("/portal") || pathname === destination || count === 0) {
    return null;
  }

  return (
    <Link href={destination} className="floating-cart" aria-label={label} title={label}>
      <div className="floating-cart__icon">
        <ShoppingCart size={24} />
        <span className="floating-cart__badge">{count}</span>
      </div>
    </Link>
  );
}
