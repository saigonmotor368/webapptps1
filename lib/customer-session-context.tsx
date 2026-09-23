"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { CustomerSession } from "@/lib/customer-session";

type CustomerSessionContextValue = {
  session: CustomerSession | null;
  loading: boolean;
};

const CustomerSessionContext = createContext<CustomerSessionContextValue>({
  session: null,
  loading: true,
});

export function CustomerSessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Customer authentication is only used by the legacy portal. Avoid an
    // extra API round trip on every SEO/Google Ads landing page.
    if (!pathname.startsWith("/portal")) {
      setSession(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch("/api/customer/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSession(data?.session || null);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <CustomerSessionContext.Provider value={{ session, loading }}>
      {children}
    </CustomerSessionContext.Provider>
  );
}

export function useCustomerSession() {
  return useContext(CustomerSessionContext);
}
