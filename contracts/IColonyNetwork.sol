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


contract IColonyNetwork {
  event ColonyAdded(uint256 indexed id);
  event SkillAdded(uint256 skillId, uint256 parentSkillId);

  function getColony(bytes32 key) public view returns (address);
  function getColonyCount() public view returns (uint256);
  function addSkill(uint256 _parentSkillId, bool _globalSkill) public returns (uint256);
  function getSkill(uint256 _skillId) public view returns (uint256, uint256);
  function isGlobalSkill(uint256 _skillId) public view returns (bool);
  function appendReputationUpdateLog(address _user, int256 _amount, uint256 _skillId) public;
  function getSkillCount() public view returns (uint256);
  function getRootGlobalSkillId() public view returns (uint256);
  function createColony(bytes32 _name, address _tokenAddress) public;
  function addColonyVersion(uint256 _version, address _resolver) public;
  function getColonyAt(uint256 _idx) public view returns (address);
  function getCurrentColonyVersion() public view returns (uint256);
  function upgradeColony(bytes32 _name, uint256 _newVersion) public;
  function getParentSkillId(uint256 _skillId, uint256 _parentSkillIndex) public view returns (uint256);
  function getChildSkillId(uint256 _skillId, uint256 _childSkillIndex) public view returns (uint256);
  function getReputationUpdateLogLength(bool activeLog) public view returns (uint256);
  function getColonyVersionResolver(uint256 _version) public view returns (address);
  function getReputationUpdateLogEntry(uint256 _id, bool activeLog) public view returns (address, int, uint256, address, uint256, uint256);
  function deposit(uint256 _amount) public;
  function withdraw(uint256 amount) public;
  function getStakedBalance(address _user) public view returns (uint256);
  function setReputationRootHash(bytes32, uint256, address[]) public;
  function startNextCycle() public;
  function punishStakers(address[] stakers) public;
  function getReputationMiningCycle() public view returns (address);
  function getReputationRootHash() public view returns (bytes32);
  function getReputationRootHashNNodes() public view returns (uint256);
}
