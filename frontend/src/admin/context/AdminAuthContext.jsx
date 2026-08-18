import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { adminApi, getAdminToken, setAdminToken } from '../api/adminClient';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      setAdmin(null);
      setLoading(false);
      return;
    }
    try {
      const data = await adminApi.me();
      setAdmin({ email: data.email });
    } catch {
      setAdminToken(null);
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const data = await adminApi.login(email, password);
    setAdminToken(data.token);
    setAdmin({ email: data.email });
  };

  const logout = () => {
    setAdminToken(null);
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
