pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


contract IColony {
  function authority() public view returns (address);
  function owner() public view returns (address);
  function getToken() public view returns (address);

  function version() public view returns (uint256);
  function setToken(address _token) public;
  function initialiseColony(address _network) public;
  function makeTask(bytes32 _ipfsDecodedHash) public;
  function proposeTaskChange(bytes _data, uint _value, uint8 _role) public;
  function approveTaskChange(uint _transactionId, uint8 _role) public;
  function setTaskEvaluator(uint256 _id, address _evaluator) public;
  function setTaskWorker(uint256 _id, address _worker) public;
  function setTaskSkill(uint _id, uint _skillId) public;
  function setTaskBrief(uint256 _id, bytes32 _ipfsDecodedHash) public;
  function setTaskDueDate(uint256 _id, uint256 _dueDate) public;
  function acceptTask(uint256 _id) public;
  function cancelTask(uint256 _id) public;
  function getTaskRolesCount(uint _id) public view returns (uint);
  function getTaskRoleAddress (uint _id, uint _role) public view returns (address);
  function mintTokens(uint128 _wad) public;
  function addSkill(uint _parentSkillId) public;
  function getTaskCount() public view returns (uint);
  function getTransactionCount() public view returns (uint);




  function tasks(uint taskId) public returns (bytes32, bool, bool, uint256, uint256, uint256, uint256);
  function setTaskPayout(uint _id, uint _role, address _token, uint _amount) public;
  function updateTaskPayoutsWeCannotMakeAfterPotChange(uint256 _id, address _token, uint _prev);
  function getTaskPayout(uint _id, uint _role, address _token) public view returns (uint);
  function claimPayout(uint _id, uint _role, address _token) public;
  function getPotBalance(uint256 _potId, address _token) public view returns (uint);
  function moveFundsBetweenPots(uint _fromPot, uint _toPot, uint _amount, address _token) public;
  function claimColonyFunds(address _token) public;
  function getFeeInverse() public pure returns (uint);
  function getRewardInverse() public pure returns (uint);


  function submitTransaction(bytes,uint256,uint8) public returns (uint);
  function confirmTransaction(uint256,uint8) public;
  function setFunctionReviewers(bytes4,uint8,uint8) public;
}
