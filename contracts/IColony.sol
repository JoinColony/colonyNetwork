/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


contract IColony {
  // DSAuth
  function authority() public view returns (address);
  function owner() public view returns (address);

  // Colony.sol
  function version() public pure returns (uint256);
  function setToken(address _token) public;
  function getToken() public view returns (address);
  function initialiseColony(address _network) public;
  function mintTokens(uint256 _wad) public;
  function mintTokensForColonyNetwork(uint256 _wad) public;
  function addGlobalSkill(uint256 _parentSkillId) public returns (uint256);
  function addDomain(uint256 _parentSkillId) public;
  function getDomain(uint256 _id) public view returns (uint256, uint256);
  function getDomainCount() public view returns (uint256);

  // ColonyTask
  function makeTask(bytes32 _specificationHash, uint256 _domainId) public;
  function getTaskCount() public view returns (uint256);
  function proposeTaskChange(bytes _data, uint256 _value, uint8 _role) public returns (uint256 transactionId);
  function approveTaskChange(uint256 _transactionId, uint8 _role) public;
  function submitTaskWorkRating(uint256 _id, uint8 _role, bytes32 _ratingSecret) public;
  function revealTaskWorkRating(uint256 _id, uint8 _role, uint8 _rating, bytes32 _salt) public;
  function assignWorkRating(uint256 _id) public;
  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32);
  function getTaskWorkRatings(uint256 _id) public view returns (uint256, uint256);
  function getTaskWorkRatingSecret(uint256 _id, uint8 _role) public view returns (bytes32);
  function setTaskRoleUser(uint256 _id, uint8 _role, address _user) public;
  function setTaskSkill(uint256 _id, uint256 _skillId) public;
  function setTaskDomain(uint256 _id, uint256 _domainId) public;
  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public;
  function setTaskDueDate(uint256 _id, uint256 _dueDate) public;
  function submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash) public;
  function finalizeTask(uint256 _id) public;
  function cancelTask(uint256 _id) public;
  function getTask(uint256 _id) public view returns (bytes32, bytes32, bool, bool, uint256, uint256, uint256, uint256);
  function getTaskRole(uint256 _id, uint8 _idx) public view returns (address, bool, uint8);
  function getTaskSkill(uint256 _id, uint256 _idx) public view returns (uint256);
  function getTaskDomain(uint256 _id, uint256 _idx) public view returns (uint256);

  // ColonyFunding.sol
  function getFeeInverse() public pure returns (uint256);
  function getRewardInverse() public pure returns (uint256);
  function getTaskPayout(uint256 _id, uint256 _role, address _token) public view returns (uint256);
  function setTaskManagerPayout(uint256 _id, address _token, uint256 _amount) public;
  function setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount) public;
  function setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount) public;
  function claimPayout(uint256 _id, uint256 _role, address _token) public;
  function getPotBalance(uint256 _potId, address _token) public view returns (uint256);
  function moveFundsBetweenPots(uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token) public;
  function claimColonyFunds(address _token) public;
  function getNonRewardPotsTotal(address) public view returns (uint256);

  // ColonyTransactionReviewer.sol
  function submitTransaction(bytes, uint256, uint8) public returns (uint256);
  function confirmTransaction(uint256, uint8) public;
  function setFunctionReviewers(bytes4, uint8, uint8) public;
  function getTransactionCount() public view returns (uint256);

  event TaskAdded(uint256 indexed id);
  event Confirmation(uint256 indexed transactionId, uint256 indexed senderRole);
  event Revocation(uint256 indexed transactionId, address indexed sender);
  event Submission(uint256 indexed transactionId);
  event Execution(uint256 indexed transactionId);
  event ExecutionFailure(uint256 indexed transactionId);
}
