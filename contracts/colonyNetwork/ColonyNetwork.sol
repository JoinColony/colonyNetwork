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
import "./../colony/ColonyDataTypes.sol";


contract ColonyNetwork is ColonyDataTypes, BasicMetaTransaction, ColonyNetworkStorage, Multicall {

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

<<<<<<< HEAD
||||||| parent of 54020ca1 (First changes following second review)
  function setBridgeData(address bridgeAddress, bytes memory updateLogBefore, bytes memory updateLogAfter, uint256 gas, uint256 chainId, bytes memory skillCreationBefore, bytes memory skillCreationAfter, bytes memory setReputationRootHashBefore, bytes memory setReputationRootHashAfter) public
  always
  calledByMetaColony
  {
    if (!isMiningChain()) {
      miningBridgeAddress = bridgeAddress;
      require(isMiningChainId(chainId), "colony-network-can-only-set-mining-chain-bridge");
    }
    bridgeData[bridgeAddress] = Bridge(updateLogBefore, updateLogAfter, gas, chainId, skillCreationBefore, skillCreationAfter, setReputationRootHashBefore, setReputationRootHashAfter);
    if (networkSkillCounts[chainId] == 0) {
      // Initialise the skill count to match the foreign chain
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

=======
  function setBridgeData(address bridgeAddress, uint256 chainId, uint256 gas, bytes memory updateLogBefore, bytes memory updateLogAfter, bytes memory skillCreationBefore, bytes memory skillCreationAfter, bytes memory setReputationRootHashBefore, bytes memory setReputationRootHashAfter) public
  always
  calledByMetaColony
  {
    if (!isMiningChain()) {
      require(isMiningChainId(chainId), "colony-network-can-only-set-mining-chain-bridge");
      miningBridgeAddress = bridgeAddress;
    }
    bridgeData[bridgeAddress] = Bridge(updateLogBefore, updateLogAfter, gas, chainId, skillCreationBefore, skillCreationAfter, setReputationRootHashBefore, setReputationRootHashAfter);
    if (networkSkillCounts[chainId] == 0) {
      // Initialise the skill count to match the foreign chain
      networkSkillCounts[chainId] = chainId << 128;
    }
    emit BridgeDataSet(bridgeAddress);
  }

  function getBridgeData(address bridgeAddress) public view returns (Bridge memory) {
    return bridgeData[bridgeAddress];
  }

  function getMiningBridgeAddress() public view returns (address) {
    return miningBridgeAddress;
  }

>>>>>>> 54020ca1 (First changes following second review)
  function initialise(address _resolver, uint256 _version) public
  stoppable
  auth
  {
    require(currentColonyVersion == 0, "colony-network-already-initialised");
    require(_version > 0, "colony-network-invalid-version");
    colonyVersionResolver[_version] = _resolver;
    currentColonyVersion = _version;

    if (!isMiningChain()){
      skillCount = toRootSkillId(getChainId());
    }

    emit ColonyNetworkInitialised(_resolver);
  }

  function getColony(uint256 _id) public view returns (address) {
    return colonies[_id];
  }

<<<<<<< HEAD
||||||| parent of 54020ca1 (First changes following second review)
  function addSkill(uint _parentSkillId) public stoppable
  skillExists(_parentSkillId)
  allowedToAddSkill(_parentSkillId == 0)
  returns (uint256)
  {
    skillCount += 1;
    addSkillToChainTree(_parentSkillId, skillCount);

    bridgeSkillIfNotMiningChain(skillCount);

    return skillCount;
  }

  function bridgeSkillIfNotMiningChain(uint256 _skillId) public stoppable skillExists(_skillId) {
    // If we're the mining chain, we don't need to bridge
    if (isMiningChain()){ return; }
    // Send bridge transaction
    // Build the transaction we're going to send to the bridge to register the
    // creation of this skill on the home chain

    uint256 parentSkillId = skills[_skillId].parents.length == 0 ? (getChainId() << 128) : skills[_skillId].parents[0];

    bytes memory payload = abi.encodePacked(
      bridgeData[miningBridgeAddress].skillCreationBefore,
      abi.encodeWithSignature("addSkillFromBridge(uint256,uint256)", parentSkillId, _skillId),
      bridgeData[miningBridgeAddress].skillCreationAfter
    );

    // This succeeds if not set, but we don't want to block e.g. domain creation if that's the situation we're in,
    // and we can re-call this function to bridge later if necessary.
    (bool success, bytes memory returnData) = miningBridgeAddress.call(payload);
    require(success, "colony-network-unable-to-bridge-skill-creation");
  }

  function addSkillToChainTree(uint256 _parentSkillId, uint256 _skillId) private {
    // This indicates a new root local skill bridged from another chain. We don't do anything to the tree
    // in this scenario, other than incrementing
    // (this mirrors the behaviour of not calling addSkill() in initialiseRootLocalSkill)
    if (_parentSkillId != 0 && _parentSkillId << 128 == 0) { return; }

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
      // Add a global skill. Should not be possible on a non-mining chain
      require(isMiningChain(), "colony-network-not-mining-chain");
      s.globalSkill = true;
      skills[_skillId] = s;
    }

    emit SkillAdded(_skillId, _parentSkillId);
  }

  function addSkillFromBridge(uint256 _parentSkillId, uint256 _skillId) public always onlyMiningChain() {
    // Require is a known bridge
    Bridge storage bridge = bridgeData[msgSender()];
    require(bridge.chainId != 0, "colony-network-not-known-bridge");

    // Check skill count - if not next, then store for later.
    if (networkSkillCounts[bridge.chainId] + 1 == _skillId){
      addSkillToChainTree(_parentSkillId, _skillId);
      networkSkillCounts[bridge.chainId] += 1;
    } else if (networkSkillCounts[bridge.chainId] < _skillId){
      pendingSkillAdditions[bridge.chainId][_skillId] = _parentSkillId;
      // TODO: Event?
    }
  }

  function getPendingSkillAddition(uint256 _chainId, uint256 _skillCount) public view returns (uint256){
    return pendingSkillAdditions[_chainId][_skillCount];
  }

  function getBridgedSkillCounts(uint256 _chainId) public view returns (uint256){
    return networkSkillCounts[_chainId];
  }

  function addBridgedPendingSkill(address _bridgeAddress, uint256 _skillId) public always onlyMiningChain() {
    Bridge storage bridge = bridgeData[_bridgeAddress];
    require(bridge.chainId != 0, "colony-network-not-known-bridge");

    // Require that specified skill is next
    // Note this also implicitly checks that the chainId prefix of the skill is correct
    require(networkSkillCounts[bridge.chainId] + 1 == _skillId, "colony-network-not-next-bridged-skill");

    uint256 parentSkillId = pendingSkillAdditions[bridge.chainId][_skillId];
    require(parentSkillId != 0, "colony-network-no-such-bridged-skill");
    addSkillToChainTree(parentSkillId, _skillId);
    networkSkillCounts[bridge.chainId] += 1;

    // Delete the pending addition
    delete pendingSkillAdditions[bridge.chainId][_skillId];
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
    bridgeSkillIfNotMiningChain(skillCount);
    return skillCount;
  }

  function appendReputationUpdateLogFromBridge(address _colony, address _user, int _amount, uint _skillId, uint256 _updateNumber) public onlyMiningChain stoppable
  {
    // Require is a known bridge
    require(bridgeData[msgSender()].chainId != 0, "colony-network-not-known-bridge");

    require(bridgeData[msgSender()].chainId == _skillId >> 128, "colony-network-invalid-skill-id-for-bridge");

    // if next expected update, add to log
    if (
      reputationUpdateCount[bridgeData[msgSender()].chainId][_colony] + 1 == _updateNumber && // It's the next reputation update for this colony
      networkSkillCounts[_skillId >> 128] >= _skillId // Skill has been bridged
    ){
      reputationUpdateCount[bridgeData[msgSender()].chainId][_colony] += 1;
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

    } else {
      // Not next update, store for later
      pendingReputationUpdates[bridgeData[msgSender()].chainId][_colony][_updateNumber] = PendingReputationUpdate(_colony, _user, _amount, _skillId, block.timestamp);
    }
  }

  function bridgePendingReputationUpdate(address _colony, uint256 _updateNumber) public stoppable onlyNotMiningChain {
    // Must be next update
    require(pendingReputationUpdates[getChainId()][_colony][_updateNumber - 1].colony == address(0x00), "colony-network-not-next-pending-update");
    require(pendingReputationUpdates[getChainId()][_colony][_updateNumber].colony != address(0x00), "colony-network-update-does-not-exist");
    PendingReputationUpdate storage pendingUpdate = pendingReputationUpdates[getChainId()][_colony][_updateNumber];

    require(miningBridgeAddress != address(0x0), "colony-network-foreign-bridge-not-set");

    int256 updateAmount = decayReputation(pendingUpdate.amount, pendingUpdate.timestamp);

    // Build the transaction we're going to send to the bridge
    bytes memory payload = abi.encodePacked(
      bridgeData[miningBridgeAddress].updateLogBefore,
      abi.encodeWithSignature("appendReputationUpdateLogFromBridge(address,address,int256,uint256,uint256)", pendingUpdate.colony, pendingUpdate.user, updateAmount, pendingUpdate.skillId, _updateNumber),
      bridgeData[miningBridgeAddress].updateLogAfter
    );

    delete pendingReputationUpdates[getChainId()][_colony][_updateNumber];

    (bool success, ) = miningBridgeAddress.call(payload);
    require(success, "colony-network-bridging-tx-unsuccessful");
  }

  function addBridgedReputationUpdate(uint256 _chainId, address _colony) public stoppable onlyMiningChain {
    uint256 nextUpdateNumber = reputationUpdateCount[_chainId][_colony] + 1;
    // Bridged update must exist
    require(pendingReputationUpdates[_chainId][_colony][nextUpdateNumber].colony != address(0x00), "colony-network-next-update-does-not-exist");
    // It should be the next one
    assert(pendingReputationUpdates[_chainId][_colony][nextUpdateNumber - 1].colony == address(0x00));

    PendingReputationUpdate storage pendingUpdate = pendingReputationUpdates[_chainId][_colony][nextUpdateNumber];

    // Skill creation must have been bridged
    require(networkSkillCounts[pendingUpdate.skillId >> 128] >= pendingUpdate.skillId, "colony-network-invalid-skill-id");

    uint128 nParents = skills[pendingUpdate.skillId].nParents;
    // We only update child skill reputation if the update is negative, otherwise just set nChildren to 0 to save gas
    uint128 nChildren = pendingUpdate.amount < 0 ? skills[pendingUpdate.skillId].nChildren : 0;

    int256 updateAmount = decayReputation(pendingUpdate.amount, pendingUpdate.timestamp);

    reputationUpdateCount[_chainId][_colony] +=1;
    address user = pendingUpdate.user;
    uint256 skillId = pendingUpdate.skillId;
    delete pendingReputationUpdates[_chainId][_colony][nextUpdateNumber];

    IReputationMiningCycle(inactiveReputationMiningCycle).appendReputationUpdateLog(
      user,
      updateAmount,
      skillId,
      _colony,
      nParents,
      nChildren
    );
  }

  function getPendingReputationUpdate(uint256 _chainId, address _colony, uint256 _updateNumber) public view onlyMiningChain returns (PendingReputationUpdate memory) {
    return pendingReputationUpdates[_chainId][_colony][_updateNumber];
  }

  function getBridgedReputationUpdateCount(uint256 _chainId, address _colony) public view returns (uint256) {
    return reputationUpdateCount[_chainId][_colony];
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

      reputationUpdateCount[getChainId()][msgSender()] += 1;
      // require(bridgeData[bridgeAddress].chainId == MINING_CHAIN_ID, "colony-network-foreign-bridge-not-set-correctly");
      // Build the transaction we're going to send to the bridge
      bytes memory payload = abi.encodePacked(
        bridgeData[miningBridgeAddress].updateLogBefore,
        abi.encodeWithSignature("appendReputationUpdateLogFromBridge(address,address,int256,uint256,uint256)", msgSender(), _user, _amount, _skillId, reputationUpdateCount[getChainId()][msgSender()]),
        bridgeData[miningBridgeAddress].updateLogAfter
      );
      (bool success, ) = miningBridgeAddress.call(payload);
      if (!success || !isContract(miningBridgeAddress)) {
        // Store to resend later
        pendingReputationUpdates[getChainId()][msgSender()][reputationUpdateCount[getChainId()][msgSender()]] = PendingReputationUpdate(msgSender(), _user, _amount, _skillId, block.timestamp);
      }
      // TODO: How do we emit events here?
    }
  }

=======
  function addSkill(uint _parentSkillId) public stoppable
  skillExists(_parentSkillId)
  allowedToAddSkill(_parentSkillId == 0)
  returns (uint256)
  {
    skillCount += 1;
    addSkillToChainTree(_parentSkillId, skillCount);

    bridgeSkillIfNotMiningChain(skillCount);

    return skillCount;
  }

  function bridgeSkillIfNotMiningChain(uint256 _skillId) public stoppable skillExists(_skillId) {
    // If we're the mining chain, we don't need to bridge
    if (isMiningChain()){ return; }
    // Send bridge transaction
    // Build the transaction we're going to send to the bridge to register the
    // creation of this skill on the home chain

    uint256 parentSkillId = skills[_skillId].parents.length == 0 ? (getChainId() << 128) : skills[_skillId].parents[0];

    bytes memory payload = abi.encodePacked(
      bridgeData[miningBridgeAddress].skillCreationBefore,
      abi.encodeWithSignature("addSkillFromBridge(uint256,uint256)", parentSkillId, _skillId),
      bridgeData[miningBridgeAddress].skillCreationAfter
    );

    // This succeeds if not set, but we don't want to block e.g. domain creation if that's the situation we're in,
    // and we can re-call this function to bridge later if necessary.
    (bool success, bytes memory returnData) = miningBridgeAddress.call(payload);
    require(success, "colony-network-unable-to-bridge-skill-creation");
  }

  function addSkillToChainTree(uint256 _parentSkillId, uint256 _skillId) private {
    // This indicates a new root local skill bridged from another chain. We don't do anything to the tree
    // in this scenario, other than incrementing
    // (this mirrors the behaviour of not calling addSkill() in initialiseRootLocalSkill)
    if (_parentSkillId != 0 && _parentSkillId << 128 == 0) { return; }

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
      // Add a global skill. Should not be possible on a non-mining chain
      require(isMiningChain(), "colony-network-not-mining-chain");
      s.globalSkill = true;
      skills[_skillId] = s;
    }

    emit SkillAdded(_skillId, _parentSkillId);
  }

  function addSkillFromBridge(uint256 _parentSkillId, uint256 _skillId) public always onlyMiningChain() {
    // Require is a known bridge
    uint256 bridgeChainId = bridgeData[msgSender()].chainId;
    require(bridgeChainId != 0, "colony-network-not-known-bridge");

    // Check skill count - if not next, then store for later.
    if (networkSkillCounts[bridgeChainId] + 1 == _skillId){
      addSkillToChainTree(_parentSkillId, _skillId);
      networkSkillCounts[bridgeChainId] += 1;
    } else if (networkSkillCounts[bridgeChainId] < _skillId){
      pendingSkillAdditions[bridgeChainId][_skillId] = _parentSkillId;
      // TODO: Event?
    }
  }

  function getPendingSkillAddition(uint256 _chainId, uint256 _skillCount) public view returns (uint256){
    return pendingSkillAdditions[_chainId][_skillCount];
  }

  function getBridgedSkillCounts(uint256 _chainId) public view returns (uint256){
    return networkSkillCounts[_chainId];
  }

  function addBridgedPendingSkill(address _bridgeAddress, uint256 _skillId) public always onlyMiningChain() {
    uint256 bridgeChainId = bridgeData[_bridgeAddress].chainId;
    require(bridgeChainId != 0, "colony-network-not-known-bridge");

    // Require that specified skill is next
    // Note this also implicitly checks that the chainId prefix of the skill is correct
    require(networkSkillCounts[bridgeChainId] + 1 == _skillId, "colony-network-not-next-bridged-skill");

    uint256 parentSkillId = pendingSkillAdditions[bridgeChainId][_skillId];
    require(parentSkillId != 0, "colony-network-no-such-bridged-skill");
    addSkillToChainTree(parentSkillId, _skillId);
    networkSkillCounts[bridgeChainId] += 1;

    // Delete the pending addition
    delete pendingSkillAdditions[bridgeChainId][_skillId];
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
    bridgeSkillIfNotMiningChain(skillCount);
    return skillCount;
  }

  function appendReputationUpdateLogFromBridge(address _colony, address _user, int256 _amount, uint256 _skillId, uint256 _updateNumber) public onlyMiningChain stoppable
  {
    // Require is a known bridge
    uint256 bridgeChainId = bridgeData[msgSender()].chainId;

    require(bridgeChainId != 0, "colony-network-not-known-bridge");

    require(bridgeChainId == _skillId >> 128, "colony-network-invalid-skill-id-for-bridge");

    // if next expected update, add to log
    if (
      reputationUpdateCount[bridgeChainId][_colony] + 1 == _updateNumber && // It's the next reputation update for this colony
      networkSkillCounts[_skillId >> 128] >= _skillId // Skill has been bridged
    ){
      reputationUpdateCount[bridgeChainId][_colony] += 1;
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

    } else {
      // Not next update, store for later
      pendingReputationUpdates[bridgeChainId][_colony][_updateNumber] = PendingReputationUpdate(_user, _amount, _skillId, _colony, block.timestamp);
    }
  }

  function bridgePendingReputationUpdate(address _colony, uint256 _updateNumber) public stoppable onlyNotMiningChain {
    // Must be next update
    require(pendingReputationUpdates[getChainId()][_colony][_updateNumber - 1].colony == address(0x00), "colony-network-not-next-pending-update");
    require(pendingReputationUpdates[getChainId()][_colony][_updateNumber].colony != address(0x00), "colony-network-update-does-not-exist");
    PendingReputationUpdate storage pendingUpdate = pendingReputationUpdates[getChainId()][_colony][_updateNumber];

    require(miningBridgeAddress != address(0x0), "colony-network-foreign-bridge-not-set");

    int256 updateAmount = decayReputation(pendingUpdate.amount, pendingUpdate.timestamp);

    // Build the transaction we're going to send to the bridge
    bytes memory payload = abi.encodePacked(
      bridgeData[miningBridgeAddress].updateLogBefore,
      abi.encodeWithSignature("appendReputationUpdateLogFromBridge(address,address,int256,uint256,uint256)", pendingUpdate.colony, pendingUpdate.user, updateAmount, pendingUpdate.skillId, _updateNumber),
      bridgeData[miningBridgeAddress].updateLogAfter
    );

    delete pendingReputationUpdates[getChainId()][_colony][_updateNumber];

    (bool success, ) = miningBridgeAddress.call(payload);
    require(success, "colony-network-bridging-tx-unsuccessful");
  }

  function addBridgedReputationUpdate(uint256 _chainId, address _colony) public stoppable onlyMiningChain {
    uint256 mostRecentUpdateNumber = reputationUpdateCount[_chainId][_colony];
    PendingReputationUpdate storage pendingUpdate = pendingReputationUpdates[_chainId][_colony][mostRecentUpdateNumber + 1];

    // Bridged update must exist
    require(pendingUpdate.colony != address(0x00), "colony-network-next-update-does-not-exist");
    // It should be the next one
    assert(pendingReputationUpdates[_chainId][_colony][mostRecentUpdateNumber].colony == address(0x00));

    // Skill creation must have been bridged
    require(networkSkillCounts[pendingUpdate.skillId >> 128] >= pendingUpdate.skillId, "colony-network-invalid-skill-id");

    uint128 nParents = skills[pendingUpdate.skillId].nParents;
    // We only update child skill reputation if the update is negative, otherwise just set nChildren to 0 to save gas
    uint128 nChildren = pendingUpdate.amount < 0 ? skills[pendingUpdate.skillId].nChildren : 0;

    int256 updateAmount = decayReputation(pendingUpdate.amount, pendingUpdate.timestamp);

    reputationUpdateCount[_chainId][_colony] += 1;
    address user = pendingUpdate.user;
    uint256 skillId = pendingUpdate.skillId;
    delete pendingReputationUpdates[_chainId][_colony][mostRecentUpdateNumber + 1];

    IReputationMiningCycle(inactiveReputationMiningCycle).appendReputationUpdateLog(
      user,
      updateAmount,
      skillId,
      _colony,
      nParents,
      nChildren
    );
  }

  function getPendingReputationUpdate(uint256 _chainId, address _colony, uint256 _updateNumber) public view onlyMiningChain returns (PendingReputationUpdate memory) {
    return pendingReputationUpdates[_chainId][_colony][_updateNumber];
  }

  function getBridgedReputationUpdateCount(uint256 _chainId, address _colony) public view returns (uint256) {
    return reputationUpdateCount[_chainId][_colony];
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

      reputationUpdateCount[getChainId()][msgSender()] += 1;
      // require(bridgeData[bridgeAddress].chainId == MINING_CHAIN_ID, "colony-network-foreign-bridge-not-set-correctly");
      // Build the transaction we're going to send to the bridge
      bytes memory payload = abi.encodePacked(
        bridgeData[miningBridgeAddress].updateLogBefore,
        abi.encodeWithSignature("appendReputationUpdateLogFromBridge(address,address,int256,uint256,uint256)", msgSender(), _user, _amount, _skillId, reputationUpdateCount[getChainId()][msgSender()]),
        bridgeData[miningBridgeAddress].updateLogAfter
      );
      (bool success, ) = miningBridgeAddress.call(payload);
      if (!success || !isContract(miningBridgeAddress)) {
        // Store to resend later
        pendingReputationUpdates[getChainId()][msgSender()][reputationUpdateCount[getChainId()][msgSender()]] = PendingReputationUpdate(_user, _amount, _skillId, msgSender(), block.timestamp);
      }
      // TODO: How do we emit events here?
    }
  }

>>>>>>> 54020ca1 (First changes following second review)
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
}
