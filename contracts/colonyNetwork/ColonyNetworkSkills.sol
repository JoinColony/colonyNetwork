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

pragma solidity 0.8.23;
pragma experimental "ABIEncoderV2";

import "./../reputationMiningCycle/IReputationMiningCycle.sol";
import "./../common/Multicall.sol";
import "./ColonyNetworkStorage.sol";

contract ColonyNetworkSkills is ColonyNetworkStorage, Multicall {
  event Debug(bytes);
  event Debug2(bool, bytes);
  event Debug3(address);

  function addSkill(
    uint _parentSkillId
  ) public stoppable skillExists(_parentSkillId) allowedToAddSkill returns (uint256) {
    require(_parentSkillId > 0, "colony-network-invalid-parent-skill");
    skillCount += 1;
    // skillId = skillCount;
    // uint256 skillId;
    // if (isMiningChain()) {
    //   skillId = skillCount;
    // } else {
    //   skillId = (getChainId() << 128) + skillCount;
    // }

    addSkillToChainTree(_parentSkillId, skillCount);

    if (!isMiningChain()) {
      bridgeSkill(skillCount);
      skills[skillCount].createdOnNonMiningChain = true;
    }

    emit SkillAdded(skillCount, _parentSkillId);
    return skillCount;
  }

  function bridgeSkill(uint256 _skillId) public stoppable onlyNotMiningChain skillExists(_skillId) {
    // Send bridge transaction
    // Build the transaction we're going to send to the bridge to register the
    // creation of this skill on the home chain

    // skillId = uint256(abi.encodePacked(uint128(getChainId()), uint128(skillCount)));

    bytes memory payload = abi.encodePacked(
      bridgeData[bridgeAddressList[address(0x0)]].skillCreationBefore,
      abi.encodeWithSignature("addSkillFromBridge(uint256,uint256)", skills[_skillId].parents.length == 0 ? (getChainId() << 128) : skills[_skillId].parents[0], _skillId),
      bridgeData[bridgeAddressList[address(0x0)]].skillCreationAfter
    );
    emit Debug(payload);
    emit Debug3(bridgeAddressList[address(0x0)]);
    // TODO: If there's no contract there, I think this currently succeeds (when we wouldn't want it to)
    (bool success, bytes memory returnData) = bridgeAddressList[address(0x0)].call(payload);
    emit Debug2(success, returnData);
    require(success, "colony-network-unable-to-bridge-skill-creation");
  }

  function addSkillToChainTree(uint256 _parentSkillId, uint256 _skillId) private {

    Skill storage parentSkill = skills[_parentSkillId];
    require(!parentSkill.DEPRECATED_globalSkill, "colony-network-no-global-skills");

    skillCount += 1;
    Skill memory s;

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
        powerOfTwo = powerOfTwo * 2;
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
  }

  function ascendSkillTree(uint _skillId, uint _parentSkillNumber) internal view returns (uint256) {
    if (_parentSkillNumber == 0) {
      return _skillId;
    }

    Skill storage skill = skills[_skillId];
    for (uint256 i; i < skill.parents.length; i++) {
      if (2 ** (i + 1) > _parentSkillNumber) {
        uint _newSkillId = skill.parents[i];
        uint _newParentSkillNumber = _parentSkillNumber - 2 ** i;
        return ascendSkillTree(_newSkillId, _newParentSkillNumber);
      }
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
    // TODO: Add bridge should initialise this value

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
      require(
        _childSkillIndex < skill.children.length,
        "colony-network-out-of-range-child-skill-index"
      );
      return skill.children[_childSkillIndex];
    }
  }

  function deprecateSkill(
    uint256 _skillId,
    bool _deprecated
  ) public stoppable allowedToAddSkill returns (bool) {
    require(
      skills[_skillId].nParents == 0,
      "colony-network-deprecate-local-skills-temporarily-disabled"
    );
    bool changed = skills[_skillId].deprecated != _deprecated;
    skills[_skillId].deprecated = _deprecated;
    return changed;
  }

  /// @notice @deprecated
  function deprecateSkill(uint256 _skillId) public stoppable {
    deprecateSkill(_skillId, true);
  }

  function initialiseRootLocalSkill() public stoppable calledByColony returns (uint256) {
    skillCount += 1;
    if (!isMiningChain()){
      bridgeSkill(skillCount);
    }
    return skillCount;
  }

  function appendReputationUpdateLogFromBridge(address _colony, address _user, int _amount, uint _skillId) public onlyMiningChain stoppable skillExists(_skillId)
  {
    // Require is a known bridge
    require(bridgeData[msgSender()].chainId != 0, "colony-network-not-known-bridge");

    // TODO: Require skill exists - drop if doesn't exist
    // TODO: Require chainid bridge is for matches skillid

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

  function appendReputationUpdateLog(
    address _user,
    int _amount,
    uint _skillId
  ) public stoppable calledByColony skillExists(_skillId) {
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
        getChainId(),
        nParents,
        nChildren
      );
    } else {
      // Send transaction to bridge.
      // Call appendReputationUpdateLogFromBridge on metacolony on xdai
      address bridgeAddress = bridgeAddressList[address(0x0)];
      // TODO: Maybe force to be set on deployment?
      require(bridgeAddress != address(0x0), "colony-network-foreign-bridge-not-set");
      // require(bridgeData[bridgeAddress].chainId == MINING_CHAIN_ID, "colony-network-foreign-bridge-not-set-correctly");
      // Build the transaction we're going to send to the bridge
      bytes memory payload = abi.encodePacked(
        bridgeData[bridgeAddress].updateLogBefore,
        abi.encodeWithSignature("appendReputationUpdateLogFromBridge(address,address,int256,uint256)", msgSender(), _user, _amount, _skillId),
        bridgeData[bridgeAddress].updateLogAfter
      );
      (bool success, ) = bridgeAddress.call(payload);
      // TODO: Do we care about success here? (probably not)
    }
  }
}
