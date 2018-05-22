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

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

import "../lib/dappsys/auth.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";
import "./ColonyNetworkStorage.sol";
import "./IReputationMiningCycle.sol";


contract ColonyNetwork is ColonyNetworkStorage {
  event ColonyAdded(uint256 indexed id, address indexed colonyAddress);
  event SkillAdded(uint256 skillId, uint256 parentSkillId);

  // Meta Colony allowed to manage Global skills
  // All colonies are able to manage their Local (domain associated) skills
  modifier allowedToAddSkill(bool globalSkill) {
    if (globalSkill) {
      require(msg.sender == metaColony);
    } else {
      require(_isColony[msg.sender]);
    }
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

  function getMetaColony() public view returns (address) {
    return metaColony;
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

  function getReputationRootHash() public view returns (bytes32) {
    return reputationRootHash;
  }

  function getReputationRootHashNNodes() public view returns (uint256) {
    return reputationRootHashNNodes;
  }

  function createMetaColony(address _tokenAddress) public
  auth
  {
    require(metaColony == 0);
    // Add the root global skill
    skillCount += 1;
    Skill memory rootGlobalSkill;
    rootGlobalSkill.globalSkill = true;
    skills[skillCount] = rootGlobalSkill;
    rootGlobalSkillId = skillCount;

    metaColony = createColony(_tokenAddress);

    // Add mining skill
    skillCount += 1;
    Skill memory miningSkill;
    miningSkill.nParents = 1;
    skills[skillCount] = miningSkill;
    skills[skillCount].parents.push(skillCount-1);
  }

  function createColony(address _tokenAddress) public returns (address) {
    EtherRouter etherRouter = new EtherRouter();
    address resolverForLatestColonyVersion = colonyVersionResolver[currentColonyVersion];
    etherRouter.setResolver(resolverForLatestColonyVersion);

    IColony colony = IColony(etherRouter);
    colony.setToken(_tokenAddress);

    Authority authority = new Authority(colony);
    DSAuth dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(authority);
    authority.setRootUser(msg.sender, true);
    authority.setOwner(msg.sender);

    // Initialise the root (domain) local skill with defaults by just incrementing the skillCount
    skillCount += 1;
    colonyCount += 1;
    colonies[colonyCount] = colony;
    _isColony[colony] = true;

    colony.initialiseColony(this);
    emit ColonyAdded(colonyCount, etherRouter);

    return etherRouter;
  }

  function addColonyVersion(uint _version, address _resolver) public
  auth
  {
    colonyVersionResolver[_version] = _resolver;
    if (_version > currentColonyVersion) {
      currentColonyVersion = _version;
    }
  }

  function getColony(uint256 _id) public view returns (address) {
    return colonies[_id];
  }

  function upgradeColony(uint256 _id, uint _newVersion) public {
    address etherRouter = colonies[_id];
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

    emit SkillAdded(skillCount, _parentSkillId);
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
    uint nParents = skills[_skillId].nParents;
    // TODO: Is it cheaper to check if _amount is <0, and if not, just set nChildren to 0, because children won't be updated for such an update?
    uint nChildren = skills[_skillId].nChildren;
    IReputationMiningCycle(inactiveReputationMiningCycle).appendReputationUpdateLog(_user, _amount, _skillId, msg.sender, nParents, nChildren);
  }
}
