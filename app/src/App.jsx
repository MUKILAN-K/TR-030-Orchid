import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import GPayDashboard from './components/GPayDashboard';
import AdminDashboard from './components/AdminDashboard';
import { Loader2 } from 'lucide-react';

function App() {
  const [session, setSession] = useState(null);
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchDbUser(session.user.email);
      else setLoading(false);
    });

    // Listen for changes on auth state (login, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchDbUser(session.user.email);
      else {
        setDbUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchDbUser = async (email) => {
    // Fetch the attached user profile from public.users
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
      
    setDbUser(data);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        </div>
      );
  }

  // If not logged in, show Auth
  if (!session || !dbUser) {
    return <Auth />;
  }

  // If Admin
  if (dbUser.role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  // Regular User
  return <GPayDashboard user={dbUser} onLogout={handleLogout} />;
}

export default App;
