import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken, type CustomerSession } from '../lib/api';

interface AuthContextType {
  session: CustomerSession | null;
  loading: boolean;
  login: (code: string, password: string) => Promise<CustomerSession>;
  logout: () => void;
  refresh: () => Promise<void>;
  setSession: (s: CustomerSession) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  login: async () => {
    throw new Error('not implemented');
  },
  logout: () => {},
  refresh: async () => {},
  setSession: () => {},
});

export const useAuth = () => useContext(AuthContext);

// Xác thực RIÊNG cho app này — chỉ khách hàng, không có khái niệm nhân viên
// hay phiên admin nào cả (khác hẳn AuthContext của sale-webapp vốn gộp cả 2
// loại). Token lưu localStorage, gửi kèm Authorization: Bearer trên mọi
// request — không có cookie nào được dùng ở đây.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSessionState] = useState<CustomerSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = getToken();
    if (!token) {
      setSessionState(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.session();
      setSessionState(res.session);
    } catch {
      clearToken();
      setSessionState(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (code: string, password: string) => {
    const res = await api.login(code, password);
    if (res.session.orderSessionToken) setToken(res.session.orderSessionToken);
    setSessionState(res.session);
    return res.session;
  };

  const logout = () => {
    clearToken();
    setSessionState(null);
  };

  const setSession = (s: CustomerSession) => {
    if (s.orderSessionToken) setToken(s.orderSessionToken);
    setSessionState(s);
  };

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, refresh, setSession }}>
      {children}
    </AuthContext.Provider>
  );
};
