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

    mapping(uint256 => Escrow) public escrows; // jobId => Escrow
    address public orchestrator;

    event EscrowLocked(uint256 jobId, uint256 amount);
    event EscrowReleased(uint256 jobId, address payee, uint256 amount);
    event EscrowRefunded(uint256 jobId, address payer, uint256 amount);

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator, "not orchestrator");
        _;
    }

    constructor() {
        orchestrator = msg.sender;
    }

    function setOrchestrator(address _orchestrator) external {
        require(msg.sender == orchestrator, "not authorized");
        orchestrator = _orchestrator;
    }

    function lockFunds(uint256 jobId, address payee) external payable {
        escrows[jobId] = Escrow(msg.sender, payee, msg.value, false, false);
        emit EscrowLocked(jobId, msg.value);
    }

    function release(uint256 jobId) external onlyOrchestrator {
        Escrow storage e = escrows[jobId];
        require(!e.released && !e.disputed, "invalid status");
        e.released = true;
        payable(e.payee).transfer(e.amount);
        emit EscrowReleased(jobId, e.payee, e.amount);
    }

    function refund(uint256 jobId) external onlyOrchestrator {
        Escrow storage e = escrows[jobId];
        require(!e.released, "already released");
        e.released = true;
        payable(e.payer).transfer(e.amount);
        emit EscrowRefunded(jobId, e.payer, e.amount);
    }

    function flagDisputed(uint256 jobId) external onlyOrchestrator {
        escrows[jobId].disputed = true;
    }
}
