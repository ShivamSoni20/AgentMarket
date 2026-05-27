// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    uint256 public constant MIN_STAKE = 0.01 ether; // Lowered for testnet faucet amounts

    struct Worker {
        address owner;       // EOA controlling the worker
        string[] caps;       // ["translate","summarise"]
        uint256 bidPerJob;   // SOMI wei
        uint256 stake;       // slashable bond
        uint256 rating;      // 0-500 (5.00 = 500)
        uint256 jobsCompleted;
        bool active;
    }

    mapping(address => Worker) public workers;
    address[] public workerList;
    address public owner;

    event WorkerRegistered(address indexed worker, string[] caps, uint256 bid);
    event WorkerSlashed(address indexed worker, uint256 amount);
    event WorkerDeactivated(address indexed worker);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function register(string[] calldata caps, uint256 bidPerJob) external payable {
        require(!workers[msg.sender].active, "already registered");
        require(msg.value >= MIN_STAKE, "insufficient stake");
        workers[msg.sender] = Worker(msg.sender, caps, bidPerJob, msg.value, 500, 0, true);
        workerList.push(msg.sender);
        emit WorkerRegistered(msg.sender, caps, bidPerJob);
    }

    function slash(address worker) external onlyOwner returns (uint256) {
        // Slashes the entire stake or a portion. For simplicity let's slash the entire stake of a worker.
        require(workers[worker].active, "worker not active");
        uint256 slashAmount = workers[worker].stake;
        workers[worker].stake = 0;
        workers[worker].active = false;
        payable(msg.sender).transfer(slashAmount);
        
        emit WorkerSlashed(worker, slashAmount);
        emit WorkerDeactivated(worker);
        
        return slashAmount;
    }

    function incrementJobs(address worker) external onlyOwner {
        workers[worker].jobsCompleted++;
    }

    function getWorkerCaps(address worker) external view returns (string[] memory) {
        return workers[worker].caps;
    }
}
