import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  // Profile photo lives here (not on `user`) so uploading/removing it in
  // Settings shows up immediately everywhere it's rendered — sidebar,
  // top bar, profile screen — without a page refresh, and so we can revoke
  // the previous blob URL cleanly whenever it changes.
  const [avatarUrl, setAvatarUrl] = useState(null);
  const avatarUrlRef = useRef(null);

  const refreshAvatar = useCallback(async (hasAvatar) => {
    if (avatarUrlRef.current) {
      URL.revokeObjectURL(avatarUrlRef.current);
      avatarUrlRef.current = null;
    }
    if (!hasAvatar) {
      setAvatarUrl(null);
      return;
    }
    try {
      const url = await api.getAvatarObjectUrl();
      avatarUrlRef.current = url;
      setAvatarUrl(url);
    } catch {
      setAvatarUrl(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('clearcall_token');
    if (!token) {
      setUser(null);
      setCompany(null);
      setAgent(null);
      refreshAvatar(false);
      setLoading(false);
      return;
    }
    try {
      const data = await api.me();
      setUser(data.user);
      setCompany(data.company);
      setAgent(data.agent);
      if (data.user?.role === 'jobseeker') refreshAvatar(!!data.user.avatar_filename);
    } catch {
      setToken(null);
      setUser(null);
      setCompany(null);
      setAgent(null);
      refreshAvatar(false);
    } finally {
      setLoading(false);
    }
  }, [refreshAvatar]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current); }, []);

  const loginWithToken = async (token, userObj, companyObj, agentObj) => {
    setToken(token);
    setUser(userObj);
    setCompany(companyObj || null);
    setAgent(agentObj || null);
    if (userObj?.role === 'jobseeker') refreshAvatar(!!userObj.avatar_filename);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setCompany(null);
    setAgent(null);
    refreshAvatar(false);
  };

  return (
    <AuthContext.Provider value={{ user, company, agent, loading, avatarUrl, refreshAvatar, loginWithToken, logout, refresh, setCompany, setAgent }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
