pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/roles.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";


contract ColonyNetwork is DSAuth {
  address resolver;
  uint256 public colonyCount;
  uint256 public currentColonyVersion;
  mapping (uint => address) _coloniesIndex;
  mapping (bytes32 => address) _colonies;
  mapping (address => bool) _isColony;
  // Maps colony contract versions to respective resolvers
  mapping (uint => address) public colonyVersionResolver;

  struct Skill {
    // total number of parent skills
    uint256 nParents;
    // total number of child skills
    uint256 nChildren;
    // array of `skill_id`s of parent skills starting from the 1st to `n`th, where `n` is an integer power of two larger than or equal to 1
    uint256[] parents;
    // array of `skill_id`s of all child skills
    uint256[] children;
  }
  mapping (uint => Skill) public skills;
  uint256 public skillCount;

  event SkillAdded(uint256 skillId, uint256 parentSkillId);

  modifier onlyCommonColony() {
    address commonColony = getColony("Common Colony");
    require(msg.sender == commonColony || msg.sender == address(this));
    _;
  }

  modifier skillExists(uint skillId) {
    require(skillCount > skillId);
    _;
  }

  struct ReputationLogEntry {
    address user;
    int amount;
    uint skillId;
    address colony;
    uint nUpdates;
    uint nPreviousUpdates;
  }

  ReputationLogEntry[] public ReputationUpdateLog;

  modifier calledByColony() {
    require(_isColony[msg.sender]);
    _;
  }

  function createColony(bytes32 _name) public {
    var token = new Token();
    var etherRouter = new EtherRouter();
    var resolverForLatestColonyVersion = colonyVersionResolver[currentColonyVersion];
    etherRouter.setResolver(resolverForLatestColonyVersion);

    var colony = IColony(etherRouter);
    colony.setToken(token);
    colony.initialiseColony(this);
    token.setOwner(colony);

    var authority = new Authority(colony);
    var dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(authority);
    authority.setRootUser(msg.sender, true);
    authority.setOwner(msg.sender);

    // Root Skill initialisation consists of simply incrementing the skill counter,
    // as the root skill requires no changes to the defaults for the Skill datatype
    if (_name == "Common Colony") {
      skillCount += 1;
    }

    colonyCount += 1;
    _coloniesIndex[colonyCount] = colony;
    _colonies[_name] = colony;
    _isColony[colony] = true;
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

  function addSkill(uint _parentSkillId) public
  onlyCommonColony
  skillExists(_parentSkillId)
  {
    Skill storage parentSkill = skills[_parentSkillId];
    uint nParents = parentSkill.nParents + 1;
    uint256[] memory parents = new uint256[](0);
    uint256[] memory children = new uint256[](0);

    skills[skillCount] = Skill({
      nParents: nParents,
      nChildren: 0,
      parents: parents,
      children: children
    });

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

    skillCount += 1;
  }

  function getParentSkillId(uint _skillId, uint _parentSkillIndex) public view returns (uint256) {
    Skill storage skill = skills[_skillId];
    return skill.parents[_parentSkillIndex];
  }

  function getChildSkillId(uint _skillId, uint _childSkillIndex) public view returns (uint256) {
    Skill storage skill = skills[_skillId];
    return skill.children[_childSkillIndex];
  }

  function appendReputationUpdateLog(address _user, int _amount, uint _skillId)
  calledByColony
  skillExists(_skillId)
  {
    uint reputationUpdateLogLength = ReputationUpdateLog.length;
    uint nPreviousUpdates = 0;
    if (reputationUpdateLogLength > 0) {
      nPreviousUpdates = ReputationUpdateLog[reputationUpdateLogLength-1].nPreviousUpdates + ReputationUpdateLog[reputationUpdateLogLength-1].nUpdates;
    }
    uint nUpdates = (skills[_skillId].nParents + 1) * 2;
    if (_amount < 0) {
      //TODO: Never true currently. _amount needs to be an int.
      nUpdates += 2 * skills[_skillId].nChildren;
    }
    ReputationUpdateLog.push(ReputationLogEntry(_user, _amount, _skillId, msg.sender, nUpdates, nPreviousUpdates));
  }

  function getReputationUpdateLogLength() view returns (uint) {
    return ReputationUpdateLog.length;
  }

}
