// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EscrowPayment {
    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        bool released;
        bool disputed;
    }

    mapping(uint256 => Escrow) public escrows;
    mapping(address => bool) public authorized;
    address public owner;
    address public orchestrator;
    bool private locked;

    event EscrowLocked(uint256 indexed jobId, address indexed payer, uint256 amount);
    event EscrowPayeeSet(uint256 indexed jobId, address indexed payee);
    event EscrowReleased(uint256 indexed jobId, address indexed payee, uint256 amount);
    event EscrowRefunded(uint256 indexed jobId, address indexed payer, uint256 amount);
    event AuthorizedUpdated(address indexed account, bool enabled);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorized[msg.sender], "not authorized");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "reentrant");
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        owner = msg.sender;
        orchestrator = msg.sender;
        authorized[msg.sender] = true;
    }

    function setOrchestrator(address _orchestrator) external onlyOwner {
        require(_orchestrator != address(0), "zero orchestrator");
        orchestrator = _orchestrator;
        authorized[_orchestrator] = true;
        emit AuthorizedUpdated(_orchestrator, true);
    }

    function setAuthorized(address account, bool enabled) external onlyOwner {
        require(account != address(0), "zero account");
        authorized[account] = enabled;
        emit AuthorizedUpdated(account, enabled);
    }

    function lockFunds(uint256 jobId, address payer, address payee) external payable onlyAuthorized {
        require(msg.value > 0, "no funds");
        require(escrows[jobId].amount == 0, "escrow exists");
        escrows[jobId] = Escrow(payer, payee, msg.value, false, false);
        emit EscrowLocked(jobId, payer, msg.value);
    }

    function setPayee(uint256 jobId, address payee) external onlyAuthorized {
        Escrow storage e = escrows[jobId];
        require(e.amount > 0, "missing escrow");
        require(!e.released, "already released");
        e.payee = payee;
        emit EscrowPayeeSet(jobId, payee);
    }

    function release(uint256 jobId) external onlyAuthorized nonReentrant {
        Escrow storage e = escrows[jobId];
        require(e.amount > 0, "missing escrow");
        require(e.payee != address(0), "missing payee");
        require(!e.released && !e.disputed, "invalid status");
        e.released = true;
        (bool ok, ) = payable(e.payee).call{value: e.amount}("");
        require(ok, "release failed");
        emit EscrowReleased(jobId, e.payee, e.amount);
    }

    function refund(uint256 jobId) external onlyAuthorized nonReentrant {
        Escrow storage e = escrows[jobId];
        require(e.amount > 0, "missing escrow");
        require(!e.released, "already released");
        e.released = true;
        (bool ok, ) = payable(e.payer).call{value: e.amount}("");
        require(ok, "refund failed");
        emit EscrowRefunded(jobId, e.payer, e.amount);
    }

    function releaseDisputed(uint256 jobId) external onlyAuthorized nonReentrant {
        Escrow storage e = escrows[jobId];
        require(e.amount > 0, "missing escrow");
        require(e.payee != address(0), "missing payee");
        require(!e.released && e.disputed, "invalid status");
        e.released = true;
        e.disputed = false;
        (bool ok, ) = payable(e.payee).call{value: e.amount}("");
        require(ok, "release failed");
        emit EscrowReleased(jobId, e.payee, e.amount);
    }

    function flagDisputed(uint256 jobId) external onlyAuthorized {
        Escrow storage e = escrows[jobId];
        require(e.amount > 0, "missing escrow");
        e.disputed = true;
    }
}
