import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldAlert, CheckCircle2, XCircle, LogOut } from 'lucide-react';

export default function AdminDashboard({ onLogout }) {
  const [frozenTx, setFrozenTx] = useState([]);

  useEffect(() => {
    fetchFrozen();
    
    const sub = supabase
      .channel('public:transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchFrozen();
      })
      .subscribe();
      
    return () => supabase.removeChannel(sub);
  }, []);

  const fetchFrozen = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*, sender:users!transactions_sender_email_fkey(name), receiver:users!transactions_receiver_email_fkey(name)')
      .eq('status', 'frozen')
      .order('created_at', { ascending: false });
    setFrozenTx(data || []);
  };

  const handleDecision = async (txId, decision) => {
    // Determine new status
    const newStatus = decision === 'approve' ? 'completed' : 'blocked';
    
    // Update the transaction
    const { error: txError } = await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', txId);

    if (txError) return alert(txError.message);

    // If approved, we must now move the funds (since frozen meant money wasn't moved yet)
    if (decision === 'approve') {
        const tx = frozenTx.find(t => t.id === txId);
        
        // Deduct Sender
        await supabase.rpc('decrement_balance', { p_email: tx.sender_email, p_amount: tx.amount });
        // Credit Receiver
        await supabase.rpc('increment_balance', { p_email: tx.receiver_email, p_amount: tx.amount });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <div className="bg-slate-900 text-white p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="flex justify-between items-center relative z-10">
            <div>
                <div className="flex items-center gap-2 text-blue-400 font-bold tracking-widest text-xs uppercase mb-1">
                    <ShieldAlert className="w-4 h-4" /> Orchid Compliance
                </div>
                <h1 className="text-2xl font-bold">Admin Portal</h1>
            </div>
            <button onClick={onLogout} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition">
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </div>

      <div className="flex-1 p-6">
        <h2 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
            Flagged by AI <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">{frozenTx.length}</span>
        </h2>
        
        <div className="space-y-4">
            {frozenTx.map(tx => (
                <div key={tx.id} className="bg-white rounded-3xl p-5 shadow-sm border border-red-50 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                    
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xl font-bold text-slate-800">₹{tx.amount}</p>
                            <p className="text-xs font-semibold text-slate-500 mt-1">From: <span className="text-slate-800">{tx.sender?.name || tx.sender_email}</span></p>
                            <p className="text-xs font-semibold text-slate-500">To: <span className="text-slate-800">{tx.receiver?.name || tx.receiver_email}</span></p>
                        </div>
                        <div className="text-right">
                            <span className="inline-block bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">
                                {tx.ai_fraud_type?.replace('_', ' ')}
                            </span>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">Risk: {Number(tx.ai_fraud_score).toFixed(2)}</p>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-xl mb-4">
                        <p className="text-xs font-medium text-slate-600 italic">"{tx.ai_explanation}"</p>
                    </div>
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={() => handleDecision(tx.id, 'approve')}
                            className="flex-1 bg-green-100 hover:bg-green-200 text-green-700 py-3 rounded-xl font-bold text-sm flex items-center justify-center transition-colors"
                        >
                            <CheckCircle2 className="w-4 h-4 mr-2" /> Allow
                        </button>
                        <button 
                            onClick={() => handleDecision(tx.id, 'reject')}
                            className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-3 rounded-xl font-bold text-sm flex items-center justify-center transition-colors"
                        >
                            <XCircle className="w-4 h-4 mr-2" /> Block
                        </button>
                    </div>
                </div>
            ))}
            
            {frozenTx.length === 0 && (
                <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200">
                    <ShieldAlert className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium text-sm">No suspicious transactions pending review.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
