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

import "../lib/dappsys/auth.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";
import "./ColonyNetworkStorage.sol";


contract ColonyNetwork is ColonyNetworkStorage {
  event ColonyAdded(uint256 indexed id);
  event SkillAdded(uint256 skillId, uint256 parentSkillId);

  // Common Colony allowed to manage Global skills
  // All colonies are able to manage their Local (domain associated) skills
  modifier allowedToAddSkill(bool globalSkill) {
    if (globalSkill) {
      address commonColony = getColony("Common Colony");
      require(msg.sender == commonColony);
    } else {
      require(_isColony[msg.sender]);
    }
    _;
  }

  modifier colonyKeyUnique(bytes32 _key) {
    require(_colonies[_key] == address(0x0));
    _;
  }

  modifier skillExists(uint skillId) {
    require(skillCount >= skillId);
    _;
  }

  modifier nonZero(uint256 parentSkillId) {
    require(parentSkillId > 0);
    _;
  }

  modifier calledByColony() {
    require(_isColony[msg.sender]);
    _;
  }

  function getCurrentColonyVersion() public view returns (uint256) {
    return currentColonyVersion;
  }

  function getColonyCount() public view returns (uint256) {
    return colonyCount;
  }

  function getSkillCount() public view returns (uint256) {
    return skillCount;
  }

  function getRootGlobalSkillId() public view returns (uint256) {
    return rootGlobalSkillId;
  }

  function getColonyVersionResolver(uint256 _version) public view returns (address) {
    return colonyVersionResolver[_version];
  }

  function getSkill(uint256 _skillId) public view returns (uint256, uint256) {
    return (skills[_skillId].nParents, skills[_skillId].nChildren);
  }

  function isGlobalSkill(uint256 _skillId) public view returns (bool) {
    return skills[_skillId].globalSkill;
  }

  function getReputationUpdateLogEntry(uint256 _id, bool active) public view returns (address, int256, uint256, address, uint256, uint256) {
    uint logIdx = activeReputationUpdateLog;
    if (!active) {
      logIdx = (logIdx + 1) % 2;
    }
    ReputationLogEntry storage x = ReputationUpdateLogs[logIdx][_id];
    return (x.user, x.amount, x.skillId, x.colony, x.nUpdates, x.nPreviousUpdates);
  }

  function getReputationRootHash() public view returns (bytes32) {
    return reputationRootHash;
  }

  function getReputationRootHashNNodes() public view returns (uint256) {
    return reputationRootHashNNodes;
  }

  function createColony(bytes32 _name, address _tokenAddress) public
  colonyKeyUnique(_name)
  {
    var etherRouter = new EtherRouter();
    var resolverForLatestColonyVersion = colonyVersionResolver[currentColonyVersion];
    etherRouter.setResolver(resolverForLatestColonyVersion);

    var colony = IColony(etherRouter);
    colony.setToken(_tokenAddress);

    var authority = new Authority(colony);
    var dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(authority);
    authority.setRootUser(msg.sender, true);
    authority.setOwner(msg.sender);

    // For the Common Colony add the root global skill
    if (_name == "Common Colony") {
      skillCount += 1;
      Skill memory rootGlobalSkill;
      rootGlobalSkill.globalSkill = true;
      skills[skillCount] = rootGlobalSkill;
      rootGlobalSkillId = skillCount;
    }

    // For all colonies initialise the root (domain) local skill with defaults by just incrementing the skillCount
    skillCount += 1;
    colonyCount += 1;
    _coloniesIndex[colonyCount] = colony;
    _colonies[_name] = colony;
    _isColony[colony] = true;

    colony.initialiseColony(this);
    ColonyAdded(colonyCount);
  }

  function addColonyVersion(uint _version, address _resolver) public
  auth
  {
    colonyVersionResolver[_version] = _resolver;
    if (_version > currentColonyVersion) {
      currentColonyVersion = _version;
    }
  }

  // Returns the address of a Colony by index
  function getColony(bytes32 _name) public view returns (address) {
    return _colonies[_name];
  }

  function getColonyAt(uint _idx) public view returns (address) {
    return _coloniesIndex[_idx];
  }

  function upgradeColony(bytes32 _name, uint _newVersion) public {
    address etherRouter = _colonies[_name];
    // Check the calling user is authorised
    DSAuth auth = DSAuth(etherRouter);
    DSAuthority authority = auth.authority();
    require(authority.canCall(msg.sender, etherRouter, 0x0e1f20b4));
    // Upgrades can only go up in version
    IColony colony = IColony(etherRouter);
    uint currentVersion = colony.version();
    require(_newVersion > currentVersion);
    // Requested version has to be registered
    address newResolver = colonyVersionResolver[_newVersion];
    require(newResolver != 0x0);
    EtherRouter e = EtherRouter(etherRouter);
    e.setResolver(newResolver);
  }

  function addSkill(uint _parentSkillId, bool _globalSkill) public
  skillExists(_parentSkillId)
  allowedToAddSkill(_globalSkill)
  nonZero(_parentSkillId)
  returns (uint256)
  {
    skillCount += 1;

    Skill storage parentSkill = skills[_parentSkillId];

    // Global and local skill trees are kept separate
    require(parentSkill.globalSkill == _globalSkill);

    Skill memory s;
    s.nParents = parentSkill.nParents + 1;
    s.globalSkill = _globalSkill;
    skills[skillCount] = s;

    uint parentSkillId = _parentSkillId;
    bool notAtRoot = true;
    uint powerOfTwo = 1;
    uint treeWalkingCounter = 1;

    // Walk through the tree parent skills up to the root
    while (notAtRoot) {
      // Add the new skill to each parent children
      // TODO: skip this for the root skill as the children of that will always be all skills
      parentSkill.children.push(skillCount);
      parentSkill.nChildren += 1;

      // When we are at an integer power of two steps away from the newly added skill node,
      // add the current parent skill to the new skill's parents array
      if (treeWalkingCounter == powerOfTwo) {
        skills[skillCount].parents.push(parentSkillId);
        powerOfTwo = powerOfTwo*2;
      }

      // Check if we've reached the root of the tree yet (it has no parents)
      // Otherwise get the next parent
      if (parentSkill.nParents == 0) {
        notAtRoot = false;
      } else {
        parentSkillId = parentSkill.parents[0];
        parentSkill = skills[parentSkill.parents[0]];
      }

      treeWalkingCounter += 1;
    }

    SkillAdded(skillCount, _parentSkillId);
    return skillCount;
  }

  function getParentSkillId(uint _skillId, uint _parentSkillIndex) public view returns (uint256) {
    Skill storage skill = skills[_skillId];
    return skill.parents[_parentSkillIndex];
  }

  function getChildSkillId(uint _skillId, uint _childSkillIndex) public view returns (uint256) {
    Skill storage skill = skills[_skillId];
    return skill.children[_childSkillIndex];
  }

  function appendReputationUpdateLog(address _user, int _amount, uint _skillId) public
  calledByColony
  skillExists(_skillId)
  {
    uint reputationUpdateLogLength = ReputationUpdateLogs[activeReputationUpdateLog].length;
    uint nPreviousUpdates = 0;
    if (reputationUpdateLogLength > 0) {
      nPreviousUpdates = ReputationUpdateLogs[activeReputationUpdateLog][reputationUpdateLogLength-1].nPreviousUpdates + ReputationUpdateLogs[activeReputationUpdateLog][reputationUpdateLogLength-1].nUpdates;
    }
    uint nUpdates = (skills[_skillId].nParents + 1) * 2;
    if (_amount < 0) {
      //TODO: Never true currently. _amount needs to be an int.
      nUpdates += 2 * skills[_skillId].nChildren;
    }
    ReputationUpdateLogs[activeReputationUpdateLog].push(ReputationLogEntry(
      _user,
      _amount,
      _skillId,
      msg.sender,
      nUpdates,
      nPreviousUpdates));
  }

  function getReputationUpdateLogLength(bool active) public view returns (uint) {
    uint logIdx = activeReputationUpdateLog;
    if (!active) {
      logIdx = (logIdx + 1 ) % 2;
    }
    return ReputationUpdateLogs[logIdx].length;
  }
}
