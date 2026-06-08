// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    uint256 public constant MIN_STAKE = 0.01 ether;

    struct Worker {
        address owner;
        string[] caps;
        uint256 bidPerJob;
        uint256 stake;
        uint256 rating;
        uint256 jobsCompleted;
        bool active;
    }

    mapping(address => Worker) public workers;
    address[] public workerList;
    address public owner;
    mapping(address => bool) public authorized;

    event WorkerRegistered(address indexed worker, string[] caps, uint256 bid);
    event WorkerSlashed(address indexed worker, uint256 amount);
    event WorkerDeactivated(address indexed worker);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AuthorizedUpdated(address indexed account, bool enabled);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorized[msg.sender] || msg.sender == owner, "not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorized[msg.sender] = true;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
        authorized[newOwner] = true;
    }

    function setAuthorized(address account, bool enabled) external onlyOwner {
        require(account != address(0), "zero account");
        authorized[account] = enabled;
        emit AuthorizedUpdated(account, enabled);
    }

    function register(string[] calldata caps, uint256 bidPerJob) external payable {
        require(!workers[msg.sender].active, "already registered");
        require(msg.value >= MIN_STAKE, "insufficient stake");
        workers[msg.sender] = Worker(msg.sender, caps, bidPerJob, msg.value, 500, 0, true);
        workerList.push(msg.sender);
        emit WorkerRegistered(msg.sender, caps, bidPerJob);
    }

    function slash(address worker) external onlyAuthorized returns (uint256) {
        require(workers[worker].active, "worker not active");
        uint256 slashAmount = workers[worker].stake;
        workers[worker].stake = 0;
        workers[worker].active = false;
        payable(msg.sender).transfer(slashAmount);
        emit WorkerSlashed(worker, slashAmount);
        emit WorkerDeactivated(worker);
        return slashAmount;
    }

    function incrementJobs(address worker) external onlyAuthorized {
        workers[worker].jobsCompleted++;
    }

    function getWorkerCaps(address worker) external view returns (string[] memory) {
        return workers[worker].caps;
    }
}
