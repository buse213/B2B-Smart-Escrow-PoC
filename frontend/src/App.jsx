/* eslint-disable */
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const BUYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SELLER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ARBITER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const ABI = [
  "function amount() view returns (uint256)",
  "function isDelivered() view returns (bool)",
  "function isDisputed() view returns (bool)",
  "function isCompleted() view returns (bool)",
  "function disputeProof() view returns (string)",
  "function deposit() payable",
  "function approveDelivery()",
  "function raiseDispute(string _proofHash)",
  "function resolveDispute(bool _refundToBuyer)",
  "function autoRelease()",
  "function refund()"
];

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

export default function App() {
  const [contractAddress, setContractAddress] = useState(""); 
  const [activeTab, setActiveTab] = useState('buyer');
  
  // Orijinal State'lerin
  const [state, setState] = useState({ amount: "0", isDelivered: false, isDisputed: false, isCompleted: false, disputeProof: "" });
  const [depositAmount, setDepositAmount] = useState("100"); 
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidencePreview, setEvidencePreview] = useState("");
  const [ipfsHash, setIpfsHash] = useState("");
  const [uploading, setUploading] = useState(false);

  // YENİ: UI/UX State'leri (Cüzdanlar ve Terminal)
  const [balances, setBalances] = useState({ buyer: "0", seller: "0", arbiter: "0" });
  const [txHistory, setTxHistory] = useState([]); 

  // Terminale Log Ekleme Fonksiyonu
  const addLog = (type, msg, hash = "") => {
    const time = new Date().toLocaleTimeString();
    setTxHistory(prev => [{ time, type, msg, hash }, ...prev]);
  };

  const getContracts = () => {
    if (!contractAddress) return null;
    return {
      buyer: new ethers.Contract(contractAddress, ABI, new ethers.Wallet(BUYER_KEY, provider)),
      seller: new ethers.Contract(contractAddress, ABI, new ethers.Wallet(SELLER_KEY, provider)),
      arbiter: new ethers.Contract(contractAddress, ABI, new ethers.Wallet(ARBITER_KEY, provider))
    };
  };

  const fetchState = async () => {
    const contracts = getContracts();
    if (!contracts) return;
    try {
      setState({
        amount: ethers.formatEther(await contracts.buyer.amount()),
        isDelivered: await contracts.buyer.isDelivered(),
        isDisputed: await contracts.buyer.isDisputed(),
        isCompleted: await contracts.buyer.isCompleted(),
        disputeProof: await contracts.buyer.disputeProof()
      });
      
      // YENİ: Canlı Cüzdan Bakiyelerini Çekiyoruz
      const bBal = await provider.getBalance(new ethers.Wallet(BUYER_KEY).address);
      const sBal = await provider.getBalance(new ethers.Wallet(SELLER_KEY).address);
      const aBal = await provider.getBalance(new ethers.Wallet(ARBITER_KEY).address);
      
      setBalances({
        buyer: Number(ethers.formatEther(bBal)).toFixed(2),
        seller: Number(ethers.formatEther(sBal)).toFixed(2),
        arbiter: Number(ethers.formatEther(aBal)).toFixed(2)
      });
    } catch (e) { console.log("Bağlantı hatası"); }
  };

  useEffect(() => { fetchState(); }, [contractAddress]);

  const resetSystem = async () => {
    addLog("SİSTEM", "Sıfırlama başlatıldı, yeni kontrat derleniyor...");
    setEvidenceFile(null); setEvidencePreview(""); setIpfsHash(""); setTxHistory([]);
    try {
      const res = await fetch("http://localhost:3000/api/reset", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setContractAddress(data.newAddress);
        addLog("SİSTEM", "Yeni kontrat ağa yüklendi.", data.newAddress);
      }
    } catch (e) { addLog("HATA", "Oracle API'ye ulaşılamadı."); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setEvidenceFile(file);
      setEvidencePreview(URL.createObjectURL(file));
      simulateIpfsUpload(file.name);
    }
  };

  const simulateIpfsUpload = (fileName) => {
    setUploading(true);
    addLog("SİSTEM", "Kanıt IPFS'e şifreleniyor...");
    setTimeout(() => {
      const mockHash = "ipfs://Qm" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      setIpfsHash(mockHash);
      setUploading(false);
      addLog("BAŞARILI", "Kanıt IPFS ağına yüklendi.", mockHash);
    }, 2500); 
  };

  // --- ALICI FONKSİYONLARI ---
  const deposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0) {
      addLog("HATA", "Geçersiz ETH tutarı."); return;
    }
    addLog("ALICI", `${depositAmount} ETH kilitleniyor...`);
    try {
      const tx = await getContracts().buyer.deposit({ value: ethers.parseEther(depositAmount.toString()) });
      await tx.wait(); 
      addLog("BAŞARILI", "Ödeme kontrata kilitlendi.", tx.hash); 
      fetchState();
    } catch (e) { addLog("HATA", "Ödeme başarısız."); }
  };

  const approve = async () => {
    addLog("ALICI", "Teslimat onaylanıyor...");
    const tx = await getContracts().buyer.approveDelivery();
    await tx.wait(); addLog("BAŞARILI", "Onaylandı, fonlar satıcıya geçti.", tx.hash); fetchState();
  };

  const dispute = async () => {
    if (!ipfsHash) {
      addLog("HATA", "İtiraz için kanıt yüklenmeli!"); return;
    }
    addLog("ALICI", "İtiraz süreci başlatılıyor...");
    try {
      const tx = await getContracts().buyer.raiseDispute(ipfsHash);
      await tx.wait(); 
      addLog("BAŞARILI", "İtiraz kontrata işlendi.", tx.hash); 
      fetchState();
    } catch (e) { addLog("HATA", "İtiraz başarısız."); }
  };

  const refund = async () => {
    addLog("ALICI", "14 günlük iade talep ediliyor...");
    try {
      const tx = await getContracts().buyer.refund();
      await tx.wait(); addLog("BAŞARILI", "Fonlar iade alındı.", tx.hash); fetchState();
    } catch (e) { addLog("HATA", "Henüz 14 gün geçmedi veya kargo yolda."); }
  };

  // --- SATICI & HAKEM & ORACLE ---
  const autoRelease = async () => {
    addLog("SATICI", "Otomatik çekim deneniyor...");
    try {
      const tx = await getContracts().seller.autoRelease();
      await tx.wait(); addLog("BAŞARILI", "Zımni onay ile fonlar çekildi.", tx.hash); fetchState();
    } catch (e) { addLog("HATA", "Henüz 5 gün dolmadı veya itiraz var."); }
  };

  const resolve = async (refundBuyer) => {
    addLog("HAKEM", "Karar işleniyor...");
    const tx = await getContracts().arbiter.resolveDispute(refundBuyer);
    await tx.wait(); 
    addLog("BAŞARILI", refundBuyer ? "Alıcı haklı bulundu, iade yapıldı." : "Satıcı haklı bulundu, ödeme aktarıldı.", tx.hash); 
    fetchState();
  };

  const triggerDelivery = async () => {
    await fetch("http://localhost:3000/api/deliver", { method: "POST" });
    addLog("ORACLE", "Kargo teslim edildi sinyali gönderildi."); fetchState();
  };

  const fastForward = async (days) => {
    await fetch("http://localhost:3000/api/fast-forward", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days })
    });
    addLog("ORACLE", `Blokzincir zamanı ${days} gün ileri sarıldı.`); fetchState();
  };

  // Dinamik İlerleme Durumu Hesaplama
  const getStep = () => {
    if (state.isCompleted) return 4;
    if (state.isDisputed) return 3;
    if (state.isDelivered) return 3;
    if (Number(state.amount) > 0) return 2;
    return 1;
  };
  const step = getStep();

  return (
    <div className="dashboard-container">
      <div className="header-row">
        <div className="brand">
          <span className="logo">🛡️</span>
          <h2>B2B Web3 Escrow Dashboard</h2>
        </div>
        <button onClick={resetSystem} className="btn-reset">🔄 Sistemi Sıfırla (Yeni Test)</button>
      </div>

      {/* İLERLEME ÇUBUĞU (STEPPER) */}
      <div className="stepper-card">
        <div className={`step ${step >= 1 ? 'active' : ''}`}>1. Sipariş & Ödeme</div>
        <div className={`step-line ${step >= 2 ? 'active' : ''}`}></div>
        <div className={`step ${step >= 2 ? 'active' : ''}`}>2. Kargoda</div>
        <div className={`step-line ${step >= 3 ? 'active' : ''}`}></div>
        <div className={`step ${step >= 3 ? (state.isDisputed ? 'disputed' : 'active') : ''}`}>
          3. {state.isDisputed ? "⚠️ İtiraz (Dispute)" : "Onay Bekliyor"}
        </div>
        <div className={`step-line ${step >= 4 ? 'active' : ''}`}></div>
        <div className={`step ${step >= 4 ? 'active' : ''}`}>4. Tamamlandı</div>
      </div>

      <div className="main-grid">
        {/* SOL PANEL: KONTROLLER */}
        <div className="controls-section">
          
          <div className="status-banner">
            <div className="stat-box"><span>Kilitli Fon</span> <strong>{state.amount} ETH</strong></div>
            <div className="stat-box"><span>Teslimat Durumu</span> <strong>{state.isDelivered ? "✅ Teslim Edildi" : "⏳ Bekliyor"}</strong></div>
            <div className="stat-box"><span>Nihai Durum</span> <strong>{state.isCompleted ? "✅ Kapandı" : "Sürüyor"}</strong></div>
          </div>

          <div className="tabs">
            <button onClick={() => setActiveTab('buyer')} className={activeTab === 'buyer' ? 'tab active buyer' : 'tab'}>🛒 Alıcı Paneli</button>
            <button onClick={() => setActiveTab('seller')} className={activeTab === 'seller' ? 'tab active seller' : 'tab'}>🏪 Satıcı Paneli</button>
            <button onClick={() => setActiveTab('arbiter')} className={activeTab === 'arbiter' ? 'tab active arbiter' : 'tab'}>⚖️ Hakem Paneli</button>
            <button onClick={() => setActiveTab('oracle')} className={activeTab === 'oracle' ? 'tab active oracle' : 'tab'}>⏱️ Oracle API</button>
          </div>

          <div className="panel-content">
            {activeTab === 'buyer' && (
              <div className="panel buyer-panel">
                <h3>Alıcı Kontrolleri</h3>
                <div className="action-row">
                  <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} disabled={!contractAddress || state.amount > 0 || state.isCompleted} className="eth-input" min="0.1" step="0.1" />
                  <span className="eth-label">ETH</span>
                  <button onClick={deposit} disabled={!contractAddress || state.amount > 0 || state.isCompleted} className="btn btn-primary">Ödemeyi Kilitle</button>
                  <button onClick={approve} disabled={!contractAddress || !state.isDelivered || state.isDisputed || state.isCompleted} className="btn btn-success">Ürünü Onayla</button>
                  {/* DÜZELTİLDİ: 14 Gün İptali butonu */}
                  <button onClick={refund} disabled={!contractAddress || state.isDelivered || Number(state.amount) === 0 || state.isCompleted} className="btn btn-outline">⏱️ 14 Gün İptali</button>
                </div>

                {state.isDelivered && !state.isCompleted && (
                  <div className="dispute-box">
                    <h4>🚨 Hasarlı Ürün İtirazı</h4>
                    <div className="file-upload">
                      <input type="file" accept="image/*" onChange={handleFileChange} disabled={state.isDisputed} />
                      {uploading && <span className="spinner">⏳ IPFS'e Yükleniyor...</span>}
                    </div>
                    {evidencePreview && (
                      <div className="evidence-preview">
                        <img src={evidencePreview} alt="Kanıt" />
                        <div className="evidence-details">
                          <p className="success-text">✓ Kanıt IPFS ağına şifrelendi!</p>
                          <code>{ipfsHash || "Bekleniyor..."}</code>
                          <button onClick={dispute} disabled={!ipfsHash || state.isDisputed} className="btn btn-danger mt-10">
                            ⚠️ Kanıtla İtiraz Et (Dispute)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'seller' && (
              <div className="panel seller-panel">
                <h3>Satıcı Kontrolleri</h3>
                <p>Kargo tesliminden sonra alıcı 5 gün sessiz kalırsa, parayı çekebilirsiniz.</p>
                <button onClick={autoRelease} disabled={!contractAddress || !state.isDelivered || state.isDisputed || state.isCompleted} className="btn btn-success">
                  ⏱️ 5 Gün Doldu - Auto-Release
                </button>
              </div>
            )}

            {activeTab === 'arbiter' && (
              <div className="panel arbiter-panel">
                <h3>Hakem (Yönetici) Paneli</h3>
                {state.isDisputed && (
                  <div className="arbiter-evidence">
                    <h4>🔍 Alıcının Kanıt Fotoğrafı:</h4>
                    <p><strong>IPFS:</strong> {state.disputeProof}</p>
                    {evidencePreview && <img src={evidencePreview} alt="Alıcı Kanıtı" />}
                  </div>
                )}
                <div className="action-row mt-10">
                  <button onClick={() => resolve(true)} disabled={!contractAddress || !state.isDisputed} className="btn btn-primary">⚖️ Alıcıyı Haklı Bul (İade)</button>
                  <button onClick={() => resolve(false)} disabled={!contractAddress || !state.isDisputed} className="btn btn-success">⚖️ Satıcıyı Haklı Bul (Aktar)</button>
                </div>
              </div>
            )}

            {activeTab === 'oracle' && (
              <div className="panel oracle-panel">
                <h3>Web2.5 Oracle & Zaman Makinesi</h3>
                <div className="action-row">
                  {/* DÜZELTİLDİ: Teslim Edildi Sinyali butonu */}
                  <button onClick={triggerDelivery} disabled={!contractAddress || Number(state.amount) === 0 || state.isDelivered} className="btn btn-dark">📦 "Teslim Edildi" Sinyali</button>
                  <button onClick={() => fastForward(5)} disabled={!contractAddress} className="btn btn-dark">⏩ 5 Gün İleri</button>
                  <button onClick={() => fastForward(14)} disabled={!contractAddress} className="btn btn-dark">⏩ 14 Gün İleri</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SAĞ PANEL: CÜZDANLAR VE TERMİNAL */}
        <div className="sidebar">
          <div className="wallets-card">
            <h3>💳 Cüzdan Bakiyeleri (ETH)</h3>
            <div className="wallet"><span className="w-icon">🛒</span> <div><small>Alıcı</small><strong>{balances.buyer}</strong></div></div>
            <div className="wallet"><span className="w-icon">🏪</span> <div><small>Satıcı</small><strong>{balances.seller}</strong></div></div>
            <div className="wallet"><span className="w-icon">⚖️</span> <div><small>Hakem</small><strong>{balances.arbiter}</strong></div></div>
          </div>

          <div className="terminal-card">
            <div className="term-header">
              <span className="dot red"></span><span className="dot yellow"></span><span className="dot green"></span>
              <span className="term-title">Canlı Blokzincir Kayıtları</span>
            </div>
            <div className="term-body">
              {txHistory.length === 0 ? <p className="text-gray" style={{fontSize: "12px", color: "#6b7280"}}>Bekleniyor...</p> : null}
              {txHistory.map((tx, i) => (
                <div key={i} className="term-log">
                  <span className="time">[{tx.time}]</span>
                  <span className={`badge ${tx.type.toLowerCase().replace('i̇', 'i')}`}>{tx.type}</span>
                  <span className="msg">{tx.msg}</span>
                  {tx.hash && <div className="hash">Tx: {tx.hash.substring(0,25)}...</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f2f5; font-family: 'Inter', -apple-system, sans-serif; color: #1f2937; }
        .dashboard-container { max-width: 1200px; margin: 0 auto; padding: 30px 20px; }
        
        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .brand { display: flex; align-items: center; gap: 10px; }
        .logo { font-size: 32px; }
        .brand h2 { font-size: 24px; font-weight: 700; color: #111827; margin: 0; }
        
        .btn-reset { background: #ef4444; color: white; padding: 10px 20px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.2); transition: 0.2s; }
        .btn-reset:hover { background: #dc2626; transform: translateY(-1px); }

        .stepper-card { background: white; padding: 25px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .step { padding: 8px 16px; border-radius: 20px; background: #f3f4f6; color: #6b7280; font-weight: 600; font-size: 14px; transition: 0.3s; }
        .step.active { background: #3b82f6; color: white; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3); }
        .step.disputed { background: #f59e0b; color: white; box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3); }
        .step-line { flex: 1; height: 3px; background: #e5e7eb; margin: 0 15px; transition: 0.3s; }
        .step-line.active { background: #3b82f6; }

        .main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }
        
        .status-banner { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .stat-box { background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; flex-direction: column; }
        .stat-box span { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 5px; }
        .stat-box strong { font-size: 18px; color: #111827; }

        .tabs { display: flex; gap: 10px; margin-bottom: 15px; }
        .tab { flex: 1; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; font-weight: 600; color: #4b5563; cursor: pointer; transition: 0.2s; }
        .tab.active.buyer { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
        .tab.active.seller { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
        .tab.active.arbiter { background: #f5f3ff; border-color: #ddd6fe; color: #6d28d9; }
        .tab.active.oracle { background: #fffbeb; border-color: #fde68a; color: #b45309; }

        .panel { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); min-height: 350px; }
        .panel h3 { margin-top: 0; margin-bottom: 20px; font-size: 18px; color: #1f2937; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px; }
        .action-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        
        .eth-input { padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; width: 100px; font-weight: bold; font-size: 16px; outline: none; }
        .eth-input:focus { border-color: #3b82f6; }
        .eth-label { font-weight: bold; color: #4b5563; margin-right: 10px; }

        .btn { padding: 10px 18px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
        .btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-success { background: #10b981; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-dark { background: #1f2937; color: white; }
        .btn-outline { background: white; border: 2px solid #e5e7eb; color: #4b5563; }
        .btn-outline:hover:not(:disabled) { border-color: #9ca3af; background: #f9fafb; }
        .mt-10 { margin-top: 10px; }

        .dispute-box { margin-top: 25px; padding: 20px; border: 2px dashed #fca5a5; background: #fef2f2; border-radius: 12px; }
        .dispute-box h4 { color: #dc2626; margin-top: 0; margin-bottom: 15px; }
        .file-upload { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; }
        .spinner { color: #d97706; font-weight: bold; font-size: 14px; }
        .evidence-preview { display: flex; gap: 15px; background: white; padding: 15px; border-radius: 8px; border: 1px solid #fecaca; }
        .evidence-preview img { width: 120px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
        .success-text { color: #059669; font-weight: 600; font-size: 13px; margin: 0 0 5px 0; }
        code { background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #4b5563; display: inline-block; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }

        .arbiter-evidence { background: #f5f3ff; padding: 15px; border-radius: 8px; border: 1px solid #ddd6fe; margin-bottom: 20px; }
        .arbiter-evidence h4 { margin-top: 0; margin-bottom: 10px; color: #6d28d9; }
        .arbiter-evidence p { margin: 0; font-size: 13px; font-family: monospace; }
        .arbiter-evidence img { max-width: 200px; border-radius: 6px; margin-top: 10px; border: 1px solid #c4b5fd; display: block; }

        .sidebar { display: flex; flex-direction: column; gap: 25px; }
        .wallets-card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .wallets-card h3 { margin-top: 0; font-size: 16px; margin-bottom: 15px; color: #374151; }
        .wallet { display: flex; align-items: center; gap: 12px; padding: 10px; background: #f9fafb; border-radius: 8px; margin-bottom: 10px; border: 1px solid #f3f4f6; }
        .w-icon { font-size: 24px; }
        .wallet small { display: block; color: #6b7280; font-size: 12px; font-weight: 600; }
        .wallet strong { font-size: 18px; color: #111827; }

        .terminal-card { background: #111827; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); flex: 1; min-height: 350px; display: flex; flex-direction: column; }
        .term-header { background: #1f2937; padding: 10px 15px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #374151; }
        .dot { width: 12px; height: 12px; border-radius: 50%; }
        .dot.red { background: #ef4444; } .dot.yellow { background: #f59e0b; } .dot.green { background: #10b981; }
        .term-title { color: #9ca3af; font-size: 12px; font-weight: 600; margin-left: 10px; letter-spacing: 0.5px; }
        .term-body { padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; flex: 1; max-height: 400px; }
        .term-body::-webkit-scrollbar { width: 6px; }
        .term-body::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        
        .term-log { font-family: 'Fira Code', 'Courier New', monospace; font-size: 12px; line-height: 1.4; border-bottom: 1px solid #1f2937; padding-bottom: 8px; }
        .time { color: #6b7280; margin-right: 8px; }
        .badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; margin-right: 8px; text-transform: uppercase; }
        .badge.si̇stem { background: #4b5563; color: white; }
        .badge.alici { background: #1d4ed8; color: white; }
        .badge.satici { background: #15803d; color: white; }
        .badge.hakem { background: #6d28d9; color: white; }
        .badge.oracle { background: #b45309; color: white; }
        .badge.başarili { background: #065f46; color: #34d399; }
        .badge.hata { background: #7f1d1d; color: #fca5a5; }
        .msg { color: #d1d5db; }
        .hash { color: #10b981; margin-top: 4px; padding-left: 60px; font-size: 11px; word-break: break-all; }
      `}</style>
    </div>
  );
}