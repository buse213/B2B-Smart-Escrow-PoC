import hre from "hardhat";
import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";

async function main() {
  // 1. Tarayıcı (Browser) yerine doğrudan arkada çalıştırdığımız yerel ağımıza bağlanıyoruz
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  
  // 2. Hardhat'in node ekranında bize verdiği standart Private Key'ler ile cüzdanlarımızı ayağa kaldırıyoruz
  const buyer = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  const seller = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);
  const arbiter = new Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", provider);

  console.log("Alıcı Adresi:", buyer.address);
  console.log("Satıcı Adresi:", seller.address);
  console.log("Hakem Adresi:", arbiter.address);

  console.log("\nKontrat ağa yükleniyor...");

  // 3. Arka planda derlenen kontratın saf verilerini (ABI ve Bytecode) alıyoruz
  const artifact = await hre.artifacts.readArtifact("Escrow");
  
  // 4. Kontratı hazırlayıp doğrudan canlı blokzincirimize fırlatıyoruz
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, buyer);
  const escrow = await factory.deploy(buyer.address, seller.address, arbiter.address);

  // İşlemin blokzincirde onaylanmasını (kazılmasını) bekliyoruz
  await escrow.waitForDeployment();
  const contractAddress = await escrow.getAddress();
  
  console.log("✅ Escrow Kontratı başarıyla şu adrese yüklendi:", contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});