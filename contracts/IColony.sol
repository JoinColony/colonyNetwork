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
  function proposeTaskChange(bytes _data, uint256 _value, uint8 _role) public;
  function approveTaskChange(uint256 _transactionId, uint8 _role) public;
  function setTaskEvaluator(uint256 _id, address _evaluator) public;
  function setTaskWorker(uint256 _id, address _worker) public;
  function setTaskSkill(uint256 _id, uint256 _skillId) public;
  function setTaskBrief(uint256 _id, bytes32 _ipfsDecodedHash) public;
  function setTaskDueDate(uint256 _id, uint256 _dueDate) public;
  function acceptTask(uint256 _id) public;
  function cancelTask(uint256 _id) public;
  function getTaskRolesCount(uint256 _id) public view returns (uint);
  function getTaskRoleAddress (uint256 _id, uint256 _role) public view returns (address);
  function mintTokens(uint128 _wad) public;
  function addSkill(uint256 _parentSkillId) public;
  function getTaskCount() public view returns (uint);
  function getTransactionCount() public view returns (uint);




  function getTask(uint256 taskId) public returns (bytes32, bool, bool, uint256, uint256, uint256, uint256);
  function setTaskPayout(uint256 _id, uint256 _role, address _token, uint256 _amount) public;
  function getTaskPayout(uint256 _id, uint256 _role, address _token) public view returns (uint);
  function claimPayout(uint256 _id, uint256 _role, address _token) public;
  function getPotBalance(uint256 _potId, address _token) public view returns (uint);
  function moveFundsBetweenPots(uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token) public;
  function claimColonyFunds(address _token) public;
  function getFeeInverse() public pure returns (uint);
  function getRewardInverse() public pure returns (uint);
  function getNonRewardPotsTotal(address) public view returns (uint);


  function submitTransaction(bytes,uint256,uint8) public returns (uint);
  function confirmTransaction(uint256,uint8) public;
  function setFunctionReviewers(bytes4,uint8,uint8) public;
}
