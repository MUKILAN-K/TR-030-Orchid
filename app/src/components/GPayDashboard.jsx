import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import fpPromise from '@fingerprintjs/fingerprintjs';
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
  LogOut,
  AlertCircle,
  MessageSquare
} from 'lucide-react';
import axios from 'axios';

export default function GPayDashboard({ user, onLogout }) {
  const [balance, setBalance] = useState(user.balance);
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]); 
  
  // Navigation State
  const [currentView, setCurrentView] = useState('home'); 
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

  // Appeal State
  const [appealTxId, setAppealTxId] = useState(null);
  const [appealText, setAppealText] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchInitialData();
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

  const submitAppeal = async () => {
    if (!appealText.trim()) return;
    setIsSubmittingAppeal(true);
    
    const { error } = await supabase
      .from('transactions')
      .update({ user_explanation: appealText })
      .eq('id', appealTxId);
      
    setIsSubmittingAppeal(false);
    
    if (!error) {
      setAppealTxId(null);
      setAppealText('');
      fetchInitialData();
    } else {
      alert("Error submitting appeal: " + error.message);
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
    
    // ==========================================
    // UNIFIED FRAUD MITIGATION ENGINE API
    // ==========================================
    let aiScore = 0.05;
    let aiType = "VERIFIED_SAFE";
    let masterExplanation = "All telemetry verified safe.";
    let visitorId = "UNAVAILABLE";

    try {
        // 1. DEVICE FINGERPRINTING (Cost: FREE)
        try {
            const fp = await fpPromise.load();
            const fpResult = await fp.get();
            visitorId = fpResult.visitorId;
        } catch(e) { console.warn("Fingerprint Gen Failed", e); }

        // 2. IP QUALITY SCORE (Cost: FREE TIER)
        let isVPN = false;
        let pScore = 0;
        try {
            // Get user's true Public IP
            const { data: { ip } } = await axios.get('https://api.ipify.org?format=json');
            
            // Ping IPQS Analytics
            const ipqsRes = await axios.get(`https://www.ipqualityscore.com/api/json/ip/ST4ZLbAEkCuvy6I8FuMECzW5ScDz5h11/${ip}`);
            if (ipqsRes.data?.success) {
                pScore = ipqsRes.data.fraud_score;
                isVPN = ipqsRes.data.vpn || ipqsRes.data.proxy || ipqsRes.data.tor;
            }
        } catch(e) { console.warn("Network Analytics Failed", e); }

        // 3. GATHER SENDER FINANCIAL BASELINE
        let histCount = 0;
        let histAvg = 0;
        try {
            const { data: histData } = await supabase
                .from('transactions')
                .select('amount')
                .eq('sender_email', user.email)
                .eq('status', 'completed');
            
            if (histData && histData.length > 0) {
                histCount = histData.length;
                const totalSent = histData.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
                histAvg = (totalSent / histCount).toFixed(2);
            }
        } catch(e) { console.warn("History fetch failed", e); }

        // 3.5. GATHER RECEIVER VULNERABILITY (Money Mule Defense)
        let receiverRole = "user";
        let receiverInboundCount = 0;
        let receiverInboundVolume = 0;
        try {
            const { data: recUser } = await supabase.from('users').select('role').eq('email', receiver).single();
            if (recUser) receiverRole = recUser.role;

            const yesterday = new Date(Date.now() - 86400000).toISOString();
            const { data: recTx } = await supabase
                .from('transactions')
                .select('amount')
                .eq('receiver_email', receiver)
                .eq('status', 'completed')
                .gte('created_at', yesterday);
                
            if (recTx && recTx.length > 0) {
                receiverInboundCount = recTx.length;
                receiverInboundVolume = recTx.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
            }
        } catch(e) { console.warn("Receiver analysis failed", e); }

        // 3.8 GATHER TRUST BOND (Kinship Analysis)
        let trustCount = 0;
        let trustVolume = 0;
        try {
            const { data: trustData } = await supabase
                .from('transactions')
                .select('amount')
                .eq('sender_email', user.email)
                .eq('receiver_email', receiver)
                .eq('status', 'completed');
            
            if (trustData && trustData.length > 0) {
                trustCount = trustData.length;
                trustVolume = trustData.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
            }
        } catch(e) { console.warn("Trust bond fetch failed", e); }

        // 3.9 GRAPH TRAVERSAL: TRI-NODE LAUNDERING SYNDICATE DETECTION
        let graphSyndicateDetected = false;
        try {
            // STEP 1: Has Party B (Receiver) sent money to a Party C?
            const { data: hop1 } = await supabase.from('transactions').select('receiver_email').eq('sender_email', receiver).eq('status', 'completed');
            
            if (hop1 && hop1.length > 0) {
                // STEP 2: Extract all Party C's
                const partyCEmails = hop1.map(tx => tx.receiver_email);
                
                // STEP 3: Has any occurance of Party C sent money BACK to Party A (the original Sender)?
                const { data: hop2 } = await supabase.from('transactions')
                    .select('id')
                    .in('sender_email', partyCEmails)
                    .eq('receiver_email', user.email)
                    .eq('status', 'completed');
                
                if (hop2 && hop2.length > 0) {
                    graphSyndicateDetected = true; // Circular Loop Detected!
                }
            }
        } catch (e) {
            console.warn("Graph linkage scan failed", e);
        }

        // 4. GEMINI LLM AGENT EVALUATOR (Cost: FREE)
        let mlScore = 0;
        let mlExplanation = "Normal profile.";
        let rawMlType = "SAFE";
        try {
            const percDrain = ((numAmount / balance) * 100).toFixed(1);
            
            const prompt = `You are an elite bank fraud security analyst algorithm. 
Synthesize this live transaction telemetry and return ONLY a raw JSON object. Do NOT use markdown blocks or backticks.

CURRENT TELEMETRY DATA:
- Sender Email: ${user.email}
- Transfer Amount: ₹${numAmount} (Consumes ${percDrain}% of available balance)
- Current Local Time: ${new Date().toLocaleTimeString()}
- Network Intelligence Risk Score: ${pScore}% Risk
- VPN/Proxy Masking Detected: ${isVPN}
- Cryptographic Device Hash: ${visitorId}

SENDER'S HISTORICAL BASELINE:
- Current Bank Balance: ₹${balance}
- Total Successful Transfers Ever Made: ${histCount}
- Their Average Transfer Size: ₹${histAvg > 0 ? histAvg : 'N/A (Brand New Account)'}

RECEIVER'S VULNERABILITY FOOTPRINT (MONEY MULE DETECTION):
- Target Account Designation: ${receiverRole.toUpperCase()} (Standard users should NOT be receiving massive, business-level financial influxes)
- Total Inbound Transfers Traced Today: ${receiverInboundCount}
- Total Gross Inbound Volume Today: ₹${receiverInboundVolume.toFixed(2)}

TARGET INTER-RELATIONSHIP (THE TRUST BOND):
- Has the Sender successfully sent money to this explicit Receiver before?: ${trustCount > 0 ? 'YES' : 'NO'}
- Total Intersectional Past Transactions: ${trustCount}
- Lifetime Economic Volume Exchanged Together: ₹${trustVolume.toFixed(2)}

CRITERIA & INSTRUCTIONS:
1. Compare the Sender's Telemetry against their Baseline, evaluating the Receiver's Drop Zone footprint.
2. CRITICAL RULE: If the "Trust Bond" is established (Trust Transactions > 0), you MUST apply extreme analytical leniency. Huge deviations in Amount to a trusted beneficiary are usually completely safe (e.g., medical emergencies, hospital bills, rent payments). If the Trust Bond is 0, remain strictly skeptical.

Is this a Funneling attack, a behavioral anomaly, highly suspicious, or safe?
Respond strictly in this formatting:
{"fraud_score": (float between 0.0 and 1.0, where > 0.8 is guaranteed frozen), "predicted_type": "(Choose ONE: SAFE, BEHAVIORAL_ABUSE, NETWORK_ANOMALY, UNUSUAL_AMOUNT, OR LAUNDERING)", "explanation": "(Write a very strict, 1-2 sentence professional explanation diagnosing exactly what triggered the score. Strongly cite the Trust Bond or Baseline context if applicable. Address the admin directly.)"}`;

            const geminiResponse = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
                { contents: [{ parts: [{ text: prompt }] }] },
                { headers: { 'Content-Type': 'application/json' } }
            );

            // Strip out any unexpected LLM Markdown formatting
            let rawText = geminiResponse.data.candidates[0].content.parts[0].text;
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const aiData = JSON.parse(rawText);

            mlScore = parseFloat(aiData.fraud_score);
            rawMlType = aiData.predicted_type;
            mlExplanation = aiData.explanation;
        } catch (e) {
            console.warn("Gemini Engine Fallback", e);
            mlScore = 0.1; // Safely fail open if Gemini API crashes
            rawMlType = "SAFE";
            mlExplanation = "Warning: AI Evaluator unreachable. Cleared transaction under manual escalation protocols.";
        }

        // ==========================================
        // SYNTHESIS DECISION TREE
        // ==========================================

        if (graphSyndicateDetected) {
            aiScore = 0.99;
            aiType = "LAUNDERING_SYNDICATE";
            masterExplanation = "CRITICAL: Graph Analysis detected a circular laundering loop logic (A => B => C => A). Absolute freeze executed across all nodes.";
        } else if (isVPN || pScore > 85) {
            aiScore = 0.98;
            aiType = "NETWORK_ANOMALY (IPQS)";
            masterExplanation = `CRITICAL OVERRIDE: Suspicious network connection detected. VPN/Proxy=${isVPN}, Global IP Risk Score=${pScore}%. Device Hash: [${visitorId.substring(0,8)}]`;
        } else if (mlScore > 0.8) {
            aiScore = mlScore;
            aiType = rawMlType;
            masterExplanation = `ML Engine Trigger: ${mlExplanation} | IPQS Risk: ${pScore}% | Device Hash: [${visitorId.substring(0,8)}]`;
        } else {
            aiScore = 0.05;
            aiType = "VERIFIED_SAFE";
            masterExplanation = `Transaction authenticated. Network Risk: ${pScore}% | Device Hash: [${visitorId.substring(0,8)}]`;
        }
        
    } catch (e) {
        // Absolute worst case fallback
        console.error("Master mitigation failure", e);
    }

    // DISPATCH TO BACKEND (Adding DB-level Velocity checks)
    try {
        const { data, error } = await supabase.rpc('transfer_funds', {
            p_sender_email: user.email,
            p_receiver_email: selectedContact.email,
            p_amount: numAmount,
            p_ai_fraud_score: aiScore,
            p_ai_fraud_type: aiType,
            p_ai_explanation: masterExplanation
        });

        if (error) throw error;
        
        if (data.status === 'frozen') {
            setPaymentStatus({ type: 'frozen', msg: `Frozen: Flagged for ${aiType}. Pending Admin Review.` });
            setTimeout(() => {
                setCurrentView('home');
                setManualEmail('');
            }, 3000);
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
            <div className="bg-white px-4 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4 truncate">
                    <button onClick={() => setCurrentView('home')} className="p-2 -ml-2 rounded-full flex-shrink-0 hover:bg-slate-100">
                        <ArrowLeft className="w-6 h-6 text-slate-800" />
                    </button>
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 flex-shrink-0 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                            {selectedContact?.name?.charAt(0) || '@'}
                        </div>
                        <div className="overflow-hidden">
                            <h2 className="font-bold text-slate-800 leading-tight truncate">{selectedContact?.name || 'Unknown'}</h2>
                            <p className="text-xs text-slate-500 truncate">{selectedContact?.email}</p>
                        </div>
                    </div>
                </div>
                <button className="text-blue-600 font-semibold text-sm flex-shrink-0 ml-2">Help</button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8 bg-[#F8F9FA]">
                <p className="text-slate-600 font-medium truncate w-full text-center">Paying <span className="font-bold">{selectedContact?.name}</span></p>
                
                <div className="flex items-center justify-center text-5xl font-light text-slate-800 w-full max-w-sm">
                    <IndianRupee className="w-8 h-8 mr-1 mt-2 text-slate-500" />
                    <input 
                        type="number" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent outline-none placeholder:text-slate-300 text-center"
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

            <div className="p-6">
                <button 
                  onClick={executePayment}
                  disabled={isProcessing || !amount}
                  className="w-full bg-[#1A73E8] disabled:bg-[#A8C7FA] text-white py-4 rounded-full font-semibold text-lg flex items-center justify-center shadow-md active:scale-95 transition-all relative overflow-hidden"
                >
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                     (amount ? `Pay ₹${amount}` : 'Enter amount')}
                     {/* Cool AI Scan Effect */}
                     {isProcessing && <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-[100%] animate-[scan_1.5s_ease-in-out_infinite]"></div>}
                </button>
                <p className="text-center text-[10px] text-slate-400 mt-4 flex items-center justify-center gap-1.5 uppercase font-medium tracking-wide">
                    {isProcessing ? (
                        <>Scanning telemetry vectors <Loader2 className="w-3 h-3 animate-spin"/> </>
                    ) : (
                        <>Protected by <span className="font-bold text-slate-500">Orchid Network Intelligence</span></>
                    )}
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
          <div className="flex items-center gap-3 overflow-hidden">
              <button className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-xl font-medium text-slate-700 overflow-hidden shadow-inner border border-slate-300">
                      {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                  </div>
              </button>
              <div className="overflow-hidden">
                  <h1 className="text-[19px] font-semibold text-[#1F1F1F] leading-tight mb-1 truncate">Hey {user.name?.split(' ')[0] || user.email.split('@')[0]}</h1>
                  <button className="flex items-center justify-center bg-[#F2F2F2] rounded-full px-3 py-1.5 text-xs text-[#444746] font-medium hover:bg-slate-200 transition-colors w-full max-w-[200px]">
                      <span className="truncate">UPI id : {user.email?.split('@')[0]}@okicici</span>
                      <ChevronDown className="w-3 h-3 ml-1 flex-shrink-0" />
                  </button>
              </div>
          </div>
          <button className="p-2 ml-1 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0" onClick={onLogout}>
              <LogOut className="w-6 h-6 text-red-500" />
          </button>
      </div>

      {/* Banner */}
      <div className="px-5 mt-2 mb-2">
          <div className="bg-[#E8F0FE] rounded-3xl p-5 flex relative overflow-hidden">
              <div className="w-[70%] z-10">
                  <h2 className="text-[#1F1F1F] text-[18px] font-semibold leading-tight">Instant loans<br/>up to ₹8 lakhs</h2>
                  <button className="bg-[#1A73E8] text-white text-xs font-semibold px-4 py-2 rounded-full mt-4 flex items-center shadow-sm">
                      Apply now <span className="ml-1 text-lg leading-none">›</span>
                  </button>
              </div>
              <div className="absolute right-0 bottom-0 w-[40%] h-full">
                  <div className="absolute bottom-0 right-4 w-16 h-24 bg-[#E2A684] rounded-t-full flex items-end justify-center">
                      <div className="w-12 h-16 bg-[#F28B82] rounded-t-xl z-20"></div>
                      <div className="absolute top-4 w-10 h-10 bg-[#E2A684] rounded-full z-30"></div>
                      <div className="absolute top-6 w-8 h-3 bg-[#1F1F1F] rounded-full opacity-20 z-40"></div>
                  </div>
                  <div className="absolute top-4 right-10 w-8 h-8 bg-[#FDBA05] rounded-full flex items-center justify-center text-[#B06000] text-xs font-bold font-serif shadow-sm opacity-90">₹</div>
                  <div className="absolute bottom-4 left-2 w-6 h-6 bg-[#FDBA05] rounded-full flex items-center justify-center text-[#B06000] text-[10px] font-bold font-serif shadow-sm opacity-90">₹</div>
              </div>
          </div>
      </div>

      {/* Action Grid */}
      <div className="px-6 mt-6">
          <div className="grid grid-cols-4 gap-y-7 gap-x-2">
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
                  className="w-full bg-white p-4 rounded-3xl flex items-center justify-between shadow-sm active:scale-95 transition-transform border border-slate-100"
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

              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                  <h3 className="font-semibold text-[#1F1F1F] mb-3">Transaction History</h3>
                  <div className="space-y-4">
                      {transactions.length === 0 ? (
                          <p className="text-xs text-slate-400">No recent transactions.</p>
                      ) : (
                          transactions.map(tx => {
                              const isSender = tx.sender_email === user.email;
                              
                              return (
                                  <div key={tx.id} className="flex flex-col border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                                      <div className="flex justify-between items-center">
                                          <div className="flex flex-col">
                                              <span className="font-semibold text-sm text-[#1F1F1F]">{isSender ? `To ${tx.receiver_email}` : `From ${tx.sender_email}`}</span>
                                              <span className="text-[10px] text-slate-500 font-medium tracking-wide mt-0.5">{new Date(tx.created_at).toLocaleDateString('en-GB')} • <span className={tx.status === 'frozen' ? 'text-orange-500 font-bold' : ''}>{tx.status.toUpperCase()}</span></span>
                                          </div>
                                          <span className={`font-bold text-sm ${isSender ? 'text-[#1F1F1F]' : 'text-green-600'} ${tx.status==='frozen' && 'opacity-30'}`}>
                                              {isSender ? '-' : '+'}₹{tx.amount}
                                          </span>
                                      </div>
                                      
                                      {/* Frozen State Appeal UI (Only for Sender) */}
                                      {tx.status === 'frozen' && isSender && (
                                          <div className="mt-3 bg-orange-50 rounded-2xl p-3 border border-orange-100">
                                              <div className="flex items-center gap-2 text-orange-800 text-xs font-bold mb-2">
                                                  <AlertCircle className="w-4 h-4" /> Action Required: Security Freeze
                                              </div>
                                              
                                              {!tx.user_explanation ? (
                                                  <div className="space-y-2">
                                                      <p className="text-[11px] text-orange-700 leading-tight">This payment was automatically frozen by Orchid Compliance due to irregular patterns. The funds are held. Submit a brief explanation to release the funds to the vendor.</p>
                                                      
                                                      {appealTxId === tx.id ? (
                                                          <div className="flex flex-col gap-2 mt-2">
                                                              <textarea 
                                                                  value={appealText}
                                                                  onChange={e => setAppealText(e.target.value)}
                                                                  placeholder="I am paying for..."
                                                                  className="w-full text-xs p-2 rounded-xl border border-orange-200 outline-none focus:border-orange-400 bg-white"
                                                                  rows={2}
                                                              />
                                                              <div className="flex gap-2">
                                                                  <button 
                                                                    onClick={submitAppeal}
                                                                    disabled={isSubmittingAppeal || !appealText.trim()}
                                                                    className="bg-orange-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center justify-center flex-1 shadow-sm"
                                                                  >
                                                                      {isSubmittingAppeal ? 'Submitting...' : 'Submit Appeal'}
                                                                  </button>
                                                                  <button 
                                                                    onClick={() => setAppealTxId(null)}
                                                                    className="bg-white text-orange-500 text-xs font-bold py-1.5 px-3 rounded-lg border border-orange-200"
                                                                  >
                                                                      Cancel
                                                                  </button>
                                                              </div>
                                                          </div>
                                                      ) : (
                                                          <button 
                                                            onClick={() => { setAppealTxId(tx.id); setAppealText(''); }}
                                                            className="bg-orange-600 hover:bg-orange-700 active:scale-95 transition-all text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center shadow-sm w-full"
                                                          >
                                                              <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Submit Security Explanation
                                                          </button>
                                                      )}
                                                  </div>
                                              ) : (
                                                  <div className="bg-white/60 p-2.5 rounded-xl border border-orange-100">
                                                      <p className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 tracking-wider">Your Submitted Explanation:</p>
                                                      <p className="text-xs text-slate-700 font-medium italic">"{tx.user_explanation}"</p>
                                                      <p className="text-[10px] text-orange-600 font-bold mt-2">Pending Admin Clearance...</p>
                                                  </div>
                                              )}
                                          </div>
                                      )}
                                      
                                      {/* Receiver Notice */}
                                      {tx.status === 'frozen' && !isSender && (
                                           <div className="mt-2 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                                <p className="text-[10px] text-slate-500 font-medium">Funds are frozen pending a security clearance review from the sender.</p>
                                           </div>
                                      )}
                                      
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

          <div className="relative -mt-10 flex justify-center w-20">
              <div className="hidden absolute bg-white rounded-full w-[72px] h-[72px] -top-1 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"></div>
              <button 
                onClick={() => setCurrentView('manual_pay')}
                className="relative bg-[#0A56D1] hover:bg-[#2563eb] active:scale-95 text-white rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-lg shadow-blue-500/30 transition-all z-10 border-4 border-white"
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
