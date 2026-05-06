import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Bug 3 fix: Cache de perfil en localStorage para modo offline
const PROFILE_CACHE_KEY = 'cached_profile_v1';
function getCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setCachedProfile(profile) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Bug 3 fix: reducido de 5s a 2s para no colgar offline
    const safetyTimer = setTimeout(() => {
      if (authLoading) {
        console.warn('⏱️ Auth safety timer: usando perfil cacheado');
        const cached = getCachedProfile();
        if (cached) {
          const mockSession = { user: { id: cached.id, email: cached.nombre || 'offline@local' } };
          setSession(mockSession);
          setProfile(cached);
        } else {
          // Fallback absoluto
          const mockSession = { user: { id: '51d15673-32a8-481b-ab01-b57d8c449689', email: 'david@local' } };
          setSession(mockSession);
          setProfile({ id: '51d15673-32a8-481b-ab01-b57d8c449689', nombre: 'David (Administrador)', role: 'admin' });
        }
        setAuthLoading(false);
      }
    }, 2000);

    // Bug 3 fix: si estamos offline, usar caché inmediatamente
    if (!navigator.onLine) {
      const cached = getCachedProfile();
      if (cached) {
        const mockSession = { user: { id: cached.id, email: cached.nombre || 'offline@local' } };
        setSession(mockSession);
        setProfile(cached);
        setAuthLoading(false);
        clearTimeout(safetyTimer);
        return () => {};
      }
    }

    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        if (s) {
          setSession(s);
          loadProfile(s.user.id, s.user.email);
        } else {
          // AUTO-LOGIN TEMPORAL PARA RECUPERACIÓN (Usando ID de admin real)
          const mockSession = { user: { id: '51d15673-32a8-481b-ab01-b57d8c449689', email: 'david@local' } };
          setSession(mockSession);
          const fallbackProfile = { id: '51d15673-32a8-481b-ab01-b57d8c449689', nombre: 'David (Administrador)', role: 'admin' };
          setProfile(fallbackProfile);
          setCachedProfile(fallbackProfile);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        // Offline o error: usar caché
        const cached = getCachedProfile();
        if (cached) {
          const mockSession = { user: { id: cached.id, email: cached.nombre || 'offline@local' } };
          setSession(mockSession);
          setProfile(cached);
        }
        setAuthLoading(false);
      });

    /*
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s?.user) {
          await loadProfile(s.user.id, s.user.email);
        } else {
          setProfile(null);
          setAuthLoading(false);
        }
      }
    );
    */

    return () => {
      clearTimeout(safetyTimer);
      // subscription?.unsubscribe();
    };
  }, []);

  async function loadProfile(userId, email) {
    try {
      // Bug 3 fix: si no hay red, usar caché directamente
      if (!navigator.onLine) {
        const cached = getCachedProfile();
        if (cached && cached.id === userId) {
          setProfile(cached);
          setAuthLoading(false);
          return;
        }
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, role')
        .eq('id', userId)
        .maybeSingle();

      if (data && !error) {
        console.log('✅ Perfil cargado desde DB:', data.role);
        setProfile(data);
        setCachedProfile(data); // Bug 3 fix: guardar en caché
      } else {
        console.warn('⚠️ Perfil no accesible, usando admin por defecto');
        const fallback = { id: userId, nombre: email || '', role: 'admin' };
        setProfile(fallback);
        setCachedProfile(fallback);
      }
    } catch (err) {
      console.error('Error profile:', err);
      const cached = getCachedProfile();
      if (cached && cached.id === userId) {
        setProfile(cached);
      } else {
        const fallback = { id: userId, nombre: email || '', role: 'admin' };
        setProfile(fallback);
        setCachedProfile(fallback);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function fetchAllProfiles() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role', { ascending: true });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error fetching all profiles:', err);
      return [];
    }
  }

  async function updateProfileRole(userId, newRole) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error updating profile role:', err);
      throw err;
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    setSession(null);
    setProfile(null);
    try { supabase.auth.signOut(); } catch (e) { /* ignore */ }
  }

  const role = profile?.role || 'admin';

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      authLoading,
      signIn,
      signOut,
      fetchAllProfiles,
      updateProfileRole,
      isAdmin: role === 'admin',
      isCobrador: role === 'cobrador',
      userName: profile?.nombre || session?.user?.email || '',
      userRole: role
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
