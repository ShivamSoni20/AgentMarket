// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrowPayment {
    function lockFunds(uint256 jobId, address payer, address payee) external payable;
    function setPayee(uint256 jobId, address payee) external;
    function release(uint256 jobId) external;
}

contract JobQueue {
    enum Status { OPEN, ASSIGNED, COMPLETED, DISPUTED, RESOLVED }

    struct Job {
        uint256 id;
        address poster;
        string capability;
        string taskData;
        uint256 budget;
        address worker;
        bytes32 resultHash;
        string resultData;
        Status status;
        uint256 createdAt;
        uint256 deadline;
    }

    mapping(uint256 => Job) public jobs;
    uint256 public nextJobId;
    address public orchestrator;
    mapping(address => bool) public authorized;
    IEscrowPayment public escrow;

    event JobPosted(uint256 indexed id, string capability, uint256 budget);
    event JobAssigned(uint256 indexed id, address indexed worker);
    event ResultSubmitted(uint256 indexed id, bytes32 resultHash);
    event JobCompleted(uint256 indexed id, address indexed worker);
    event JobDisputed(uint256 indexed id);

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator || authorized[msg.sender], "not orchestrator");
        _;
    }

    constructor() {
        orchestrator = msg.sender;
        authorized[msg.sender] = true;
    }

    function setOrchestrator(address _orchestrator) external {
        require(msg.sender == orchestrator, "not authorized");
        require(_orchestrator != address(0), "zero orchestrator");
        orchestrator = _orchestrator;
        authorized[_orchestrator] = true;
    }

    function setAuthorized(address account, bool enabled) external onlyOrchestrator {
        require(account != address(0), "zero account");
        authorized[account] = enabled;
    }

    function setEscrow(address _escrow) external onlyOrchestrator {
        require(_escrow != address(0), "zero escrow");
        escrow = IEscrowPayment(_escrow);
    }

    function postJob(string calldata capability, string calldata taskData, uint256 deadline) external payable returns (uint256) {
        require(address(escrow) != address(0), "escrow not set");
        require(msg.value > 0, "budget required");
        require(deadline > block.timestamp, "bad deadline");

        uint256 id = nextJobId++;
        jobs[id] = Job(id, msg.sender, capability, taskData, msg.value, address(0), bytes32(0), "", Status.OPEN, block.timestamp, deadline);
        escrow.lockFunds{value: msg.value}(id, msg.sender, address(0));
        emit JobPosted(id, capability, msg.value);
        return id;
    }

    function assignJob(uint256 id, address worker) external onlyOrchestrator {
        Job storage job = jobs[id];
        require(job.status == Status.OPEN, "not open");
        require(worker != address(0), "zero worker");
        job.worker = worker;
        job.status = Status.ASSIGNED;
        escrow.setPayee(id, worker);
        emit JobAssigned(id, worker);
    }

    function submitResult(uint256 id, bytes32 resultHash, string calldata resultData) external {
        Job storage job = jobs[id];
        require(job.status == Status.ASSIGNED, "not assigned");
        require(msg.sender == job.worker, "not assigned worker");
        require(resultHash != bytes32(0), "empty result");
        job.resultHash = resultHash;
        job.resultData = resultData;
        emit ResultSubmitted(id, resultHash);
    }

    function completeJob(uint256 id) external onlyOrchestrator {
        Job storage job = jobs[id];
        require(job.status == Status.ASSIGNED, "not assigned");
        require(job.resultHash != bytes32(0), "missing result");
        job.status = Status.COMPLETED;
        escrow.release(id);
        emit JobCompleted(id, job.worker);
    }

    function disputeJob(uint256 id) external onlyOrchestrator {
        Job storage job = jobs[id];
        require(job.status == Status.COMPLETED || job.status == Status.ASSIGNED, "bad status");
        job.status = Status.DISPUTED;
        emit JobDisputed(id);
    }

    function resolveJob(uint256 id, Status finalStatus) external onlyOrchestrator {
        require(finalStatus == Status.RESOLVED || finalStatus == Status.COMPLETED, "bad final status");
        Job storage job = jobs[id];
        job.status = finalStatus;
    }
}
