import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Search, 
  ChevronDown, 
  QrCode, 
  Contact, 
  Smartphone, 
  Landmark, 
  AtSign, 
  RefreshCcw, 
  ReceiptText, 
  Zap,
  ArrowLeft,
  IndianRupee,
  Loader2,
  Home,
  Link,
  MoreHorizontal,
  Wallet,
  UserCheck
} from 'lucide-react';
import axios from 'axios';

export default function GPayDashboard({ user, onLogout }) {
  const [balance, setBalance] = useState(user.balance);
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]); 
  
  // Navigation State
  const [currentView, setCurrentView] = useState('home'); // 'home', 'pay', 'manual_pay'
  const [selectedContact, setSelectedContact] = useState(null);
  const [amount, setAmount] = useState('');
  
  // Manual Pay Lookup State
  const [manualEmail, setManualEmail] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Payment State
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);

  // Modals
  const [showBalance, setShowBalance] = useState(false);

  useEffect(() => {
    fetchInitialData();

    const userSub = supabase
      .channel('public:users')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `email=eq.${user.email}` }, (payload) => {
        setBalance(payload.new.balance);
      })
      .subscribe();

    const txSub = supabase
      .channel('public:transactions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
        if (payload.new.sender_email === user.email || payload.new.receiver_email === user.email) {
          setTransactions(prev => [payload.new, ...prev]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(userSub);
      supabase.removeChannel(txSub);
    };
  }, [user.email]);

  const fetchInitialData = async () => {
    const { data: contactsData } = await supabase
      .from('users')
      .select('name, email')
      .neq('email', user.email)
      .neq('role', 'admin');
    setUsers(contactsData || []);

    const { data: txData } = await supabase
      .from('transactions')
      .select('*')
      .or(`sender_email.eq.${user.email},receiver_email.eq.${user.email}`)
      .order('created_at', { ascending: false })
      .limit(20);
    setTransactions(txData || []);
    
    // We should get balance fresh
    const { data: userData } = await supabase
      .from('users')
      .select('balance')
      .eq('email', user.email)
      .single();
    if(userData) setBalance(userData.balance);
  };

  const handlePayClick = (contact) => {
    if(!contact) return;
    setSelectedContact(contact);
    setCurrentView('pay');
    setPaymentStatus(null);
    setAmount('');
    setVerifyError('');
  };

  const handleVerifyAccount = async () => {
    if (!manualEmail) return;
    setIsVerifying(true);
    setVerifyError('');

    try {
        if (manualEmail === user.email) {
            setVerifyError("You cannot pay yourself. Use self-transfer.");
            return;
        }

        const { data, error } = await supabase
            .from('users')
            .select('name, email')
            .eq('email', manualEmail.trim())
            .single();

        if (error || !data) {
            setVerifyError("No account found! Please check the email.");
        } else {
            handlePayClick(data);
        }
    } catch {
        setVerifyError("An error occurred while hunting for this account.");
    } finally {
        setIsVerifying(false);
    }
  };

  const executePayment = async () => {
    if (!amount || isNaN(amount) || amount <= 0) return;
    if (amount > balance) {
        setPaymentStatus({ type: 'error', msg: 'Insufficient Balance' });
        return;
    }

    if (!selectedContact?.email) {
        setPaymentStatus({ type: 'error', msg: 'Please enter a valid email to pay.' });
        return;
    }

    setIsProcessing(true);
    setPaymentStatus(null);
    const numAmount = parseFloat(amount);
    
    let aiScore = 0;
    let aiType = "UNKNOWN";
    let aiExp = "No AI analysis performed.";
    
    try {
        // Updated Endpoint
        const hfResponse = await axios.post('https://mukilan-k-orhcid-fraud-detection-model.hf.space/api/predict', {
            data: [
                numAmount,
                new Date().getHours(),
                "Gmail",
                "Android",
                numAmount % 10 === 0,
                "Low Frequency"
            ]
        });
        const result = hfResponse.data.data; 
        const jsonResult = result[0];
        aiExp = result[1];
        aiScore = parseFloat(jsonResult["Fraud Score"]);
        aiType = jsonResult["Predicted Type"];
    } catch (e) {
        console.warn("API fallthrough caught.", e);
        // Fallback for demo if API hits sleep mode or CORS
        if(numAmount > 8000) {
            aiScore = 0.85; aiType = "BEHAVIORAL_ABUSE"; aiExp = "Fallback: Unusually large transaction flagged.";
        }
    }

    try {
        const { data, error } = await supabase.rpc('transfer_funds', {
            p_sender_email: user.email,
            p_receiver_email: selectedContact.email,
            p_amount: numAmount,
            p_ai_fraud_score: aiScore,
            p_ai_fraud_type: aiType,
            p_ai_explanation: aiExp
        });

        if (error) throw error;
        
        if (data.status === 'frozen') {
            setPaymentStatus({ type: 'frozen', msg: `Transaction Frozen: Flagged for ${aiType}. Pending Admin Review.` });
        } else {
            setPaymentStatus({ type: 'success', msg: 'Payment Sent Successfully!' });
            setTimeout(() => {
                setCurrentView('home');
                setManualEmail('');
            }, 2000);
        }
    } catch (err) {
        setPaymentStatus({ type: 'error', msg: err.message || 'Payment Failed' });
    } finally {
        setIsProcessing(false);
    }
  };

  // ---------------- UI RENDERERS ----------------

  if (currentView === 'manual_pay') {
      return (
          <div className="min-h-screen flex flex-col bg-[#F8F9FA]">
              {/* Header */}
              <div className="bg-white px-4 py-4 flex items-center shadow-sm">
                  <button onClick={() => setCurrentView('home')} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
                      <ArrowLeft className="w-6 h-6 text-slate-800" />
                  </button>
                  <h2 className="font-bold text-slate-800 text-lg ml-2">Find a Contact</h2>
              </div>
              
              <div className="p-6">
                 <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-4">
                     <p className="text-sm font-semibold text-slate-600 mb-2">Recipient Email Address</p>
                     <input 
                         type="email"
                         value={manualEmail}
                         onChange={e => setManualEmail(e.target.value)}
                         placeholder="e.g. friend@email.com"
                         className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 outline-none focus:border-blue-500 hover:border-blue-300 transition-colors"
                         autoFocus
                     />
                     {verifyError && <p className="text-red-500 font-medium text-xs mt-3 bg-red-50 p-2 rounded-xl">{verifyError}</p>}
                     
                     <button 
                        onClick={handleVerifyAccount}
                        disabled={isVerifying || !manualEmail}
                        className="w-full mt-6 bg-[#0A56D1] hover:bg-[#1A73E8] disabled:bg-[#A8C7FA] text-white py-4 rounded-full font-semibold text-sm flex items-center justify-center transition-all shadow-md shadow-blue-500/20 active:scale-95"
                     >
                         {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Continue"}
                     </button>
                 </div>
              </div>
          </div>
      );
  }

  if (currentView === 'pay') {
      return (
        <div className="min-h-screen flex flex-col bg-[#F8F9FA]">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentView('home')} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
                        <ArrowLeft className="w-6 h-6 text-slate-800" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                            {selectedContact?.name?.charAt(0) || '@'}
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-800 leading-tight">{selectedContact?.name || 'Unknown'}</h2>
                            <p className="text-xs text-slate-500">{selectedContact?.email}</p>
                        </div>
                    </div>
                </div>
                <button className="text-blue-600 font-semibold text-sm">Help</button>
            </div>

            {/* Input Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8 bg-[#F8F9FA]">
                <p className="text-slate-600 font-medium">Paying {selectedContact?.name}</p>
                
                <div className="flex items-center justify-center text-5xl font-light text-slate-800">
                    <IndianRupee className="w-8 h-8 mr-1 mt-2 text-slate-500" />
                    <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="w-full max-w-[200px] bg-transparent outline-none placeholder:text-slate-300 text-center"
                        autoFocus
                    />
                </div>

                <div className="bg-white px-4 py-3 rounded-2xl shadow-sm w-full max-w-sm flex flex-col items-center justify-center border-t-2 border-[#1A73E8]">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Available Balance</span>
                    <span className="text-lg font-bold text-slate-800">₹{balance}</span>
                </div>

                {paymentStatus && (
                    <div className={`p-4 rounded-3xl w-full max-w-sm text-center text-sm font-medium ${
                        paymentStatus.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
                        paymentStatus.type === 'frozen' ? 'bg-orange-100 text-orange-800 border border-orange-300 shadow-md shadow-orange-500/10' :
                        'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                        {paymentStatus.msg}
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div className="p-6">
                <button 
                  onClick={executePayment}
                  disabled={isProcessing || !amount}
                  className="w-full bg-[#1A73E8] disabled:bg-[#A8C7FA] text-white py-4 rounded-full font-semibold text-lg flex items-center justify-center shadow-md active:scale-95 transition-all"
                >
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                     (amount ? `Pay ₹${amount}` : 'Enter amount')}
                </button>
                <p className="text-center text-xs text-slate-500 mt-4 flex items-center justify-center gap-1">
                    Secured by <span className="font-bold grayscale opacity-70">FraudGuard AI</span>
                </p>
            </div>
        </div>
      );
  }

  // Define Home Actions
  const actionItems = [
    { icon: <QrCode className="w-7 h-7" />, label: "Scan any\nQR code", onClick: null },
    { icon: <Contact className="w-7 h-7" />, label: "Pay\ncontacts", onClick: () => setCurrentView('manual_pay') },
    { icon: <Smartphone className="w-7 h-7" />, label: "Pay phone\nnumber", onClick: () => setCurrentView('manual_pay') },
    { icon: <Landmark className="w-7 h-7" />, label: "Bank\ntransfer", onClick: null },
    { icon: <AtSign className="w-7 h-7" />, label: "Pay UPI ID\nor number", onClick: () => setCurrentView('manual_pay') },
    { icon: <RefreshCcw className="w-7 h-7" />, label: "Self\ntransfer", onClick: null },
    { icon: <ReceiptText className="w-7 h-7" />, label: "Pay\nbills", onClick: null },
    { icon: <Zap className="w-7 h-7" />, label: "Mobile\nrecharge", onClick: null },
  ];

  return (
    <div className="min-h-screen bg-white pb-32 relative font-sans">
      
      {/* Top Header */}
      <div className="px-5 pt-12 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <button className="relative">
                  <div className="w-11 h-11 bg-slate-200 rounded-full flex items-center justify-center text-xl font-medium text-slate-700 overflow-hidden shadow-inner border border-slate-300">
                      {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                  </div>
              </button>
              <div>
                  <h1 className="text-[19px] font-semibold text-[#1F1F1F] leading-snug">Hey {user.name?.split(' ')[0] || user.email.split('@')[0]}</h1>
                  <button className="flex items-center bg-[#F2F2F2] rounded-full px-3 py-1 text-xs text-[#444746] font-medium mt-1 hover:bg-slate-200 transition-colors">
                      UPI id : {user.email?.split('@')[0]}@okicici <ChevronDown className="w-3 h-3 ml-1" />
                  </button>
              </div>
          </div>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors" onClick={onLogout}>
              <span className="text-xs font-bold text-red-500">LOGOUT</span>
          </button>
      </div>

      {/* Action Grid */}
      <div className="px-6 mt-6">
          <div className="grid grid-cols-4 gap-y-8 gap-x-2">
              {actionItems.map((item, idx) => (
                  <button 
                    key={idx} 
                    onClick={item.onClick}
                    className={`flex flex-col items-center gap-2 group ${!item.onClick && 'opacity-50 grayscale cursor-not-allowed'}`}
                  >
                      <div className="text-[#0A56D1] group-active:scale-95 transition-transform">
                          {item.icon}
                      </div>
                      <span className="text-[11px] font-medium text-[#1F1F1F] text-center leading-tight whitespace-pre-line">
                          {item.label}
                      </span>
                  </button>
              ))}
          </div>
      </div>

      {/* Gray Section */}
      <div className="mt-8 bg-[#F8F9FA] rounded-t-[2.5rem] min-h-[500px]">
          
          {/* People Section */}
          <div className="px-5 pt-8">
              <div className="flex justify-between items-center mb-5">
                  <h3 className="text-[17px] font-semibold text-[#1F1F1F]">People</h3>
              </div>

              {users.length === 0 ? (
                  <div className="text-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                      <p className="text-slate-500 text-sm mb-3">You don't have any contacts yet.</p>
                      <button onClick={() => setCurrentView('manual_pay')} className="bg-[#E8F0FE] text-[#1A73E8] font-bold py-2 px-4 rounded-full text-sm">
                          Find Contact
                      </button>
                  </div>
              ) : (
                  <div className="grid grid-cols-4 gap-y-6">
                      {users.map((u, i) => {
                          const colors = ['bg-[#A8C7FA]', 'bg-[#FEEAE6]', 'bg-[#C4EED0]', 'bg-[#F8D8D8]'];
                          return (
                              <button key={u.email} onClick={() => handlePayClick(u)} className="flex flex-col items-center gap-1.5 group">
                                  <div className={`w-[60px] h-[60px] ${colors[i % colors.length]} rounded-full flex items-center justify-center text-3xl font-normal text-[#1F1F1F] overflow-hidden group-active:opacity-80 transition-opacity`}>
                                      {u.name?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-xs font-medium text-[#1F1F1F] truncate w-[70px] text-center">
                                      {u.name?.split(' ')[0] || u.email.split('@')[0]}
                                  </span>
                              </button>
                          );
                      })}
                  </div>
              )}
          </div>

          <div className="px-5 mt-10 space-y-4">
              <button 
                  onClick={() => setShowBalance(!showBalance)}
                  className="w-full bg-white p-4 rounded-3xl flex items-center justify-between shadow-sm active:scale-95 transition-transform"
              >
                  <div className="flex items-center gap-3">
                      <Wallet className="w-6 h-6 text-[#1A73E8]" />
                      <span className="font-semibold text-[#1F1F1F]">Check bank balance</span>
                  </div>
                  {showBalance ? (
                      <span className="font-bold text-[#1F1F1F]">₹{balance}</span>
                  ) : (
                      <span className="text-slate-400 font-bold text-lg leading-none">›</span>
                  )}
              </button>

              <div className="bg-white p-4 rounded-3xl shadow-sm">
                  <h3 className="font-semibold text-[#1F1F1F] mb-3">Transaction History</h3>
                  <div className="space-y-4">
                      {transactions.length === 0 ? (
                          <p className="text-xs text-slate-400">No recent transactions.</p>
                      ) : (
                          transactions.map(tx => {
                              const isSender = tx.sender_email === user.email;
                              return (
                                  <div key={tx.id} className="flex justify-between items-center border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                                      <div className="flex flex-col">
                                          <span className="font-semibold text-sm text-[#1F1F1F]">{isSender ? `To ${tx.receiver_email}` : `From ${tx.sender_email}`}</span>
                                          <span className="text-[10px] text-slate-500">{new Date(tx.created_at).toLocaleDateString()} • {tx.status.toUpperCase()}</span>
                                      </div>
                                      <span className={`font-bold text-sm ${isSender ? 'text-[#1F1F1F]' : 'text-green-600'}`}>
                                          {isSender ? '-' : '+'}₹{tx.amount}
                                      </span>
                                  </div>
                              )
                          })
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex items-center justify-around pb-6 pt-3 px-2 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
          <button className="flex flex-col items-center gap-1 w-16">
              <div className="bg-[#C2E7FF] w-14 h-8 rounded-full flex items-center justify-center">
                  <Home className="w-5 h-5 text-[#001D35]" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-bold text-[#001D35]">Home</span>
          </button>
          
          <button className="flex flex-col items-center gap-1 w-16 opacity-70">
              <div className="w-14 h-8 flex items-center justify-center">
                  <Link className="w-5 h-5 text-[#444746]" strokeWidth={2} />
              </div>
              <span className="text-[10px] font-semibold text-[#444746]">Pay Now</span>
          </button>

          {/* Floating Action Button inside Nav bar styling */}
          <div className="relative -mt-10 flex justify-center w-20">
              <div className="hidden absolute bg-white rounded-full w-[72px] h-[72px] -top-1 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"></div>
              <button 
                onClick={() => setCurrentView('manual_pay')}
                className="relative bg-[#0A56D1] hover:bg-[#2563eb] active:scale-95 text-white rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-lg shadow-blue-500/40 transition-all z-10 border-4 border-white"
              >
                  <Search className="w-7 h-7" />
              </button>
          </div>

          <button className="flex flex-col items-center gap-1 w-[72px] opacity-70">
              <div className="w-14 h-8 flex items-center justify-center">
                  <ReceiptText className="w-5 h-5 text-[#444746]" strokeWidth={2} />
              </div>
              <span className="text-[10px] font-semibold text-[#444746] text-center leading-tight">Bills &<br/>Recharges</span>
          </button>

          <button className="flex flex-col items-center gap-1 w-16 opacity-70">
              <div className="w-14 h-8 flex items-center justify-center">
                  <MoreHorizontal className="w-6 h-6 text-[#444746]" strokeWidth={2} />
              </div>
              <span className="text-[10px] font-semibold text-[#444746]">More</span>
          </button>
      </div>

    </div>
  );
}
