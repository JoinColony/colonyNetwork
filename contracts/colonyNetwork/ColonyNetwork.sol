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

pragma solidity 0.8.21;
pragma experimental "ABIEncoderV2";

import "./../common/BasicMetaTransaction.sol";
import "./../reputationMiningCycle/IReputationMiningCycle.sol";
import "./ColonyNetworkStorage.sol";
import "./../common/Multicall.sol";


contract ColonyNetwork is BasicMetaTransaction, ColonyNetworkStorage, Multicall {

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

  function setBridgeData(address bridgeAddress, bytes memory updateLogBefore, bytes memory updateLogAfter, uint256 gas, uint256 chainId, bytes memory skillCreationBefore, bytes memory skillCreationAfter, bytes memory setReputationRootHashBefore, bytes memory setReputationRootHashAfter) public
  always
  {
    require(msgSender() == metaColony, "colony-network-not-metacolony");
    if (!isMiningChain()) {
      miningBridgeAddress = bridgeAddress;
    }
    bridgeData[bridgeAddress] = Bridge(updateLogBefore, updateLogAfter, gas, chainId, skillCreationBefore, skillCreationAfter, setReputationRootHashBefore, setReputationRootHashAfter);
    if (networkSkillCounts[chainId] == 0) {
      networkSkillCounts[chainId] = chainId << 128;
    }
    // emit BridgeDataSet
  }

  function getBridgeData(address bridgeAddress) public view returns (Bridge memory) {
    return bridgeData[bridgeAddress];
  }

  function getMiningBridgeAddress() public view returns (address) {
    return miningBridgeAddress;
  }

  function initialise(address _resolver, uint256 _version) public
  stoppable
  auth
  {
    require(currentColonyVersion == 0, "colony-network-already-initialised");
    require(_version > 0, "colony-network-invalid-version");
    colonyVersionResolver[_version] = _resolver;
    currentColonyVersion = _version;

    if (!isMiningChain()){
      skillCount = getChainId() << 128;
    }

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
    addSkillToChainTree(_parentSkillId, skillCount);

    if (!isMiningChain()) {
      bridgeSkill(skillCount);
    }

    emit SkillAdded(skillCount, _parentSkillId);
    return skillCount;
  }

  function bridgeSkill(uint256 _skillId) public stoppable onlyNotMiningChain skillExists(_skillId) {
    // Send bridge transaction
    // Build the transaction we're going to send to the bridge to register the
    // creation of this skill on the home chain

    bytes memory payload = abi.encodePacked(
      bridgeData[miningBridgeAddress].skillCreationBefore,
      abi.encodeWithSignature("addSkillFromBridge(uint256,uint256)", skills[_skillId].parents.length == 0 ? (getChainId() << 128) : skills[_skillId].parents[0], _skillId),
      bridgeData[miningBridgeAddress].skillCreationAfter
    );

    // TODO: If there's no contract there, I think this currently succeeds (when we wouldn't want it to)
    (bool success, bytes memory returnData) = miningBridgeAddress.call(payload);
    require(success, "colony-network-unable-to-bridge-skill-creation");
  }

  function addSkillToChainTree(uint256 _parentSkillId, uint256 _skillId) private {

    Skill storage parentSkill = skills[_parentSkillId];
    // Global and local skill trees are kept separate
    require(_parentSkillId == 0 || !parentSkill.globalSkill, "colony-global-and-local-skill-trees-are-separate");

    Skill memory s;
    if (_parentSkillId != 0) {

      s.nParents = parentSkill.nParents + 1;
      skills[_skillId] = s;

      uint parentSkillId = _parentSkillId;
      bool notAtRoot = true;
      uint powerOfTwo = 1;
      uint treeWalkingCounter = 1;

      // Walk through the tree parent skills up to the root
      while (notAtRoot) {
        // Add the new skill to each parent children
        parentSkill.children.push(_skillId);
        parentSkill.nChildren += 1;

        // When we are at an integer power of two steps away from the newly added skill (leaf) node,
        // add the current parent skill to the new skill's parents array
        if (treeWalkingCounter == powerOfTwo) {
          // slither-disable-next-line controlled-array-length
          skills[_skillId].parents.push(parentSkillId);
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
      require(isMiningChain(), "colony-network-not-mining-chain");
      s.globalSkill = true;
      skills[_skillId] = s;
    }
  }

  function addSkillFromBridge(uint256 _parentSkillId, uint256 _skillId) public always onlyMiningChain() {
    // Require is a known bridge
    Bridge storage bridge = bridgeData[msgSender()];
    require(bridge.chainId != 0, "colony-network-not-known-bridge");

    // Check skill count - if not next, then store for later.
    if (networkSkillCounts[bridge.chainId] + 1 == _skillId){
      if (_parentSkillId > bridge.chainId << 128){
        addSkillToChainTree(_parentSkillId, _skillId);
      }
      networkSkillCounts[bridge.chainId] += 1;
      emit SkillAdded(_skillId, _parentSkillId);
    } else if (networkSkillCounts[bridge.chainId] < _skillId){
      pendingSkillAdditions[bridge.chainId][_skillId] = _parentSkillId;
      // TODO: Event?
    }
  }

  function getPendingSkillAddition(uint256 _chainId, uint256 _skillCount) public view returns (uint256){
    return pendingSkillAdditions[_chainId][_skillCount];
  }

  function getBridgeSkillCounts(uint256 _chainId) public view returns (uint256){
    return networkSkillCounts[_chainId];
  }

  function addPendingSkillFromBridge(address _bridgeAddress, uint256 _skillId) public always onlyMiningChain() {
    Bridge storage bridge = bridgeData[_bridgeAddress];
    require(bridge.chainId != 0, "colony-network-not-known-bridge");

    // Require that specified skill is next
    require(networkSkillCounts[bridge.chainId] + 1 == _skillId, "colony-network-not-next-bridged-skill");

    // TODO: Require skill from right bridge

    uint256 parentSkillId = pendingSkillAdditions[bridge.chainId][_skillId];
    require(parentSkillId != 0, "colony-network-no-such-bridged-skill");
    if (parentSkillId > bridge.chainId << 128){
      addSkillToChainTree(parentSkillId, _skillId);
    }
    networkSkillCounts[bridge.chainId] += 1;

    // Delete the pending addition
    pendingSkillAdditions[bridge.chainId][_skillId] = 0;
    emit SkillAdded(_skillId, parentSkillId);
  }

  function getParentSkillId(uint _skillId, uint _parentSkillIndex) public view returns (uint256) {
    return ascendSkillTree(_skillId, _parentSkillIndex + 1);
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

  function deprecateSkill(uint256 _skillId, bool _deprecated) public stoppable
  allowedToAddSkill(skills[_skillId].nParents == 0)
  returns (bool)
  {
    bool changed = skills[_skillId].deprecated != _deprecated;
    skills[_skillId].deprecated = _deprecated;
    return changed;
  }

  /// @notice @deprecated
  function deprecateSkill(uint256 _skillId) public stoppable {
    deprecateSkill(_skillId, true);
  }

  function initialiseRootLocalSkill() public
  stoppable
  calledByColony
  returns (uint256)
  {
    skillCount += 1;
    if (!isMiningChain()){
      bridgeSkill(skillCount);
    }
    return skillCount;
  }

  function appendReputationUpdateLogFromBridge(address _colony, address _user, int _amount, uint _skillId) public onlyMiningChain stoppable
  {
    // Require is a known bridge
    require(bridgeData[msgSender()].chainId != 0, "colony-network-not-known-bridge");

    require(networkSkillCounts[_skillId >> 128] >= _skillId, "colony-network-invalid-skill-id");
    require(bridgeData[msgSender()].chainId == _skillId >> 128, "colony-network-invalid-skill-id-for-bridge");

    uint128 nParents = skills[_skillId].nParents;
    // We only update child skill reputation if the update is negative, otherwise just set nChildren to 0 to save gas
    uint128 nChildren = _amount < 0 ? skills[_skillId].nChildren : 0;

    IReputationMiningCycle(inactiveReputationMiningCycle).appendReputationUpdateLog(
      _user,
      _amount,
      _skillId,
      _colony,
      nParents,
      nChildren
    );
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

    if (isMiningChain()) {
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
    } else {
      // Send transaction to bridge.
      // Call appendReputationUpdateLogFromBridge on metacolony on xdai
      // TODO: Maybe force to be set on deployment?
      require(miningBridgeAddress != address(0x0), "colony-network-foreign-bridge-not-set");
      // require(bridgeData[bridgeAddress].chainId == MINING_CHAIN_ID, "colony-network-foreign-bridge-not-set-correctly");
      // Build the transaction we're going to send to the bridge
      bytes memory payload = abi.encodePacked(
        bridgeData[miningBridgeAddress].updateLogBefore,
        abi.encodeWithSignature("appendReputationUpdateLogFromBridge(address,address,int256,uint256)", msgSender(), _user, _amount, _skillId),
        bridgeData[miningBridgeAddress].updateLogAfter
      );
      (bool success, ) = miningBridgeAddress.call(payload);
      // TODO: Do we care about success here? (probably not)
    }
  }

  function checkNotAdditionalProtectedVariable(uint256 _slot) public view { // solhint-disable-line no-empty-blocks
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

  function getMetatransactionNonce(address _user) override public view returns (uint256 nonce){
    return metatransactionNonces[_user];
  }

  function setPayoutWhitelist(address _token, bool _status) public stoppable
  calledByMetaColony
  {
    payoutWhitelist[_token] = _status;

    emit TokenWhitelisted(_token, _status);
  }

  function getPayoutWhitelist(address _token) public view returns (bool) {
    return payoutWhitelist[_token];
  }

  function incrementMetatransactionNonce(address _user) override internal {
    // We need to protect the metatransaction nonce slots, otherwise those with recovery
    // permissions could replay metatransactions, which would be a disaster.
    // What slot are we setting?
    // This mapping is in slot 41 (see ColonyNetworkStorage.sol);
    uint256 slot = uint256(keccak256(abi.encode(uint256(uint160(_user)), uint256(METATRANSACTION_NONCES_SLOT))));
    protectSlot(slot);
    metatransactionNonces[_user] += 1;
  }

  function ascendSkillTree(uint _skillId, uint _parentSkillNumber) internal view returns (uint256) {
    if (_parentSkillNumber == 0) {
      return _skillId;
    }

    Skill storage skill = skills[_skillId];
    for (uint256 i; i < skill.parents.length; i++) {
      if (2**(i+1) > _parentSkillNumber) {
        uint _newSkillId = skill.parents[i];
        uint _newParentSkillNumber = _parentSkillNumber - 2**i;
        return ascendSkillTree(_newSkillId, _newParentSkillNumber);
      }
    }
  }
}
