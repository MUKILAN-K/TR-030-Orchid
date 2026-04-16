import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
    ShieldAlert, 
    CheckCircle2, 
    XCircle, 
    LogOut, 
    MessageSquareWarning, 
    Users, 
    Wallet, 
    ArrowRightLeft, 
    ChevronRight,
    Search,
    X,
    Loader2
} from 'lucide-react';

export default function AdminDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('security'); // 'security' | 'customers'
  
  // Security Queue State
  const [frozenTx, setFrozenTx] = useState([]);

  // Customer Directory State
  const [allUsers, setAllUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Drilldown Modal State
  const [inspectedUser, setInspectedUser] = useState(null);
  const [userTx, setUserTx] = useState([]);
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  useEffect(() => {
    fetchFrozen();
    fetchAllCustomers();
    
    // Listen to ALL public changes to keep dashboard strictly real-time
    const sub = supabase
      .channel('admin:global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchFrozen();
        if (inspectedUser) fetchUserTransactions(inspectedUser.email);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchAllCustomers();
      })
      .subscribe();
      
    return () => supabase.removeChannel(sub);
  }, []);

  // Sync inspected user transactions explicitly when inspected user changes
  useEffect(() => {
    if (inspectedUser) {
        fetchUserTransactions(inspectedUser.email);
    }
  }, [inspectedUser]);


  // ---------------- FETCHING LOGIC ----------------

  const fetchFrozen = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*, sender:users!transactions_sender_email_fkey(name), receiver:users!transactions_receiver_email_fkey(name)')
      .eq('status', 'frozen')
      .order('created_at', { ascending: false });
    setFrozenTx(data || []);
  };

  const fetchAllCustomers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .neq('role', 'admin')
      .order('created_at', { ascending: false });
    setAllUsers(data || []);
  };

  const fetchUserTransactions = async (email) => {
    setIsLoadingTx(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .or(`sender_email.eq.${email},receiver_email.eq.${email}`)
      .order('created_at', { ascending: false });
      
    setUserTx(data || []);
    setIsLoadingTx(false);
  };


  // ---------------- ACTION LOGIC ----------------

  const handleDecision = async (txId, decision) => {
    const newStatus = decision === 'approve' ? 'completed' : 'blocked';
    
    const { error: txError } = await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', txId);

    if (txError) return alert(txError.message);

    if (decision === 'approve') {
        const tx = frozenTx.find(t => t.id === txId);
        await supabase.rpc('decrement_balance', { p_email: tx.sender_email, p_amount: tx.amount });
        await supabase.rpc('increment_balance', { p_email: tx.receiver_email, p_amount: tx.amount });
    }
  };


  // ---------------- RENDERERS ----------------

  const filteredUsers = allUsers.filter(u => 
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <>
      {/* MOBILE BLOCKER GUARD */}
      <div className="md:hidden flex flex-col h-screen items-center justify-center p-8 bg-slate-900 text-center text-white relative overflow-hidden">
         <div className="absolute top-0 w-full h-1 bg-red-500"></div>
         <ShieldAlert className="w-16 h-16 text-slate-500 mb-6" />
         <h1 className="text-xl font-bold mb-3">Security Restriction</h1>
         <p className="text-slate-400 text-sm">
           The Orchid Admin Compliance Dashboard is heavily classified and requires a secure desktop or laptop environment to access.
         </p>
         <button onClick={onLogout} className="mt-10 px-6 py-2 bg-white/10 rounded-full text-sm font-semibold hover:bg-white/20">Sign Out</button>
      </div>

      {/* DESKTOP DASHBOARD */}
      <div className="hidden md:flex min-h-screen bg-slate-50 flex-col">
        {/* Navigation Header */}
        <div className="bg-slate-900 text-white shadow-xl relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex justify-between items-center px-8 py-5 relative z-10">
                <div>
                    <div className="flex items-center gap-2 text-blue-400 font-bold tracking-widest text-[10px] uppercase mb-1">
                        <ShieldAlert className="w-4 h-4" /> Orchid Central Banking Systems
                    </div>
                    <h1 className="text-2xl font-bold">Admin Authority Portal</h1>
                </div>
                <button onClick={onLogout} className="px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition font-medium text-sm flex items-center">
                    <LogOut className="w-4 h-4 mr-2" /> End Session
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 px-8 relative z-10 -mb-[1px]">
                <button 
                  onClick={() => setActiveTab('security')}
                  className={`px-6 py-3 font-semibold text-sm rounded-t-xl transition-colors flex items-center gap-2 ${
                      activeTab === 'security' 
                      ? 'bg-slate-50 text-slate-900' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                    <ShieldAlert className="w-4 h-4" /> Security Queue
                    {frozenTx.length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full ml-1">
                            {frozenTx.length}
                        </span>
                    )}
                </button>
                <button 
                  onClick={() => { setActiveTab('customers'); setInspectedUser(null); }}
                  className={`px-6 py-3 font-semibold text-sm rounded-t-xl transition-colors flex items-center gap-2 ${
                      activeTab === 'customers' 
                      ? 'bg-slate-50 text-slate-900' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                    <Users className="w-4 h-4" /> Customer Directory
                </button>
            </div>
        </div>

        {/* Dashboard Canvas */}
        <div className="flex-1 p-8 max-w-[1400px] mx-auto w-full relative">
            
            {/* VIEW: SECURITY QUEUE */}
            {activeTab === 'security' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {frozenTx.map(tx => (
                            <div key={tx.id} className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative flex flex-col h-full">
                                <div className="absolute top-0 left-0 w-2 h-full bg-orange-500 rounded-l-[2rem]"></div>
                                
                                <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                                    <div>
                                        <p className="text-3xl font-black text-slate-800 mb-2">₹{tx.amount}</p>
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-slate-500">Sender: <span className="text-slate-800">{tx.sender?.name || tx.sender_email}</span></p>
                                            <p className="text-sm font-semibold text-slate-500">Receiver: <span className="text-slate-800">{tx.receiver?.name || tx.receiver_email}</span></p>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <span className="inline-block bg-orange-100 text-orange-800 text-[11px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">
                                            {tx.ai_fraud_type?.replace('_', ' ')}
                                        </span>
                                        <p className="text-[11px] text-slate-500 font-bold mt-2 bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100">
                                            Risk Score: <span className={tx.ai_fraud_score > 0.8 ? "text-red-500" : "text-orange-500"}>{Number(tx.ai_fraud_score).toFixed(2)}</span>
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex-1 flex flex-col gap-4 mb-6">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative mt-2">
                                        <span className="absolute -top-2.5 left-4 bg-white text-[10px] font-bold text-slate-500 px-2 rounded-full border border-slate-100 uppercase tracking-wider">AI Log</span>
                                        <p className="text-sm font-medium text-slate-700 italic">"{tx.ai_explanation}"</p>
                                    </div>

                                    <div className={`p-4 rounded-xl border relative mt-2 ${tx.user_explanation ? 'bg-blue-50 border-blue-100' : 'bg-slate-50/50 border-slate-100 border-dashed'}`}>
                                        <span className={`absolute -top-2.5 left-4 text-[10px] font-bold px-2 rounded-full border uppercase tracking-wider ${tx.user_explanation ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>User Appeal</span>
                                        {tx.user_explanation ? (
                                            <div className="flex gap-3 items-start">
                                                <MessageSquareWarning className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                                <p className="text-sm font-medium text-blue-900 leading-relaxed">"{tx.user_explanation}"</p>
                                            </div>
                                        ) : (
                                            <p className="text-xs font-medium text-slate-400 text-center py-2">System locked. Waiting for user to submit a contextual explanation...</p>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex gap-3 mt-auto">
                                    <button 
                                        onClick={() => handleDecision(tx.id, 'approve')}
                                        disabled={!tx.user_explanation}
                                        className="flex-1 bg-[#1A73E8] hover:bg-[#1557b0] disabled:bg-[#A8C7FA] disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-sm flex items-center justify-center transition-colors shadow-md shadow-blue-500/20"
                                    >
                                        <CheckCircle2 className="w-5 h-5 mr-2" /> Release Funds
                                    </button>
                                    <button 
                                        onClick={() => handleDecision(tx.id, 'reject')}
                                        className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 py-4 rounded-xl font-bold text-sm flex items-center justify-center transition-colors"
                                    >
                                        <XCircle className="w-5 h-5 mr-2" /> Block Permanently
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {frozenTx.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-32 bg-white rounded-[2rem] border border-slate-100 shadow-sm mt-8">
                            <ShieldAlert className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <h3 className="text-slate-700 font-bold text-xl">System Secure</h3>
                            <p className="text-slate-400 font-medium mt-1">No suspicious transactions pending security review.</p>
                        </div>
                    )}
                </div>
            )}

            {/* VIEW: CUSTOMER DIRECTORY */}
            {activeTab === 'customers' && (
                <div className="flex h-[calc(100vh-160px)] gap-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    
                    {/* Left Pane: Directory */}
                    <div className={`flex flex-col bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden ${inspectedUser ? 'w-1/3' : 'w-full'} transition-all duration-300`}>
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800 mb-4">Network Database</h2>
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="text" 
                                    placeholder="Search by name or email..." 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors shadow-sm"
                                />
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {filteredUsers.length === 0 && <p className="text-center text-slate-400 text-sm py-10">No users found.</p>}
                            {filteredUsers.map(u => (
                                <button 
                                    key={u.id}
                                    onClick={() => setInspectedUser(u)}
                                    className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${inspectedUser?.id === u.id ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}
                                >
                                    <div className="flex items-center gap-4 text-left">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${inspectedUser?.id === u.id ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                                            {u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-slate-800 truncate">{u.name || 'Anonymous User'}</p>
                                            <p className="text-xs text-slate-500 truncate">{u.email}</p>
                                        </div>
                                    </div>
                                    <ChevronRight className={`w-5 h-5 ${inspectedUser?.id === u.id ? 'text-blue-500' : 'text-slate-300'}`} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right Pane: Drilldown Modal */}
                    {inspectedUser && (
                        <div className="w-2/3 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
                            
                            <div className="bg-slate-900 px-8 py-6 flex justify-between items-start relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/30 rounded-full blur-2xl"></div>
                                <div className="relative z-10 flex gap-5 items-center">
                                    <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center text-2xl font-black text-white">
                                        {inspectedUser.name ? inspectedUser.name.charAt(0).toUpperCase() : inspectedUser.email.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-white">{inspectedUser.name || 'Anonymous User'}</h2>
                                        <p className="text-blue-200 text-sm font-medium">{inspectedUser.email}</p>
                                        <div className="flex items-center gap-2 mt-2 bg-white/10 px-3 py-1 rounded-lg w-fit border border-white/5">
                                            <Wallet className="w-3.5 h-3.5 text-green-400" />
                                            <span className="text-xs font-medium text-slate-200 uppercase tracking-wider">Ledger Balance:</span>
                                            <span className="text-sm font-bold text-white">₹{inspectedUser.balance}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setInspectedUser(null)} className="relative z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-slate-300 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
                                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                    <ArrowRightLeft className="w-5 h-5 text-slate-400" /> Complete Transaction Ledger
                                </h3>

                                <div className="space-y-3">
                                    {isLoadingTx ? (
                                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
                                    ) : userTx.length === 0 ? (
                                        <p className="text-center py-10 text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">Ledger is clean. No transactions recorded.</p>
                                    ) : (
                                        userTx.map(tx => {
                                            const isSender = tx.sender_email === inspectedUser.email;
                                            return (
                                                <div key={tx.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between hover:border-slate-200 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isSender ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-600'}`}>
                                                            {isSender ? <ArrowRightLeft className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-800 text-sm">
                                                                {isSender ? `Transferred to ${tx.receiver_email}` : `Received from ${tx.sender_email}`}
                                                            </p>
                                                            <p className="text-[11px] font-medium text-slate-500 mt-0.5 tracking-wide">
                                                                {new Date(tx.created_at).toLocaleString('en-GB')} 
                                                                <span className="mx-2">•</span> 
                                                                <span className={tx.status === 'completed' ? 'text-green-600' : tx.status === 'frozen' ? 'text-orange-500' : 'text-red-500'}>
                                                                    {tx.status.toUpperCase()}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`font-black text-lg ${isSender ? 'text-slate-800' : 'text-green-600'}`}>
                                                            {isSender ? '-' : '+'}₹{tx.amount}
                                                        </span>
                                                        {tx.status === 'frozen' && (
                                                            <p className="text-[10px] text-orange-500 font-bold uppercase mt-1">Pending Clearance</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            )}

        </div>
      </div>
    </>
  );
}
