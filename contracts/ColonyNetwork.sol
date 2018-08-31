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

import "./Authority.sol";
import "./EtherRouter.sol";
import "./ColonyNetworkStorage.sol";
import "./IReputationMiningCycle.sol";


contract ColonyNetwork is ColonyNetworkStorage {
  event ColonyAdded(uint256 indexed id, address indexed colonyAddress);
  event SkillAdded(uint256 skillId, uint256 parentSkillId);

  // Meta Colony allowed to manage Global skills
  // All colonies are able to manage their Local (domain associated) skills
  modifier allowedToAddSkill(bool globalSkill) {
    if (globalSkill) {
      require(msg.sender == metaColony, "colony-must-be-meta-colony");
    } else {
      require(_isColony[msg.sender] || msg.sender == address(this), "colony-caller-must-be-colony");
    }
    _;
  }

  modifier skillExists(uint skillId) {
    require(skillCount >= skillId, "colony-invalid-skill-id");
    _;
  }

  modifier nonZero(uint256 parentSkillId) {
    require(parentSkillId > 0, "colony-invalid-parent-skill-id");
    _;
  }

  function isColony(address _colony) public view returns (bool) {
    return _isColony[_colony];
  }

  function getCurrentColonyVersion() public view returns (uint256) {
    return currentColonyVersion;
  }

  function getMetaColony() public view returns (address) {
    return metaColony;
  }

  function getSomething(uint256 a) public view returns (uint256) {
    return a;
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

  function getSkill(uint256 _skillId) public view returns (uint256, uint256, bool) {
    Skill storage skill = skills[_skillId];
    return (skill.nParents, skill.nChildren, skill.globalSkill);
  }

  function getReputationRootHash() public view returns (bytes32) {
    return reputationRootHash;
  }

  function getReputationRootHashNNodes() public view returns (uint256) {
    return reputationRootHashNNodes;
  }

  function setTokenLocking(address _tokenLocking) public
  auth
  {
    // Token locking address can't be changed
    require(tokenLocking == 0x0, "colony-invalid-token-locking-address");
    tokenLocking = _tokenLocking;
  }

  function getTokenLocking() public view returns (address) {
    return tokenLocking;
  }

  function setMiningResolver(address _miningResolver) public
  auth
  {
    miningCycleResolver = _miningResolver;
  }

  function getMiningResolver() public returns (address) {
    return miningCycleResolver;
  }

  function createMetaColony(address _tokenAddress) public
  auth
  {
    require(metaColony == 0, "colony-meta-colony-exists-already");
    // Add the root global skill
    skillCount += 1;
    Skill memory rootGlobalSkill;
    rootGlobalSkill.globalSkill = true;
    skills[skillCount] = rootGlobalSkill;
    rootGlobalSkillId = skillCount;

    metaColony = createColony(_tokenAddress);

    // Add the special mining skill
    this.addSkill(skillCount, false);
  }

  function createColony(address _tokenAddress) public returns (address) {
    EtherRouter etherRouter = new EtherRouter();
    address resolverForLatestColonyVersion = colonyVersionResolver[currentColonyVersion];
    etherRouter.setResolver(resolverForLatestColonyVersion);

    IColony colony = IColony(etherRouter);
    colony.setToken(_tokenAddress);

    // Creating new instance of colony's authority
    Authority authority = new Authority(colony);

    DSAuth dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(authority);

    authority.setOwner(etherRouter);
    colony.setOwnerRole(msg.sender);

    // Colony will not have owner
    dsauth.setOwner(0x0);

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

  function addSkill(uint _parentSkillId, bool _globalSkill) public
  skillExists(_parentSkillId)
  allowedToAddSkill(_globalSkill)
  nonZero(_parentSkillId)
  returns (uint256)
  {
    skillCount += 1;

    Skill storage parentSkill = skills[_parentSkillId];

    // Global and local skill trees are kept separate
    require(parentSkill.globalSkill == _globalSkill, "colony-global-and-local-skill-trees-are-separate");

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
    return ascendSkillTree(_skillId, _parentSkillIndex + 1);
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
    IReputationMiningCycle(inactiveReputationMiningCycle).appendReputationUpdateLog(
      _user,
      _amount,
      _skillId,
      msg.sender,
      nParents,
      nChildren
    );
  }

  function ascendSkillTree(uint _skillId, uint _parentSkillNumber) internal view returns (uint256) {
    if (_parentSkillNumber == 0) {
      return _skillId;
    }

    Skill storage skill = skills[_skillId];
    for (uint i; i < skill.parents.length; i++) {
      if (2**(i+1) > _parentSkillNumber) {
        uint _newSkillId = skill.parents[i];
        uint _newParentSkillNumber = _parentSkillNumber - 2**i;
        return ascendSkillTree(_newSkillId, _newParentSkillNumber);
      }
    }
  }
}
