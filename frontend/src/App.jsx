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
  "function disputeProof() view returns (string)", // YENİ: Kontrattaki kanıtı okuma fonksiyonu
  "function deposit() payable",
  "function approveDelivery()",
  "function raiseDispute(string _proofHash)", // GÜNCEL: IPFS hash parametresi eklendi
  "function resolveDispute(bool _refundToBuyer)",
  "function autoRelease()",
  "function refund()"
];

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

export default function App() {
  const [contractAddress, setContractAddress] = useState(""); 
  const [activeTab, setActiveTab] = useState('buyer');
  const [state, setState] = useState({ amount: "0", isDelivered: false, isDisputed: false, isCompleted: false, disputeProof: "" });
  const [log, setLog] = useState("Sistem başlatıldı. Lütfen 'Sistemi Sıfırla' butonuna basarak yeni bir test başlatın.");
  
  const [depositAmount, setDepositAmount] = useState("100"); 

  // YENİ: IPFS / Fotoğraf Kanıtı State'leri
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidencePreview, setEvidencePreview] = useState("");
  const [ipfsHash, setIpfsHash] = useState("");
  const [uploading, setUploading] = useState(false);

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
        disputeProof: await contracts.buyer.disputeProof() // YENİ: Kontrattaki kanıtı çekiyoruz
      });
    } catch (e) { setLog("Bağlantı hatası veya kontrat henüz yüklenmedi."); }
  };

  useEffect(() => { fetchState(); }, [contractAddress]);

  const resetSystem = async () => {
    setLog("⏳ Sistem sıfırlanıyor, arka planda yeni kontrat ağa yükleniyor...");
    setEvidenceFile(null);
    setEvidencePreview("");
    setIpfsHash("");
    try {
      const res = await fetch("http://localhost:3000/api/reset", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setContractAddress(data.newAddress);
        setLog("✅ Sistem başarıyla sıfırlandı! Yeni ve temiz bir teste başlayabilirsiniz.");
      }
    } catch (e) {
      setLog("❌ Hata: Oracle API'ye ulaşılamadı.");
    }
  };

  // YENİ: Kanıt Fotoğrafı Seçme & IPFS Simülasyonu
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
    setLog("⏳ Kanıt fotoğrafı şifreleniyor ve IPFS (merkeziyetsiz) ağına yükleniyor...");
    setTimeout(() => {
      const mockHash = "ipfs://Qm" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      setIpfsHash(mockHash);
      setUploading(false);
      setLog(`📦 IPFS Yüklemesi Başarılı! Kanıt Adresi: ${mockHash}`);
    }, 2500); 
  };

  // --- ALICI (BUYER) FONKSİYONLARI ---
  const deposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0) {
      setLog("❌ Hata: Lütfen geçerli bir ETH tutarı giriniz.");
      return;
    }
    setLog(`Alıcı: ${depositAmount} ETH ödeme yapılıyor...`);
    try {
      const tx = await getContracts().buyer.deposit({ value: ethers.parseEther(depositAmount.toString()) });
      await tx.wait(); 
      setLog(`✅ Alıcı: ${depositAmount} ETH emanete kilitlendi.`); 
      fetchState();
    } catch (e) {
      setLog("❌ Hata: Ödeme işlemi başarısız.");
    }
  };

  const approve = async () => {
    setLog("Alıcı: Ürün onaylanıyor...");
    const tx = await getContracts().buyer.approveDelivery();
    await tx.wait(); setLog("🤝 Alıcı: Ürün onaylandı, para satıcıya geçti."); fetchState();
  };

  // GÜNCEL: İtiraz fonksiyonu artık IPFS Hash ile çalışıyor
  const dispute = async () => {
    if (!ipfsHash) {
      setLog("❌ Hata: İtiraz için lütfen bir kanıt fotoğrafı yükleyin!");
      return;
    }
    setLog("Alıcı: İtiraz süreci başlatılıyor...");
    try {
      const tx = await getContracts().buyer.raiseDispute(ipfsHash);
      await tx.wait(); 
      setLog(`⚠️ Alıcı: Ürüne resmi olarak itiraz edildi! Kanıt Hash: ${ipfsHash}`); 
      fetchState();
    } catch (e) { setLog("❌ Hata: İtiraz işlemi başlatılamadı."); }
  };

  const refund = async () => {
    setLog("Alıcı: 14 günlük süre doldu, iade talep ediliyor...");
    try {
      const tx = await getContracts().buyer.refund();
      await tx.wait(); setLog("💸 Alıcı: İşlem başarılı! Satıcı kargoyu vermediği için fonlar iade alındı."); fetchState();
    } catch (e) { 
      setLog("❌ Alıcı Hata: Henüz 14 gün geçmedi veya kargo yola çıkmış!"); 
    }
  };

  // --- SATICI & HAKEM & ORACLE ---
  const autoRelease = async () => {
    setLog("Satıcı: 5 günlük süre doldu, otomatik çekim deneniyor...");
    try {
      const tx = await getContracts().seller.autoRelease();
      await tx.wait(); setLog("💸 Satıcı: Zımni onay devreye girdi, fonlar satıcıya aktarıldı!"); fetchState();
    } catch (e) { setLog("❌ Satıcı Hata: Henüz 5 gün geçmedi veya itiraz var!"); }
  };
  const resolve = async (refundBuyer) => {
    setLog("Hakem: Karar veriliyor...");
    const tx = await getContracts().arbiter.resolveDispute(refundBuyer);
    await tx.wait(); 
    setLog(refundBuyer ? "⚖️ Hakem Kararı: Alıcı haklı, para iade edildi." : "⚖️ Hakem Kararı: Satıcı haklı, para satıcıya aktarıldı."); 
    fetchState();
  };
  const triggerDelivery = async () => {
    setLog("Sistem: Kargo teslim edildi sinyali gönderiliyor...");
    await fetch("http://localhost:3000/api/deliver", { method: "POST" });
    setLog("📦 Sistem: Kargo teslim edildi. 5 günlük sayaç başladı!"); fetchState();
  };
  const fastForward = async (days) => {
    setLog(`Sistem: Blokzincir zamanı ${days} gün ileri sarılıyor...`);
    await fetch("http://localhost:3000/api/fast-forward", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days })
    });
    setLog(`⏱️ Sistem: Zaman başarıyla ${days} gün ileri alındı!`); fetchState();
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif", background: "#f8f9fa", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", background: "white", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #eee", paddingBottom: "10px" }}>
            <h2 style={{ color: "#333", margin: 0 }}>🛡️ B2B Akıllı Escrow Paneli</h2>
            <button onClick={resetSystem} style={{ background: "#dc3545", color: "white", border: "none", padding: "10px 15px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
                🔄 Sistemi Sıfırla (Yeni Test)
            </button>
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between", background: "#212529", color: "white", padding: "15px", borderRadius: "8px", margin: "20px 0" }}>
          <div><strong>Kilitli Fon:</strong> {state.amount} ETH</div>
          <div><strong>Teslimat:</strong> {state.isDelivered ? "✅ Teslim Edildi" : "⏳ Bekliyor"}</div>
          <div><strong>İtiraz (Dispute):</strong> {state.isDisputed ? "⚠️ Aktif (Fotoğraf Kanıtlı)" : "Yok"}</div>
          <div><strong>Nihai Durum:</strong> {state.isCompleted ? "✅ Tamamlandı" : "Sürüyor"}</div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab('buyer')} style={tabStyle(activeTab === 'buyer', '#0d6efd')}>🛒 Alıcı Paneli</button>
          <button onClick={() => setActiveTab('seller')} style={tabStyle(activeTab === 'seller', '#198754')}>🏪 Satıcı Paneli</button>
          <button onClick={() => setActiveTab('arbiter')} style={tabStyle(activeTab === 'arbiter', '#6f42c1')}>⚖️ Hakem Paneli</button>
          <button onClick={() => setActiveTab('oracle')} style={tabStyle(activeTab === 'oracle', '#fd7e14')}>⏱️ Oracle (Sistem)</button>
        </div>

        {activeTab === 'buyer' && (
          <div style={panelStyle('#e9f2ff', '#0d6efd')}>
            <h3>Alıcı Kontrolleri</h3>
            <p>Siparişi verin ve ödemeyi kontrata kilitleyin. Ürün geldiğinde onaylayın veya sorun varsa itiraz edin.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: "20px" }}>
              
              <input 
                type="number" 
                value={depositAmount} 
                onChange={(e) => setDepositAmount(e.target.value)} 
                disabled={!contractAddress || state.amount > 0 || state.isCompleted}
                style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ccc", width: "90px", fontWeight: "bold" }}
                min="0.1" step="0.1"
              />
              <span style={{ fontWeight: "bold", color: "#333", marginRight: "10px" }}>ETH</span>

              <button onClick={deposit} disabled={!contractAddress || state.amount > 0 || state.isCompleted} className="btn-blue">Ödemeyi Kilitle</button>
              <button onClick={approve} disabled={!contractAddress || !state.isDelivered || state.isDisputed || state.isCompleted} className="btn-green">Ürünü Onayla</button>
              <button onClick={refund} disabled={!contractAddress || state.isDelivered || state.amount === "0" || state.isCompleted} className="btn-dark" style={{ background: "#6c757d" }}>
                ⏱️ 14 Gün İptali
              </button>
            </div>

            {/* YENİ: İtiraz & IPFS Kanıt Fotoğrafı Yükleme Bölümü */}
            {state.isDelivered && !state.isCompleted && (
              <div style={{ background: "#fff", border: "1px dashed #dc3545", padding: "15px", borderRadius: "8px", marginTop: "15px" }}>
                <h4 style={{ color: "#dc3545", margin: "0 0 10px 0" }}>🚨 Hasarlı/Yanlış Ürün İtirazı (IPFS Kanıt Yükleme)</h4>
                <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    disabled={state.isDisputed}
                    style={{ fontSize: "14px" }}
                  />
                  {uploading && <span style={{ color: "#fd7e14", fontWeight: "bold" }}>⏳ IPFS'e Yükleniyor...</span>}
                </div>
                
                {evidencePreview && (
                  <div style={{ display: "flex", gap: "15px", marginTop: "15px", alignItems: "flex-start" }}>
                    <img src={evidencePreview} alt="Kanıt" style={{ width: "120px", height: "90px", objectFit: "cover", borderRadius: "6px", border: "1px solid #ddd" }} />
                    <div>
                      <p style={{ margin: "0 0 5px 0", fontSize: "14px", fontWeight: "bold", color: "#28a745" }}>✓ Kanıt IPFS ağına şifrelendi!</p>
                      <code style={{ fontSize: "12px", background: "#f1f1f1", padding: "4px 8px", borderRadius: "4px", display: "inline-block", maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ipfsHash || "Bekleniyor..."}
                      </code>
                      <div style={{ marginTop: "10px" }}>
                        <button onClick={dispute} disabled={!ipfsHash || state.isDisputed} className="btn-red" style={{ padding: "8px 12px", fontSize: "13px" }}>
                          ⚠️ Kanıtla İtiraz Et (Dispute)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'seller' && (
          <div style={panelStyle('#eafaf1', '#198754')}>
            <h3>Satıcı Kontrolleri</h3>
            <p>Kargo teslim edildikten sonra alıcı 5 gün sessiz kalırsa, "Zımni Onay" ile paranızı çekebilirsiniz.</p>
            <button onClick={autoRelease} disabled={!contractAddress || !state.isDelivered || state.isDisputed || state.isCompleted} className="btn-green">
              ⏱️ 5 Gün Doldu - Fonları Zorla Çek (Auto-Release)
            </button>
          </div>
        )}

        {activeTab === 'arbiter' && (
          <div style={panelStyle('#f4effa', '#6f42c1')}>
            <h3>Hakem (Platform Yöneticisi) Kontrolleri</h3>
            <p>Alıcı bir itiraz (dispute) oluşturduğunda hakem devreye girer ve kilitli fonun kime gideceğine karar verir.</p>
            
            {/* YENİ: Hakeme Alıcının Kontrattaki IPFS Kanıtını Gösteriyoruz */}
            {state.isDisputed && (
              <div style={{ background: "#fff", border: "1px solid #6f42c1", padding: "15px", borderRadius: "8px", marginBottom: "20px" }}>
                <h4 style={{ color: "#6f42c1", margin: "0 0 5px 0" }}>🔍 Alıcının Sunduğu Kanıt Fotoğrafı:</h4>
                <p style={{ margin: "0 0 10px 0", fontSize: "12px", fontFamily: "monospace" }}><strong>IPFS Hash:</strong> {state.disputeProof}</p>
                {evidencePreview ? (
                  <img src={evidencePreview} alt="Alıcı Kanıtı" style={{ maxWidth: "250px", maxHeight: "180px", borderRadius: "6px", display: "block", marginBottom: "15px", border: "1px solid #ddd" }} />
                ) : (
                  <p style={{ fontStyle: "italic", color: "#666" }}>Kanıt fotoğrafı yüklenmiş (Hash kontratta mevcut).</p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => resolve(true)} disabled={!contractAddress || !state.isDisputed} className="btn-blue">⚖️ Alıcıyı Haklı Bul (İade Et)</button>
              <button onClick={() => resolve(false)} disabled={!contractAddress || !state.isDisputed} className="btn-green">⚖️ Satıcıyı Haklı Bul (Parayı Aktar)</button>
            </div>
          </div>
        )}

        {activeTab === 'oracle' && (
          <div style={panelStyle('#fff3cd', '#fd7e14')}>
            <h3>Web2.5 Oracle & Zaman Makinesi</h3>
            <p>Dış dünyadan (Kargo firmasından) gelen verileri ve Makale Testleri için zaman atlama işlevlerini yönetin.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={triggerDelivery} disabled={!contractAddress || state.amount === "0" || state.isDelivered} className="btn-dark">📦 Kargo "Teslim Edildi" Sinyali Yolla</button>
              <button onClick={() => fastForward(5)} disabled={!contractAddress} className="btn-dark">⏩ Zamanı 5 Gün İleri Sar</button>
              <button onClick={() => fastForward(14)} disabled={!contractAddress} className="btn-dark">⏩ Zamanı 14 Gün İleri Sar</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: "30px", padding: "15px", background: "#f8f9fa", borderLeft: "4px solid #6c757d", fontFamily: "monospace", fontSize: "14px" }}>
          <strong>Son İşlem:</strong> {log}
        </div>

      </div>

      <style>{`
        button { padding: 10px 15px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-blue { background: #0d6efd; color: white; } .btn-blue:hover:not(:disabled) { background: #0b5ed7; }
        .btn-green { background: #198754; color: white; } .btn-green:hover:not(:disabled) { background: #157347; }
        .btn-red { background: #dc3545; color: white; } .btn-red:hover:not(:disabled) { background: #bb2d3b; }
        .btn-dark { background: #343a40; color: white; } .btn-dark:hover:not(:disabled) { background: #212529; }
      `}</style>
    </div>
  );
}

const tabStyle = (isActive, color) => ({
  flex: 1, padding: "12px", background: isActive ? color : "#e9ecef", color: isActive ? "white" : "#495057",
  border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", transition: "0.3s"
});
const panelStyle = (bg, border) => ({
  padding: "20px", background: bg, borderLeft: `5px solid ${border}`, borderRadius: "4px"
});