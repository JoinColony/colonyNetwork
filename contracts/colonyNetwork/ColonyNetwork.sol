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

pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";

import "./../common/EtherRouter.sol";
import "./../common/ERC20Extended.sol";
import "./../common/BasicMetaTransaction.sol";
import "./../colony/ColonyAuthority.sol";
import "./../colony/IColony.sol";
import "./../colony/IMetaColony.sol";
import "./../reputationMiningCycle/IReputationMiningCycle.sol";
import "./ColonyNetworkStorage.sol";


contract ColonyNetwork is BasicMetaTransaction, ColonyNetworkStorage {
  // Meta Colony allowed to manage Global skills
  // All colonies are able to manage their Local (domain associated) skills
  modifier allowedToAddSkill(bool globalSkill) {
    if (globalSkill) {
      require(msgSender() == metaColony, "colony-must-be-meta-colony");
    } else {
      require(_isColony[msgSender()] || msgSender() == address(this), "colony-caller-must-be-colony");
    }
    _;
  }

  modifier skillExists(uint skillId) {
    require(skillCount >= skillId, "colony-invalid-skill-id");
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

  function getColonyCount() public view returns (uint256) {
    return colonyCount;
  }

  function getSkillCount() public view returns (uint256) {
    return skillCount;
  }

  function getReputationMiningSkillId() public view returns (uint256) {
    return reputationMiningSkillId;
  }

  function getColonyVersionResolver(uint256 _version) public view returns (address) {
    return colonyVersionResolver[_version];
  }

  function getSkill(uint256 _skillId) public view returns (Skill memory skill) {
    skill = skills[_skillId];
  }

  function getReputationRootHash() public view returns (bytes32) {
    return reputationRootHash;
  }

  function getReputationRootHashNLeaves() public view returns (uint256) {
    return reputationRootHashNLeaves;
  }

  function getReputationRootHashNNodes() public view returns (uint256) {
    return reputationRootHashNLeaves;
  }

  function setTokenLocking(address _tokenLocking) public
  stoppable
  auth
  {
    require(_tokenLocking != address(0x0), "colony-token-locking-cannot-be-zero");

    // Token locking address can't be changed
    require(tokenLocking == address(0x0), "colony-token-locking-address-already-set");

    tokenLocking = _tokenLocking;

    emit TokenLockingAddressSet(_tokenLocking);
  }

  function getTokenLocking() public view returns (address) {
    return tokenLocking;
  }

  function createMetaColony(address _tokenAddress) public
  stoppable
  auth
  {
    require(metaColony == address(0x0), "colony-meta-colony-exists-already");

    metaColony = createColony(_tokenAddress, currentColonyVersion, "", "");

    // Add the special mining skill
    reputationMiningSkillId = this.addSkill(skillCount);

    emit MetaColonyCreated(metaColony, _tokenAddress, skillCount);
  }

  // DEPRECATED, only deploys version 3 colonies.
  function createColony(address _tokenAddress) public
  stoppable
  returns (address)
  {
    return createColony(_tokenAddress, 3, "", "");
  }

  // DEPRECATED, only deploys version 4 colonies.
  function createColony(
    address _tokenAddress,
    uint256 _version, // solhint-disable-line no-unused-vars
    string memory _colonyName,
    string memory _orbitdb, // solhint-disable-line no-unused-vars
    bool _useExtensionManager // solhint-disable-line no-unused-vars
  ) public stoppable returns (address)
  {
    return createColony(_tokenAddress, 4, _colonyName, "");
  }

  function createColony(
    address _tokenAddress,
    uint256 _version,
    string memory _colonyName
  ) public stoppable returns (address)
  {
    return createColony(_tokenAddress, _version, _colonyName, "");
  }

  function createColony(
    address _tokenAddress,
    uint256 _version,
    string memory _colonyName,
    string memory _metadata
  ) public stoppable returns (address)
  {
    uint256 version = (_version == 0) ? currentColonyVersion : _version;
    address colonyAddress = deployColony(_tokenAddress, version);

    if (bytes(_colonyName).length > 0) {
      IColony(colonyAddress).registerColonyLabel(_colonyName, "");
    }

    if (keccak256(abi.encodePacked(_metadata)) != keccak256(abi.encodePacked(""))) {
      IColony(colonyAddress).editColony(_metadata);
    }

    setFounderPermissions(colonyAddress);

    return colonyAddress;
  }

  function addColonyVersion(uint _version, address _resolver) public
  always
  calledByMetaColony
  {
    require(currentColonyVersion > 0, "colony-network-not-intialised-cannot-add-colony-version");

    colonyVersionResolver[_version] = _resolver;
    if (_version > currentColonyVersion) {
      currentColonyVersion = _version;
    }

    emit ColonyVersionAdded(_version, _resolver);
  }

  function initialise(address _resolver, uint256 _version) public
  stoppable
  auth
  {
    require(currentColonyVersion == 0, "colony-network-already-initialised");
    require(_version > 0, "colony-network-invalid-version");
    colonyVersionResolver[_version] = _resolver;
    currentColonyVersion = _version;

    emit ColonyNetworkInitialised(_resolver);
  }

  function getColony(uint256 _id) public view returns (address) {
    return colonies[_id];
  }

  function addSkill(uint _parentSkillId) public stoppable
  skillExists(_parentSkillId)
  allowedToAddSkill(_parentSkillId == 0)
  returns (uint256)
  {
    skillCount += 1;

    Skill storage parentSkill = skills[_parentSkillId];
    // Global and local skill trees are kept separate
    require(_parentSkillId == 0 || !parentSkill.globalSkill, "colony-global-and-local-skill-trees-are-separate");

    Skill memory s;
    if (_parentSkillId != 0) {

      s.nParents = parentSkill.nParents + 1;
      skills[skillCount] = s;

      uint parentSkillId = _parentSkillId;
      bool notAtRoot = true;
      uint powerOfTwo = 1;
      uint treeWalkingCounter = 1;

      // Walk through the tree parent skills up to the root
      while (notAtRoot) {
        // Add the new skill to each parent children
        parentSkill.children.push(skillCount);
        parentSkill.nChildren += 1;

        // When we are at an integer power of two steps away from the newly added skill (leaf) node,
        // add the current parent skill to the new skill's parents array
        if (treeWalkingCounter == powerOfTwo) {
          // slither-disable-next-line controlled-array-length
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
    } else {
      // Add a global skill
      s.globalSkill = true;
      skills[skillCount] = s;
    }

    emit SkillAdded(skillCount, _parentSkillId);
    return skillCount;
  }

  function getParentSkillId(uint _skillId, uint _parentSkillIndex) public view returns (uint256) {
    return ascendSkillTree(_skillId, add(_parentSkillIndex,1));
  }

  function getChildSkillId(uint _skillId, uint _childSkillIndex) public view returns (uint256) {
    if (_childSkillIndex == UINT256_MAX) {
      return _skillId;
    } else {
      Skill storage skill = skills[_skillId];
      require(_childSkillIndex < skill.children.length, "colony-network-out-of-range-child-skill-index");
      return skill.children[_childSkillIndex];
    }
  }

  function deprecateSkill(uint256 _skillId) public stoppable
  allowedToAddSkill(true)
  {
    skills[_skillId].deprecated = true;
  }

  function appendReputationUpdateLog(address _user, int _amount, uint _skillId) public
  stoppable
  calledByColony
  skillExists(_skillId)
  {
    if (_amount == 0 || _user == address(0x0)) {
      // We short-circut amount=0 as it has no effect to save gas, and we ignore Address Zero because it will
      // mess up the tracking of the total amount of reputation in a colony, as that's the key that it's
      // stored under in the patricia/merkle tree. Colonies can still pay tokens out to it if they want,
      // it just won't earn reputation.
      return;
    }

    uint128 nParents = skills[_skillId].nParents;
    // We only update child skill reputation if the update is negative, otherwise just set nChildren to 0 to save gas
    uint128 nChildren = _amount < 0 ? skills[_skillId].nChildren : 0;
    IReputationMiningCycle(inactiveReputationMiningCycle).appendReputationUpdateLog(
      _user,
      _amount,
      _skillId,
      msgSender(),
      nParents,
      nChildren
    );
  }

  function checkNotAdditionalProtectedVariable(uint256 _slot) public view recovery { // solhint-disable-line no-empty-blocks
  }

  function getFeeInverse() public view returns (uint256 _feeInverse) {
    return feeInverse;
  }

  function setFeeInverse(uint256 _feeInverse) public stoppable
  calledByMetaColony
  {
    require(_feeInverse > 0, "colony-network-fee-inverse-cannot-be-zero");
    feeInverse = _feeInverse;

    emit NetworkFeeInverseSet(_feeInverse);
  }

  function getPayoutWhitelist(address _token) public view returns (bool) {
    return payoutWhitelist[_token];
  }

  function setPayoutWhitelist(address _token, bool _status) public stoppable
  calledByMetaColony
  {
    payoutWhitelist[_token] = _status;

    emit TokenWhitelisted(_token, _status);
  }

  function getMetatransactionNonce(address _user) override public view returns (uint256 nonce){
    return metatransactionNonces[_user];
  }

  function incrementMetatransactionNonce(address _user) override internal {
    // We need to protect the metatransaction nonce slots, otherwise those with recovery
    // permissions could replay metatransactions, which would be a disaster.
    // What slot are we setting?
    // This mapping is in slot 41 (see ColonyNetworkStorage.sol);
    uint256 slot = uint256(keccak256(abi.encode(uint256(_user), uint256(METATRANSACTION_NONCES_SLOT))));
    protectSlot(slot);
    metatransactionNonces[_user] = add(metatransactionNonces[_user], 1);
  }

  function deployColony(address _tokenAddress, uint256 _version) internal returns (address) {
    require(_tokenAddress != address(0x0), "colony-token-invalid-address");
    require(colonyVersionResolver[_version] != address(0x00), "colony-network-invalid-version");

    EtherRouter etherRouter = new EtherRouter();
    IColony colony = IColony(address(etherRouter));

    address resolverForColonyVersion = colonyVersionResolver[_version]; // ignore-swc-107
    etherRouter.setResolver(resolverForColonyVersion); // ignore-swc-113

    // Creating new instance of colony's authority
    ColonyAuthority colonyAuthority = new ColonyAuthority(address(colony));

    DSAuth dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(colonyAuthority);

    colonyAuthority.setOwner(address(etherRouter));

    // Initialise the root (domain) local skill with defaults by just incrementing the skillCount
    skillCount += 1;
    colonyCount += 1;
    colonies[colonyCount] = address(colony);
    _isColony[address(colony)] = true;

    colony.initialiseColony(address(this), _tokenAddress);

    emit ColonyAdded(colonyCount, address(etherRouter), _tokenAddress);

    return address(etherRouter);
  }

  function setFounderPermissions(address _colonyAddress) internal {
    require(DSAuth(_colonyAddress).owner() == address(this), "colony-network-not-colony-owner");

    // Assign all permissions in root domain
    IColony colony = IColony(_colonyAddress);
    colony.setRecoveryRole(msgSender());
    colony.setRootRole(msgSender(), true);
    colony.setArbitrationRole(1, UINT256_MAX, msgSender(), 1, true);
    colony.setArchitectureRole(1, UINT256_MAX, msgSender(), 1, true);
    colony.setFundingRole(1, UINT256_MAX, msgSender(), 1, true);
    colony.setAdministrationRole(1, UINT256_MAX, msgSender(), 1, true);

    // Colony will not have owner
    DSAuth dsauth = DSAuth(_colonyAddress);
    dsauth.setOwner(address(0x0));
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
