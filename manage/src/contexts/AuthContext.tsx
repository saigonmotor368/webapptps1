import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface User {
  id: string;
  name: string;
  userType: 'staff' | 'customer';
  // Nhân viên
  role?: string;
  position?: string;
  departmentId?: string | null;
  department?: { code: string; name: string; function_group: string } | null;
  email?: string;
  // Khách hàng
  code?: string;
  phone?: string;
  company?: string;
  address?: string;
  taxCode?: string;
  // Địa chỉ giao hàng mặc định (đã ký hợp đồng) — khách B2B chỉ giao tới đây,
  // dùng để tự điền form giao hàng thay vì bắt gõ tay mỗi lần.
  defaultShippingAddress?: { alias: string; address: string; name: string; phone: string };
  tier?: string;
  discountPercent?: number;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  mustChangePassword?: boolean;
}

interface StaffLoginTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  loginStaff: (user: User, tokens: StaffLoginTokens) => Promise<void>;
  loginCustomer: (user: User, customerToken: string) => void;
  logout: () => Promise<void>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  loginStaff: async () => {},
  loginCustomer: () => {},
  logout: async () => {},
  authFetch: async (input, init) => fetch(input, init),
});

export const useAuth = () => useContext(AuthContext);

const STORAGE_USER_KEY = 'tps1_sale_user';
const STORAGE_CUSTOMER_TOKEN_KEY = 'tps1_sale_customer_token';

// LƯU Ý BẢO MẬT (2026-09-09): trước đây file này tự tạo một phiên "admin"
// giả mặc định khi localStorage trống, nghĩa là bất kỳ ai mở app này lần đầu
// (localStorage rỗng) đều tự động thành admin toàn quyền mà không cần đăng
// nhập. Đã viết lại để nguồn sự thật duy nhất là phiên đăng nhập THẬT của
// Supabase Auth (JWT) cho nhân viên, hoặc customerToken hợp lệ (được backend
// xác thực qua RPC verify_customer_login) cho khách hàng.
//
// GIAI ĐOẠN A (2026-09-10): hỗ trợ 2 loại phiên — nhân viên (Supabase Auth
// thật, cho phép supabase.from(...) chạy trực tiếp qua RLS) và khách hàng
// (không có Supabase Auth session — mọi truy vấn của khách phải đi qua API
// /api/customer/** kèm header Authorization: Bearer <customerToken>, KHÔNG
// được gọi supabase.from(...) trực tiếp vì RLS sẽ chặn do không có auth.uid()).
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      let { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // Có phiên Supabase Auth thật -> chỉ có thể là nhân viên.
        // Kiểm tra xem access token có hết hạn hoặc sắp hết hạn không
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        if (expiresAt && expiresAt < Date.now() + 120000) {
          try {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed?.session) {
              session = refreshed.session;
            }
          } catch (e) {
            console.warn('Lỗi tự động refresh session:', e);
          }
        }

        let profile: User | null = null;
        try {
          const stored = localStorage.getItem(STORAGE_USER_KEY);
          profile = stored ? JSON.parse(stored) : null;
        } catch {
          profile = null;
        }

        if (profile && profile.userType === 'staff' && profile.id === session.user.id) {
          if (mounted) {
            setUser(profile);
            setToken(session.access_token);
          }
        } else {
          await supabase.auth.signOut();
          localStorage.removeItem(STORAGE_USER_KEY);
          localStorage.removeItem(STORAGE_CUSTOMER_TOKEN_KEY);
        }
      } else {
        // Không có phiên Supabase Auth -> thử khôi phục phiên khách hàng.
        try {
          const storedUser = localStorage.getItem(STORAGE_USER_KEY);
          const storedToken = localStorage.getItem(STORAGE_CUSTOMER_TOKEN_KEY);
          const profile: User | null = storedUser ? JSON.parse(storedUser) : null;
          if (profile && profile.userType === 'customer' && storedToken) {
            if (mounted) {
              setUser(profile);
              setToken(storedToken);
            }
          } else {
            localStorage.removeItem(STORAGE_USER_KEY);
            localStorage.removeItem(STORAGE_CUSTOMER_TOKEN_KEY);
          }
        } catch {
          localStorage.removeItem(STORAGE_USER_KEY);
          localStorage.removeItem(STORAGE_CUSTOMER_TOKEN_KEY);
        }
      }

      if (mounted) setLoading(false);
    };

    restore();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser((current) => {
          if (current?.userType === 'staff') {
            setToken(null);
            localStorage.removeItem(STORAGE_USER_KEY);
            return null;
          }
          return current;
        });
        return;
      }
      if (session.access_token) {
        setToken(session.access_token);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const getValidToken = React.useCallback(async (): Promise<string | null> => {
    if (user?.userType === 'customer') {
      return token || localStorage.getItem(STORAGE_CUSTOMER_TOKEN_KEY);
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return token;
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAt && expiresAt < Date.now() + 60000) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          setToken(refreshed.session.access_token);
          return refreshed.session.access_token;
        }
      } catch (e) {
        console.warn('Refresh session thất bại:', e);
      }
    }
    if (session.access_token && session.access_token !== token) {
      setToken(session.access_token);
    }
    return session.access_token || token;
  }, [token, user]);

  const authFetch = React.useCallback(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const validToken = await getValidToken();
    const headers = new Headers(init?.headers || {});
    if (validToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${validToken}`);
    }
    let res = await fetch(input, { ...init, headers });
    if (res.status === 401 && user?.userType === 'staff') {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          setToken(refreshed.session.access_token);
          headers.set('Authorization', `Bearer ${refreshed.session.access_token}`);
          res = await fetch(input, { ...init, headers });
        }
      } catch (e) {
        console.warn('Retry authFetch sau refresh thất bại:', e);
      }
    }
    return res;
  }, [getValidToken, user]);

  const loginStaff = async (userData: User, tokens: StaffLoginTokens) => {
    // Gắn token thật của Supabase Auth vào client dùng chung (sale-webapp/src/lib/supabase.ts)
    // để mọi truy vấn supabase.from(...) sau đó đều được RLS nhận đúng danh tính (auth.uid()).
    await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    localStorage.removeItem(STORAGE_CUSTOMER_TOKEN_KEY);
    setUser(userData);
    setToken(tokens.accessToken);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData));
  };

  const loginCustomer = (userData: User, customerToken: string) => {
    setUser(userData);
    setToken(customerToken);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData));
    localStorage.setItem(STORAGE_CUSTOMER_TOKEN_KEY, customerToken);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_CUSTOMER_TOKEN_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, loginStaff, loginCustomer, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};
