pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColony.sol";


contract Colony is DSAuth, DSMath, IColony {
  address resolver;
  ERC20Extended public token;
  mapping (uint => Task) public tasks;
  uint public taskCount;
  uint public reservedTokens;

  // This function, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  function version() public view returns (uint256) { return 5; }

  struct Task {
    bytes32 ipfsDecodedHash;
    address[] roles; // index mapping 0 => manager, 1 => evaluator, 2 => worker, 3.. => other roles
    bool accepted;
    uint dueDate;
    uint payoutsWeCannotMake;
    mapping (address => uint) totalPayouts;
    mapping (uint => mapping (address => uint)) payouts;
  }

  modifier tasksExists(uint256 _id) {
    require(_id <= taskCount);
    _;
  }

  modifier tasksNotAccepted(uint256 _id) {
    require(!tasks[_id].accepted);
    _;
  }

  modifier taskAccepted(uint256 _id) {
    require(tasks[_id].accepted);
    _;
  }

  function setToken(address _token) public
  auth
  {
    token = ERC20Extended(_token);
  }

  function makeTask(bytes32 _ipfsDecodedHash) public
  auth
  {
    taskCount += 1;
    address[] memory _roles = new address[](1);
    _roles[0] = msg.sender;
    tasks[taskCount] = Task({
        ipfsDecodedHash: _ipfsDecodedHash,
        roles: _roles,
        accepted: false,
        dueDate: 0,
        payoutsWeCannotMake: 0 });
  }

  function setTaskBrief(uint256 _id, bytes32 _ipfsDecodedHash) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].ipfsDecodedHash = _ipfsDecodedHash;
  }

  function acceptTask(uint256 _id) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].accepted = true;
  }

  function setTaskDueDate(uint256 _id, uint256 _dueDate) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].dueDate = _dueDate;
  }

  function setTaskPayout(uint _id, uint _role, address _token, uint _amount) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    Task storage task = tasks[_id];
    uint currentAmount = task.payouts[_role][_token];
    task.payouts[_role][_token] = add(currentAmount, _amount);

    uint currentTotalAmount = task.totalPayouts[_token];
    task.totalPayouts[_token] = add(currentTotalAmount, _amount);

    //TODO: Check Task pot and set `payoutsWeCannotMake`
  }

  function getTask(uint256 _id) public view
  returns (bytes32, uint, bool, uint, uint)
  {
    Task storage task = tasks[_id];
    uint rolesCount = task.roles.length;

    return (task.ipfsDecodedHash,
      rolesCount,
      task.accepted,
      task.dueDate,
      task.payoutsWeCannotMake);
  }

  function getTaskRoleAddress (uint _id, uint _role) public view
  returns (address)
  {
    return tasks[_id].roles[_role];
  }

  // To get all payouts for a task iterate over roles.length
  function getTaskPayout(uint _id, uint _role, address _token) public view
  returns (uint)
  {
    Task storage task = tasks[_id];
    return task.payouts[_role][_token];
  }

  function claimPayout(uint _id, uint _role, address _token) public
  taskAccepted(_id)
  {
    Task storage task = tasks[_id];
    require(task.roles[_role] == msg.sender);
    uint payout = task.payouts[_role][_token];
  }

  function mintTokens(uint128 _wad) public
  auth
  {
    return token.mint(_wad);
  }

  function () external
  payable
  {
      // Contracts that want to receive Ether with a plain "send" have to implement
      // a fallback function with the payable modifier. Contracts now throw if no payable
      // fallback function is defined and no function matches the signature.
  }
}
