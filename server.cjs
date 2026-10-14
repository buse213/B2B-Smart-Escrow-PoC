const express = require("express");
const cors = require("cors");
const { JsonRpcProvider, Wallet, Contract, ContractFactory } = require("ethers");
const EscrowArtifact = require("./artifacts/contracts/Escrow.sol/Escrow.json");

const app = express();
app.use(cors());
app.use(express.json());

const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const ARBITER_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const arbiterWallet = new Wallet(ARBITER_PRIVATE_KEY, provider);

// Artık const değil let kullanıyoruz ki her reset attığımızda adresi güncelleyebilelim
let CONTRACT_ADDRESS = "";
let escrowContract = null;

app.post("/api/deliver", async (req, res) => {
    try {
        const tx = await escrowContract.markAsDelivered();
        await tx.wait();
        res.json({ success: true, txHash: tx.hash });
    } catch (error) { res.status(500).json({ success: false, error: error.shortMessage }); }
});

app.post("/api/fast-forward", async (req, res) => {
    try {
        const days = req.body.days || 5;
        await provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
        await provider.send("evm_mine", []);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- İŞTE YENİ SİHRİMİZ: SİSTEMİ SIFIRLAMA UÇ NOKTASI ---
app.post("/api/reset", async (req, res) => {
    try {
        console.log("Sistem sıfırlanıyor, yeni kontrat yükleniyor...");
        const factory = new ContractFactory(EscrowArtifact.abi, EscrowArtifact.bytecode, arbiterWallet);
        
        // Hardhat'in standart test cüzdan adresleri
        const buyerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        const sellerAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        
        // Ağa yepyeni bir kontrat fırlatıyoruz
        const newEscrow = await factory.deploy(buyerAddress, sellerAddress, arbiterWallet.address);
        await newEscrow.waitForDeployment();
        
        CONTRACT_ADDRESS = await newEscrow.getAddress();
        escrowContract = new Contract(CONTRACT_ADDRESS, EscrowArtifact.abi, arbiterWallet);
        
        console.log("✅ Yeni kontrat yüklendi:", CONTRACT_ADDRESS);
        res.json({ success: true, newAddress: CONTRACT_ADDRESS });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Oracle API Sunucusu http://localhost:${PORT} adresinde calisiyor`));