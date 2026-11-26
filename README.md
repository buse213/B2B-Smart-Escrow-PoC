# B2B Web3 Escrow – Kavram Kanıtı (PoC)

Web2.5 Oracle ve IPFS tabanlı merkeziyetsiz emanet (escrow) prototipi.

## Katmanlar
- **Akıllı Sözleşme** (`contracts/Escrow.sol`): Fon kilitleme, 14 gün teslimatsızlık iadesi, teslimat sonrası 5 gün zımni onay, hakem kararı.
- **Web2.5 Oracle** (`server.cjs`): Node.js/Express; "Teslim Edildi" bilgisini ayrı Oracle cüzdanıyla imzalı işlem olarak iletir.
- **Kanıt (IPFS)**: İtiraz kanıtının CID'si zincire yazılır (prototipte yükleme simüledir).
- **dApp** (`frontend/`): React + Ethers.js.

## Roller (Hardhat test hesapları)
| Rol | Hesap |
| --- | --- |
| Alıcı | #0 |
| Satıcı | #1 |
| Hakem | #2 |
| Oracle | #3 |

## Çalıştırma
```bash
npm install
npx hardhat compile
npx hardhat test          # 5 temel senaryo testi
npx hardhat node          # ayrı terminalde
node server.cjs           # ayrı terminalde (Oracle API, port 3000)
cd frontend && npm install && npm run dev
```
Arayüzde önce **Sistemi Sıfırla** ile yeni kontrat yüklenir.

## Test Senaryoları (`test/Escrow.ts`)
1. Fon kilitleme
2. Oracle aracılı teslimat onayı
3. Alıcı onayı ile fon aktarımı
4. Anlaşmazlık ve hakem müdahalesi
5. 5 ve 14 günlük zaman aşımı kuralları

## Sınırlılıklar
Yerel test ağı, tek sunuculu Oracle, simüle IPFS, kodda açık test anahtarları (yalnızca Hardhat için).
