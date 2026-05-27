// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract JobQueue {
    enum Status { OPEN, ASSIGNED, COMPLETED, DISPUTED, RESOLVED }

    struct Job {
        uint256 id;
        address poster;
        string capability;   // "translate"
        string taskData;     // IPFS CID or calldata
        uint256 budget;      // max SOMI willing to pay
        address worker;      // assigned worker
        bytes32 resultHash;  // keccak256 of result
        Status status;
        uint256 createdAt;
        uint256 deadline;
    }

    mapping(uint256 => Job) public jobs;
    uint256 public nextJobId;
    address public orchestrator;

    event JobPosted(uint256 indexed id, string capability, uint256 budget);
    event JobAssigned(uint256 indexed id, address indexed worker);
    event ResultSubmitted(uint256 indexed id, bytes32 resultHash);
    event JobCompleted(uint256 indexed id, address indexed worker);
    event JobDisputed(uint256 indexed id);

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

    function postJob(string calldata capability, string calldata taskData, uint256 deadline) external payable returns (uint256) {
        uint256 id = nextJobId++;
        jobs[id] = Job(id, msg.sender, capability, taskData, msg.value, address(0), bytes32(0), Status.OPEN, block.timestamp, deadline);
        emit JobPosted(id, capability, msg.value);
        return id;
    }

    function assignJob(uint256 id, address worker) external onlyOrchestrator {
        Job storage job = jobs[id];
        require(job.status == Status.OPEN, "not open");
        job.worker = worker;
        job.status = Status.ASSIGNED;
        emit JobAssigned(id, worker);
    }

    function submitResult(uint256 id, bytes32 resultHash) external {
        Job storage job = jobs[id];
        require(job.status == Status.ASSIGNED, "not assigned");
        require(msg.sender == job.worker, "not assigned worker");
        job.resultHash = resultHash;
        emit ResultSubmitted(id, resultHash);
    }

    function completeJob(uint256 id) external onlyOrchestrator {
        Job storage job = jobs[id];
        require(job.status == Status.ASSIGNED, "not assigned");
        job.status = Status.COMPLETED;
        emit JobCompleted(id, job.worker);
    }

    function disputeJob(uint256 id) external {
        Job storage job = jobs[id];
        job.status = Status.DISPUTED;
        emit JobDisputed(id);
    }

    function resolveJob(uint256 id, Status finalStatus) external {
        Job storage job = jobs[id];
        job.status = finalStatus;
    }
}
