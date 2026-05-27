// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AgentRegistry.sol";
import "./JobQueue.sol";
import "./EscrowPayment.sol";

contract DisputeResolver {
    uint256 public constant AUDITOR_FEE_BPS = 1000; // 10%

    AgentRegistry public registry;
    JobQueue public jobQueue;
    EscrowPayment public escrow;
    address public owner;
    address public auditor;

    event DisputeRaised(uint256 jobId, address auditor);
    event DisputeResolved(uint256 jobId, bool upheld, address worker, uint256 slashed);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAuditor() {
        require(msg.sender == auditor, "not auditor");
        _;
    }

    constructor(address _registry, address _jobQueue, address _escrow, address _auditor) {
        registry = AgentRegistry(_registry);
        jobQueue = JobQueue(_jobQueue);
        escrow = EscrowPayment(_escrow);
        auditor = _auditor;
        owner = msg.sender;
    }

    function setAuditor(address _auditor) external onlyOwner {
        auditor = _auditor;
    }

    function raiseDispute(uint256 jobId, bytes32 /*auditorResultHash*/) external onlyAuditor {
        jobQueue.disputeJob(jobId);
        escrow.flagDisputed(jobId);
        emit DisputeRaised(jobId, msg.sender);
    }

    function resolve(uint256 jobId, bool upheld) external onlyOwner {
        uint256 slashed = 0;
        address worker = address(0);
        
        // Fetch worker from JobQueue
        (,,,,, address jobWorker,,,,,) = jobQueue.jobs(jobId);
        worker = jobWorker;

        if (upheld) {
            slashed = registry.slash(worker);
            uint256 fee = (slashed * AUDITOR_FEE_BPS) / 10000;
            if (fee > 0) {
                payable(auditor).transfer(fee);
            }
            try escrow.refund(jobId) {} catch {}
            jobQueue.resolveJob(jobId, JobQueue.Status.RESOLVED);
        } else {
            // If not upheld, release funds to the worker
            escrow.release(jobId);
            jobQueue.resolveJob(jobId, JobQueue.Status.COMPLETED);
        }
        
        emit DisputeResolved(jobId, upheld, worker, slashed);
    }
    
    // Receive ether to distribute slashed worker stakes
    receive() external payable {}

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "insufficient balance");
        to.transfer(amount);
    }
}
