import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setUser(null); setProfile(null); setStudentData(null);
      return;
    }
    setUser(authUser);
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', authUser.id).single();
    if (!prof) { await supabase.auth.signOut(); setUser(null); return; }
    setProfile(prof);

    if (prof.role === 'student') {
      const { data: s } = await supabase
        .from('students')
        .select('*, batches(id, name, course_id, courses(name))')
        .eq('id', prof.id).single();
      setStudentData(s);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) fetchProfile(data.user);
    }).catch(() => {}).finally(() => setLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) fetchProfile(session.user);
      else { setUser(null); setProfile(null); setStudentData(null); }
    });
    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await fetchProfile(data.user);
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setStudentData(null);
  };

  const role = profile?.role || null;

  return (
    <AuthContext.Provider value={{ user, profile, studentData, role, loading, login, logout, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
