import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Mail, Lock, ShieldCheck, User } from 'lucide-react';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      if (isLogin) {
        // Sign In
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        // Sign Up
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name || email.split('@')[0],
              role: isAdmin ? 'admin' : 'user'
            }
          }
        });
        if (signUpError) throw signUpError;
        setMsg("Registration successful! You may now sign in.");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="max-w-sm w-full bg-white rounded-[2rem] shadow-xl overflow-hidden shadow-blue-900/5">
        <div className="bg-blue-600 p-8 text-center rounded-b-[2rem]">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-black/20">
            <span className="text-blue-600 font-extrabold text-2xl tracking-tighter">G</span>
            <span className="text-slate-800 font-semibold text-2xl tracking-tighter">Pay</span>
          </div>
          <h2 className="text-white text-2xl font-bold">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p className="text-blue-100 text-sm mt-1">
             {isLogin ? 'Enter your details to sign in' : 'Register securely to start'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {!isLogin && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-slate-400"><User className="w-5 h-5" /></span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-blue-500 font-medium text-slate-700 placeholder:text-slate-300"
                  required={!isLogin}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-slate-400"><Mail className="w-5 h-5" /></span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-blue-500 font-medium text-slate-700 placeholder:text-slate-300"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-slate-400"><Lock className="w-5 h-5" /></span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-blue-500 font-medium text-slate-700 placeholder:text-slate-300"
                required
                minLength={6}
              />
            </div>
          </div>

          {!isLogin && (
            <label className="flex items-center gap-2 mt-4 text-sm font-medium text-slate-600">
                <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600" />
                Register as Compliance Admin
            </label>
          )}

          {error && <p className="text-red-500 text-xs mt-2 font-medium bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
          {msg && <p className="text-green-600 text-xs mt-2 font-medium bg-green-50 p-3 rounded-xl border border-green-100">{msg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 disabled:bg-blue-300 text-white rounded-2xl py-3.5 font-bold shadow-lg shadow-blue-600/30 active:scale-95 transition-all outline-none flex justify-center items-center mt-6"
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'} <ShieldCheck className="w-5 h-5 ml-2" />
          </button>

          <p className="text-center text-sm font-medium text-slate-500 mt-6 pt-4 border-t border-slate-100">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={() => {setIsLogin(!isLogin); setError(null); setMsg(null)}} className="text-blue-600 font-bold hover:underline">
                {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </form>
      </div>
      
      <p className="text-xs text-slate-400 mt-8 font-medium">Secured by Orchid FraudGuard AI</p>
    </div>
  );
};

export default Auth;
