// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Escrow {
    address public buyer;
    address payable public seller;
    address public arbiter; // Platform yöneticisi (Hakem)

    uint256 public amount;
    uint256 public deliveryTime;
    uint256 public depositTime; // Paranın yattığı zamanı takip etmek için
    
    bool public isDelivered = false;
    bool public isDisputed = false;
    bool public isCompleted = false;

    // YENİ: Alıcının yüklediği IPFS kanıt fotoğrafının adresini tutacak değişken
    string public disputeProof;

    // Kontratı ağa yüklerken alıcı, satıcı ve hakem cüzdan adresleri verilir
    constructor(address _buyer, address payable _seller, address _arbiter) {
        buyer = _buyer;
        seller = _seller;
        arbiter = _arbiter;
    }

    // 1. Aşama: Alıcı parayı kilitler
    function deposit() public payable {
        require(msg.sender == buyer, "Sadece alici odeme yapabilir");
        require(msg.value > 0, "Tutar 0'dan buyuk olmali");
        amount += msg.value;
        depositTime = block.timestamp; // Paranın kilitlendiği anı kaydet
    }

    // 2. Aşama: Kargo ulaştığında Oracle (Node.js API) tetikler
    function markAsDelivered() public {
        require(msg.sender == arbiter, "Sadece sistem teslim isareti verebilir");
        isDelivered = true;
        deliveryTime = block.timestamp; // Teslim saniyesini kaydeder
    }

    // 3. Aşama: Alıcı onaylar ve para satıcıya geçer
    function approveDelivery() public {
        require(msg.sender == buyer, "Sadece alici onaylayabilir");
        require(isDelivered, "Urun henuz teslim edilmedi");
        require(!isDisputed, "Itiraz sureci var");
        
        isCompleted = true;
        uint256 transferAmount = amount;
        amount = 0; // Güvenlik Düzeltmesi: Transferden önce bakiye sıfırlanır
        
        (bool success, ) = seller.call{value: transferAmount}("");
        require(success, "Transfer basarisiz");
    }

    // 4. Aşama: Alıcı 5 gün sessiz kalırsa (Zımni onay), para satıcıya geçer
    function autoRelease() public {
        require(isDelivered, "Urun teslim edilmedi");
        require(!isDisputed, "Itiraz sureci var");
        require(block.timestamp >= deliveryTime + 5 days, "5 gunluk sure dolmadi");
        
        isCompleted = true;
        uint256 transferAmount = amount;
        amount = 0; // Güvenlik Düzeltmesi
        
        (bool success, ) = seller.call{value: transferAmount}("");
        require(success, "Transfer basarisiz");
    }

    // 5. Aşama: Alıcı ürüne itiraz eder (Dispute) - IPFS DESTEĞİ EKLENDİ
    function raiseDispute(string memory _proofHash) public {
        require(msg.sender == buyer, "Sadece alici itiraz edebilir");
        require(block.timestamp <= deliveryTime + 5 days, "Itiraz suresi doldu");
        isDisputed = true;
        disputeProof = _proofHash; // IPFS kanıt adresini kontrata kalıcı olarak kaydet
    }

    // 6. Aşama: Hakem anlaşmazlığı çözer ve parayı ilgili kişiye atar
    function resolveDispute(bool _refundToBuyer) public {
        require(msg.sender == arbiter, "Sadece hakem karara baglayabilir");
        require(isDisputed, "Ortada itiraz yok");
        
        isCompleted = true;
        isDisputed = false;
        
        uint256 transferAmount = amount;
        amount = 0; // Güvenlik Düzeltmesi

        if (_refundToBuyer) {
            (bool success, ) = payable(buyer).call{value: transferAmount}("");
            require(success, "Iade basarisiz");
        } else {
            (bool success, ) = seller.call{value: transferAmount}("");
            require(success, "Transfer basarisiz");
        }
    }

    // 7. Aşama: Satıcı ürünü göndermezse Alıcı 14 gün sonra parasını geri çeker
    function refund() public {
        require(msg.sender == buyer, "Sadece alici iade talep edebilir");
        require(!isDelivered, "Kargo yola cikmis, iade edilemez");
        require(amount > 0, "Iade edilecek bakiye yok");
        require(block.timestamp >= depositTime + 14 days, "Henuz 14 gun gecmedi");

        isCompleted = true;
        uint256 refundAmount = amount;
        amount = 0;

        (bool success, ) = payable(buyer).call{value: refundAmount}("");
        require(success, "Iade basarisiz");
    }
}