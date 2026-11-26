import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const ONE_ETH = ethers.parseEther("1");
const DAY = 24 * 60 * 60;

async function increaseDays(days: number) {
  await ethers.provider.send("evm_increaseTime", [days * DAY]);
  await ethers.provider.send("evm_mine", []);
}

async function setup() {
  const [buyer, seller, arbiter, oracle, stranger] = await ethers.getSigners();
  const escrow: any = await ethers.deployContract("Escrow", [
    buyer.address,
    seller.address,
    arbiter.address,
    oracle.address,
  ]);
  return { escrow, buyer, seller, arbiter, oracle, stranger };
}

async function deliveredSetup() {
  const ctx = await setup();
  await ctx.escrow.connect(ctx.buyer).deposit({ value: ONE_ETH });
  await ctx.escrow.connect(ctx.oracle).markAsDelivered();
  return ctx;
}

describe("Escrow", function () {
  describe("Senaryo 1: Fon kilitleme", function () {
    it("Alici odemeyi sozlesmeye kilitler", async function () {
      const { escrow, buyer } = await setup();
      await expect(escrow.connect(buyer).deposit({ value: ONE_ETH }))
        .to.emit(escrow, "Deposited")
        .withArgs(buyer.address, ONE_ETH);
      expect(await escrow.amount()).to.equal(ONE_ETH);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(ONE_ETH);
    });

    it("Alici disinda kimse odeme yapamaz, ikinci odeme reddedilir", async function () {
      const { escrow, buyer, stranger } = await setup();
      await expect(escrow.connect(stranger).deposit({ value: ONE_ETH })).to.be.revertedWith("Sadece alici");
      await escrow.connect(buyer).deposit({ value: ONE_ETH });
      await expect(escrow.connect(buyer).deposit({ value: ONE_ETH })).to.be.revertedWith("Odeme zaten kilitli");
    });
  });

  describe("Senaryo 2: Oracle aracili teslimat onayi", function () {
    it("Yalnizca Oracle teslimati isaretler ve sadece bir kez", async function () {
      const { escrow, buyer, arbiter, oracle } = await setup();
      await expect(escrow.connect(oracle).markAsDelivered()).to.be.revertedWith("Kilitli odeme yok");
      await escrow.connect(buyer).deposit({ value: ONE_ETH });
      await expect(escrow.connect(arbiter).markAsDelivered()).to.be.revertedWith(
        "Sadece Oracle teslim isareti verebilir",
      );
      await expect(escrow.connect(oracle).markAsDelivered()).to.emit(escrow, "Delivered");
      expect(await escrow.isDelivered()).to.equal(true);
      await expect(escrow.connect(oracle).markAsDelivered()).to.be.revertedWith("Teslimat zaten isaretlendi");
    });
  });

  describe("Senaryo 3: Alici onayi ile fon aktarimi", function () {
    it("Onay sonrasi fonlar saticiya gecer", async function () {
      const { escrow, buyer, seller } = await deliveredSetup();
      const before = await ethers.provider.getBalance(seller.address);
      await escrow.connect(buyer).approveDelivery();
      expect(await ethers.provider.getBalance(seller.address)).to.equal(before + ONE_ETH);
      expect(await escrow.isCompleted()).to.equal(true);
      expect(await escrow.amount()).to.equal(0n);
    });

    it("Tamamlanan isleme sonradan itiraz edilemez", async function () {
      const { escrow, buyer } = await deliveredSetup();
      await escrow.connect(buyer).approveDelivery();
      await expect(escrow.connect(buyer).raiseDispute("ipfs://QmTest")).to.be.revertedWith("Islem tamamlandi");
    });
  });

  describe("Senaryo 4: Anlasmazlik ve hakem mudahalesi", function () {
    it("Itirazda CID kaydedilir, hakem iade kararini uygular", async function () {
      const { escrow, buyer, arbiter } = await deliveredSetup();
      await expect(escrow.connect(buyer).raiseDispute("ipfs://QmKanit"))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(buyer.address, "ipfs://QmKanit");
      expect(await escrow.disputeProof()).to.equal("ipfs://QmKanit");
      await expect(escrow.connect(buyer).approveDelivery()).to.be.revertedWith("Itiraz sureci var");

      const before = await ethers.provider.getBalance(buyer.address);
      await escrow.connect(arbiter).resolveDispute(true);
      expect(await ethers.provider.getBalance(buyer.address)).to.equal(before + ONE_ETH);
      expect(await escrow.isCompleted()).to.equal(true);
    });

    it("Hakem saticiyi hakli bulursa fonlar saticiya gecer", async function () {
      const { escrow, buyer, seller, arbiter, stranger } = await deliveredSetup();
      await escrow.connect(buyer).raiseDispute("ipfs://QmKanit");
      await expect(escrow.connect(stranger).resolveDispute(false)).to.be.revertedWith(
        "Sadece hakem karara baglayabilir",
      );
      const before = await ethers.provider.getBalance(seller.address);
      await escrow.connect(arbiter).resolveDispute(false);
      expect(await ethers.provider.getBalance(seller.address)).to.equal(before + ONE_ETH);
    });
  });

  describe("Senaryo 5: Zaman asimi kurallari (5 ve 14 gun)", function () {
    it("5 gun dolunca zimni onayla fonlar saticiya gecer, itiraz kapanir", async function () {
      const { escrow, buyer, seller, stranger } = await deliveredSetup();
      await expect(escrow.connect(stranger).autoRelease()).to.be.revertedWith("5 gunluk sure dolmadi");
      await increaseDays(5);
      await expect(escrow.connect(buyer).raiseDispute("ipfs://QmGec")).to.be.revertedWith("Itiraz suresi doldu");
      const before = await ethers.provider.getBalance(seller.address);
      await escrow.connect(stranger).autoRelease();
      expect(await ethers.provider.getBalance(seller.address)).to.equal(before + ONE_ETH);
    });

    it("14 gun teslimat olmazsa alici iade alir", async function () {
      const { escrow, buyer } = await setup();
      await escrow.connect(buyer).deposit({ value: ONE_ETH });
      await expect(escrow.connect(buyer).refund()).to.be.revertedWith("Henuz 14 gun gecmedi");
      await increaseDays(14);
      const before = await ethers.provider.getBalance(buyer.address);
      const tx = await escrow.connect(buyer).refund();
      const receipt = await tx.wait();
      const after = await ethers.provider.getBalance(buyer.address);
      expect(after).to.equal(before + ONE_ETH - receipt.fee);
      expect(await escrow.isCompleted()).to.equal(true);
    });

    it("Teslimat yapildiysa 14 gun sonra bile iade alinamaz", async function () {
      const { escrow, buyer } = await deliveredSetup();
      await increaseDays(14);
      await expect(escrow.connect(buyer).refund()).to.be.revertedWith("Kargo teslim edildi, iade edilemez");
    });
  });
});
