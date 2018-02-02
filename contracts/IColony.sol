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
  function addSkill(uint256 _parentSkillId) public;

  // ColonyTask
  function makeTask(bytes32 _specificationHash) public;
  function proposeTaskChange(bytes _data, uint256 _value, uint8 _role) public;
  function approveTaskChange(uint256 _transactionId, uint8 _role) public;
  function setTaskRoleUser(uint256 _id, uint8 _role, address _user) public;
  function setTaskSkill(uint256 _id, uint256 _skillId) public;
  function setTaskBrief(uint256 _id, bytes32 _specificationHash) public;
  function setTaskDueDate(uint256 _id, uint256 _dueDate) public;
  function submitTaskDeliverable(uint256 _id, bytes32 _deliverableHash) public;
  function finalizeTask(uint256 _id) public;
  function cancelTask(uint256 _id) public;
  function getTaskRole(uint _id, uint8 _role) public view returns (address, bool, uint8);
  function getTaskWorkRatings(uint _id) public view returns (uint256, uint256);
  function getTaskWorkRatingSecret(uint _id, uint8 _role) public view returns (bytes32);
  function submitTaskWorkRating(uint256 _id, uint8 _role, bytes32 _ratingSecret) public;
  function revealTaskWorkRating(uint _id, uint8 _role, uint8 _rating, bytes32 _salt) public;
  function assignWorkRating(uint _id) public;
  function generateSecret(bytes32 _salt, uint256 _value) public pure returns (bytes32);
  function getTaskCount() public view returns (uint);
  function getTransactionCount() public view returns (uint);

  // ColonyTask.sol
  function getTask(uint256 taskId) public returns (bytes32, bytes32, bool, bool, uint256, uint256, uint256, uint256, uint256);
  function setTaskPayout(uint256 _id, uint256 _role, address _token, uint256 _amount) public;
  function getTaskPayout(uint256 _id, uint256 _role, address _token) public view returns (uint);
  function claimPayout(uint256 _id, uint256 _role, address _token) public;
  function getPotBalance(uint256 _potId, address _token) public view returns (uint);
  function moveFundsBetweenPots(uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token) public;
  function claimColonyFunds(address _token) public;
  function getFeeInverse() public pure returns (uint);
  function getRewardInverse() public pure returns (uint);
  function getNonRewardPotsTotal(address) public view returns (uint);

  // ColonyTransactionReviewer.sol
  function submitTransaction(bytes,uint256,uint8) public returns (uint);
  function confirmTransaction(uint256,uint8) public;
  function setFunctionReviewers(bytes4,uint8,uint8) public;

  event TaskAdded(uint256 indexed id);
  event Confirmation(uint indexed transactionId, uint indexed senderRole);
  event Revocation(uint indexed transactionId, address indexed sender);
  event Submission(uint indexed transactionId);
  event Execution(uint indexed transactionId);
  event ExecutionFailure(uint indexed transactionId);
}
