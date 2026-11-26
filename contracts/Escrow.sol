// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Escrow {
    address public buyer;
    address payable public seller;
    address public arbiter; // Hakem: anlaşmazlıkta karar verir
    address public oracle;  // Web2.5 Oracle (Node.js): teslimat bilgisini iletir

    uint256 public amount;
    uint256 public deliveryTime;
    uint256 public depositTime;

    bool public isDelivered;
    bool public isDisputed;
    bool public isCompleted;

    // Alıcının yüklediği IPFS kanıtının içerik özeti (CID)
    string public disputeProof;

    // Sözleşmesel süreler (yasal zorunluluk değil, taraflarca belirlenen parametreler)
    uint256 public constant DELIVERY_PERIOD = 14 days;
    uint256 public constant REVIEW_PERIOD = 5 days;

    // Şeffaf izleme için olaylar
    event Deposited(address indexed buyer, uint256 amount);
    event Delivered(uint256 deliveryTime);
    event DisputeRaised(address indexed buyer, string proofCid);
    event DisputeResolved(bool refundToBuyer, uint256 amount);
    event FundsReleased(address indexed to, uint256 amount, string reason);

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Sadece alici");
        _;
    }

    modifier notCompleted() {
        require(!isCompleted, "Islem tamamlandi");
        _;
    }

    constructor(address _buyer, address payable _seller, address _arbiter, address _oracle) {
        require(
            _buyer != address(0) && _seller != address(0) && _arbiter != address(0) && _oracle != address(0),
            "Gecersiz adres"
        );
        buyer = _buyer;
        seller = _seller;
        arbiter = _arbiter;
        oracle = _oracle;
    }

    // 1. Alıcı parayı kilitler (tek seferlik)
    function deposit() public payable onlyBuyer notCompleted {
        require(msg.value > 0, "Tutar 0'dan buyuk olmali");
        require(amount == 0, "Odeme zaten kilitli");
        require(!isDelivered, "Urun zaten teslim edildi");
        amount = msg.value;
        depositTime = block.timestamp;
        emit Deposited(msg.sender, msg.value);
    }

    // 2. Kargo ulaştığında Oracle tetikler (yalnızca bir kez)
    function markAsDelivered() public notCompleted {
        require(msg.sender == oracle, "Sadece Oracle teslim isareti verebilir");
        require(amount > 0, "Kilitli odeme yok");
        require(!isDelivered, "Teslimat zaten isaretlendi");
        isDelivered = true;
        deliveryTime = block.timestamp;
        emit Delivered(block.timestamp);
    }

    // 3. Alıcı onaylar, para satıcıya geçer
    function approveDelivery() public onlyBuyer notCompleted {
        require(isDelivered, "Urun henuz teslim edilmedi");
        require(!isDisputed, "Itiraz sureci var");
        _payout(seller, "Alici onayi");
    }

    // 4. Alıcı 5 gün sessiz kalırsa (zımni onay) para satıcıya geçer
    function autoRelease() public notCompleted {
        require(isDelivered, "Urun teslim edilmedi");
        require(!isDisputed, "Itiraz sureci var");
        require(block.timestamp >= deliveryTime + REVIEW_PERIOD, "5 gunluk sure dolmadi");
        _payout(seller, "Zimni onay");
    }

    // 5. Alıcı IPFS kanıtıyla itiraz eder
    function raiseDispute(string memory _proofHash) public onlyBuyer notCompleted {
        require(isDelivered, "Urun teslim edilmedi");
        require(!isDisputed, "Zaten itiraz edildi");
        require(bytes(_proofHash).length > 0, "Kanit CID bos olamaz");
        require(block.timestamp <= deliveryTime + REVIEW_PERIOD, "Itiraz suresi doldu");
        isDisputed = true;
        disputeProof = _proofHash;
        emit DisputeRaised(msg.sender, _proofHash);
    }

    // 6. Hakem anlaşmazlığı çözer
    function resolveDispute(bool _refundToBuyer) public notCompleted {
        require(msg.sender == arbiter, "Sadece hakem karara baglayabilir");
        require(isDisputed, "Ortada itiraz yok");
        isDisputed = false;
        emit DisputeResolved(_refundToBuyer, amount);
        if (_refundToBuyer) {
            _payout(payable(buyer), "Hakem karari: iade");
        } else {
            _payout(seller, "Hakem karari: aktarim");
        }
    }

    // 7. 14 gün içinde teslimat olmazsa alıcı parasını geri çeker
    function refund() public onlyBuyer notCompleted {
        require(!isDelivered, "Kargo teslim edildi, iade edilemez");
        require(amount > 0, "Iade edilecek bakiye yok");
        require(block.timestamp >= depositTime + DELIVERY_PERIOD, "Henuz 14 gun gecmedi");
        _payout(payable(buyer), "14 gun teslimatsizlik iadesi");
    }

    // Ortak ödeme: önce durum güncellenir, sonra transfer yapılır (reentrancy koruması)
    function _payout(address payable to, string memory reason) private {
        isCompleted = true;
        uint256 value = amount;
        amount = 0;
        (bool success, ) = to.call{value: value}("");
        require(success, "Transfer basarisiz");
        emit FundsReleased(to, value, reason);
    }
}
