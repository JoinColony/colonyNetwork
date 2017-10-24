pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColony.sol";


contract Colony is DSAuth, DSMath, IColony {
  address resolver;
  address colonyNetworkAddress;
  ERC20Extended public token;
  mapping (uint => Task) public tasks;
  // Pots can be tied to tasks or to (in the future) domains, so giving them their own mapping.
  // Pot 0  can be thought of as the pot belonging to the colony itself that hasn't been assigned
  // to anything yet, but has had fees paid.
  mapping (address => uint) public feesPaid;
  // This keeps track of how much of the colony's funds that it owns have been moved into pots anywhere, and have also
  // had fees paid.
  // TODO: This needs to be decremented whenever a payout occurs and the colony loses control of the funds.

  mapping (uint => Pot) pots;
  uint public taskCount;
  uint public potCount;

  // This function, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  function version() public view returns (uint256) { return 5; }

  struct Task {
    bytes32 ipfsDecodedHash;
    address[] roles; // index mapping 0 => manager, 1 => evaluator, 2 => worker, 3.. => other roles
    uint dueDate;
    bool accepted;
    uint payoutsWeCannotMake;
    uint potID;
    mapping (address => uint) totalPayouts;
    mapping (uint => mapping (address => uint)) payouts;
  }

  struct Pot {
    mapping (address => uint) balance;
    uint taskID;
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
    potCount +=1;
    address[] memory _roles = new address[](1);
    _roles[0] = msg.sender;
    tasks[taskCount] = Task({
        ipfsDecodedHash: _ipfsDecodedHash,
        roles: _roles,
        accepted: false,
        dueDate: 0,
        payoutsWeCannotMake: 0,
        potID: potCount});
    pots[potCount].taskID = taskCount;
  }

  function setTaskBrief(uint256 _id, bytes32 _ipfsDecodedHash) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].ipfsDecodedHash = _ipfsDecodedHash;
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
    task.payouts[_role][_token] = _amount;

    uint currentTotalAmount = task.totalPayouts[_token];
    task.totalPayouts[_token] = add(sub(currentTotalAmount, currentAmount), _amount);

    //TODO: Check Task pot and set `payoutsWeCannotMake`
  }

  function acceptTask(uint256 _id) public
  auth
  tasksExists(_id)
  tasksNotAccepted(_id)
  {
    tasks[_id].accepted = true;
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

  function getPotBalance(uint256 _potID, address _token) returns (uint256){
    return pots[_potID].balance[_token];
  }

  function claimColonyFunds(address _token) public {
    uint toClaim;
    uint feeToPay;
    uint remainder;
    if (_token==0x0){
      // It's ether
      toClaim = this.balance - feesPaid[_token];
      feeToPay = toClaim / getFeeInverse();
      remainder = sub(toClaim, feeToPay);
      feesPaid[_token] = add(feesPaid[_token], remainder);
      pots[0].balance[_token] = add(pots[0].balance[_token], remainder);
      colonyNetworkAddress.transfer(feeToPay);
    } else {
      // Assume it's an ERC 20 token.
      ERC20Extended targetToken = ERC20Extended(_token);
      toClaim = targetToken.balanceOf(this) - feesPaid[_token];
      feeToPay = toClaim / getFeeInverse();
      remainder = sub(toClaim, feeToPay);
      feesPaid[_token] = add(feesPaid[_token], remainder);
      pots[0].balance[_token] = add(pots[0].balance[_token], remainder);
      targetToken.transfer(colonyNetworkAddress, feeToPay);
    }
  }

  function getFeeInverse() public returns (uint){
    // Return 1 / the fee to pay to the network.
    // e.g. if the fee is 1% (or 0.01), return 100
    // TODO: refer to ColonyNetwork
    return 100;
  }

  function setColonyNetwork(address _address) public {
    require (colonyNetworkAddress==0x0);
    colonyNetworkAddress = _address;
  }

  function mintTokens(uint128 _wad) public
  auth
  {
    return token.mint(_wad);
  }

}
