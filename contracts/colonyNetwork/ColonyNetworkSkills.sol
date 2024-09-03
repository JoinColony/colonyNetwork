/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General *.Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.8.27;
pragma experimental "ABIEncoderV2";

import "./../reputationMiningCycle/IReputationMiningCycle.sol";
import "./../common/Multicall.sol";
import "./ColonyNetworkStorage.sol";
import { IColonyBridge } from "./../bridging/IColonyBridge.sol";
import { CallWithGuards } from "../common/CallWithGuards.sol";

contract ColonyNetworkSkills is ColonyNetworkStorage, Multicall {
  // Skills

  function addSkill(
    uint256 _parentSkillId
  ) public stoppable skillExists(_parentSkillId) allowedToAddSkill returns (uint256) {
    skillCount += 1;
    addSkillToChainTree(_parentSkillId, skillCount);

    return skillCount;
  }

  function deprecateSkill(uint256 _skillId, bool _deprecated) public stoppable {
    revert("colony-network-deprecate-skill-disabled");
  }

  function initialiseRootLocalSkill() public stoppable calledByColony returns (uint256) {
    skillCount += 1;
    return skillCount;
  }

  function appendReputationUpdateLog(
    address _user,
    int256 _amount,
    uint256 _skillId
  ) public stoppable calledByColony skillExists(_skillId) {
    // We short-circut amount == 0 as it has no effect to save gas, and we ignore Address Zero because it will
    // mess up the tracking of the total amount of reputation in a colony, as that's the key that it's
    // stored under in the patricia/merkle tree. Colonies can still pay tokens out to it if they want,
    // it just won't earn reputation.
    if (_amount == 0 || _user == address(0x0)) {
      return;
    }

    uint128 nParents = skills[_skillId].nParents;
    // We only update child skill reputation if the update is negative, otherwise just set nChildren to 0 to save gas
    uint128 nChildren = (_amount < 0) ? skills[_skillId].nChildren : 0;
    IReputationMiningCycle(inactiveReputationMiningCycle).appendReputationUpdateLog(
      _user,
      _amount,
      _skillId,
      msgSender(),
      nParents,
      nChildren
    );
  }

  // Bridging (sending)

  function setColonyBridgeAddress(address _bridgeAddress) public always calledByMetaColony {
    // TODO: Move this somewhere else to guard against unsupported chainids
    // require(_chainId <= type(uint128).max, "colony-network-chainid-too-large");

    colonyBridgeAddress = _bridgeAddress;
    // TODO: Move this to where the first

    emit BridgeSet(_bridgeAddress);
  }

  // View

  function getParentSkillId(
    uint256 _skillId,
    uint256 _parentSkillIndex
  ) public view returns (uint256) {
    return ascendSkillTree(_skillId, _parentSkillIndex + 1);
  }

  function getChildSkillId(
    uint256 _skillId,
    uint256 _childSkillIndex
  ) public view returns (uint256) {
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

  function getColonyBridgeAddress() public view returns (address) {
    return colonyBridgeAddress;
  }

  // Internal

  function addSkillToChainTree(uint256 _parentSkillId, uint256 _skillId) private {
    require(_parentSkillId > 0, "colony-network-invalid-parent-skill");

    Skill storage parentSkill = skills[_parentSkillId];
    require(!parentSkill.DEPRECATED_globalSkill, "colony-network-no-global-skills");

    Skill memory s;

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

    emit SkillAdded(skillCount, _parentSkillId);
  }

  function ascendSkillTree(
    uint256 _skillId,
    uint256 _parentSkillNumber
  ) internal view returns (uint256) {
    if (_parentSkillNumber == 0) {
      return _skillId;
    }

    Skill storage skill = skills[_skillId];
    for (uint256 i; i < skill.parents.length; i++) {
      if (2 ** (i + 1) > _parentSkillNumber) {
        uint256 _newSkillId = skill.parents[i];
        uint256 _newParentSkillNumber = _parentSkillNumber - 2 ** i;
        return ascendSkillTree(_newSkillId, _newParentSkillNumber);
      }
    }
  }
}
