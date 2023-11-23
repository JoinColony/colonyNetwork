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
pragma experimental ABIEncoderV2;

import { ColonyDataTypes, IColony } from "./../colony/IColony.sol";
import { ColonyRoles } from "./../colony/ColonyRoles.sol";
import { IColonyNetwork } from "./../colonyNetwork/IColonyNetwork.sol";
import { ColonyExtensionMeta } from "./ColonyExtensionMeta.sol";
import { ExtractCallData } from "./../common/ExtractCallData.sol";
import { GetActionDomainSkillId } from "./../common/GetActionDomainSkillId.sol";
import { GetSingleActionSummary, ActionSummary } from "./../common/GetSingleActionSummary.sol";

// ignore-file-swc-108

contract MultisigPermissions is
  ColonyExtensionMeta,
  ColonyDataTypes,
  ExtractCallData,
  GetActionDomainSkillId,
  GetSingleActionSummary
{
  // Events

  event MultisigRoleSet(address agent, address user, uint256 domainId, uint256 roleId, bool setTo);
  event MotionExecuted(address agent, uint256 motionId, bool success);
  event MotionCancelled(address agent, uint256 motionId);
  event MotionCreated(address agent, uint256 motionId);
  event ApprovalChanged(address agent, uint256 motionId, uint8 role, bool approval);
  event RejectionChanged(address agent, uint256 motionId, uint8 role, bool approval);
  event GlobalThresholdSet(uint256 globalThreshold);
  event DomainSkillThresholdSet(uint256 domainSkillId, uint256 threshold);

  // Datatypes

  struct Motion {
    address[] targets;
    bytes[] data;
    uint256 approvalCount;
    uint256 rejectionCount;
    uint256 domainSkillId;
    bytes32 requiredPermissions;
    uint256 overallApprovalTimestamp;
    uint256 creationTimestamp;
    address creator;
    bool executed;
    bool rejected;
  }

  enum Vote {
    None,
    Approve,
    Reject
  }

  // Storage

  // User Address => Domain Id => Roles
  mapping(address => mapping(uint256 => bytes32)) internal userDomainRoles;

  IColonyNetwork colonyNetwork;
  uint256 globalThreshold;

  // Domain Skill Id => Role => Usercount
  mapping(uint256 => mapping(uint8 => uint256)) domainSkillRoleCounts;
  // Domain Skill Id => Fixed Threshold
  mapping(uint256 => uint256) domainSkillThreshold;

  uint256 motionCount;
  mapping(uint256 => Motion) motions;

  // Motion Id => User => Vote => Permissions
  mapping(uint256 => mapping(address => mapping(Vote => bytes32))) motionVotes;
  // Motion Id => Vote => Role => Vote Count
  mapping(uint256 => mapping(Vote => mapping(uint8 => uint256))) motionVoteCount;

  // Overrides

  /// @notice Returns the identifier of the extension
  /// @return _identifier The extension's identifier
  function identifier() public pure override returns (bytes32 _identifier) {
    return keccak256("MultisigPermissions");
  }

  /// @notice Returns the version of the extension
  /// @return _version The extension's version number
  function version() public pure override returns (uint256 _version) {
    return 1;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {} // solhint-disable-line no-empty-blocks

  /// @notice Called when deprecating (or undeprecating) the extension
  /// @param _deprecated Indicates whether the extension should be deprecated or undeprecated
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  function getCapabilityRoles(bytes4 _sig) public pure override returns (bytes32) {
    if (_sig == SET_USER_ROLES) {
      return ONLY_ROOT_ROLE_MASK | ONLY_ARCHITECTURE_ROLE_MASK;
    }
    return bytes32(0);
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(payable(address(colony)));
  }

  // Public

  modifier motionExists(uint256 _motionId) {
    require(_motionId > 0 && _motionId <= motionCount, "multisig-motion-nonexistent");
    _;
  }

  modifier notExecuted(uint256 _motionId) {
    require(!motions[_motionId].executed, "multisig-motion-already-executed");
    _;
  }

  modifier notRejected(uint256 _motionId) {
    require(!motions[_motionId].rejected, "multisig-motion-already-rejected");
    _;
  }

  modifier onlyCoreRoot() {
    require(
      colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root),
      "multisig-permissions-not-core-root"
    );
    _;
  }

  function setGlobalThreshold(uint256 _globalThreshold) public onlyCoreRoot {
    globalThreshold = _globalThreshold;

    emit GlobalThresholdSet(_globalThreshold);
  }

  function setDomainSkillThreshold(uint256 _domainSkillId, uint256 _threshold) public onlyCoreRoot {
    domainSkillThreshold[_domainSkillId] = _threshold;

    emit DomainSkillThresholdSet(_domainSkillId, _threshold);
  }

  function createMotion(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address[] memory _targets,
    bytes[] memory _data
  ) public notDeprecated {
    require(_targets.length == _data.length, "colony-multisig-invalid-motion");
    require(_targets.length >= 1, "colony-multisig-invalid-motion");

    motionCount += 1;
    Motion storage motion = motions[motionCount];
    motion.targets = _targets;
    motion.data = _data;
    motion.creator = msgSender();
    motion.creationTimestamp = block.timestamp;

    for (uint256 i = 0; i < motion.data.length; i += 1) {
      ActionSummary memory actionSummary = getActionSummary(motion.data[i], _targets[i]);

      // slither-disable-next-line incorrect-equality
      if (motion.domainSkillId == 0 && motion.requiredPermissions == 0) {
        motion.domainSkillId = actionSummary.domainSkillId;
        motion.requiredPermissions = actionSummary.requiredPermissions;
      } else {
        // slither-disable-next-line incorrect-equality
        require(
          motion.domainSkillId == actionSummary.domainSkillId &&
            motion.requiredPermissions == actionSummary.requiredPermissions,
          "colony-multisig-invalid-motion"
        );
      }
    }

    validateMotionDomain(_permissionDomainId, _childSkillIndex, motionCount);
    validateUserPermissions(_permissionDomainId, motionCount);

    emit MotionCreated(msgSender(), motionCount);

    changeVoteFunctionality(_permissionDomainId, motionCount, Vote.Approve, true);
  }

  function changeVote(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _motionId,
    Vote _vote
  ) public motionExists(_motionId) notExecuted(_motionId) notRejected(_motionId) {
    validateMotionDomain(_permissionDomainId, _childSkillIndex, _motionId);
    changeVoteFunctionality(_permissionDomainId, _motionId, Vote.Approve, _vote == Vote.Approve);
    changeVoteFunctionality(_permissionDomainId, _motionId, Vote.Reject, _vote == Vote.Reject);
  }

  function changeVoteFunctionality(
    uint256 _permissionDomainId,
    uint256 _motionId,
    Vote _vote,
    bool _setTo
  ) private {
    if (_setTo) {
      validateUserPermissions(_permissionDomainId, _motionId);
    }

    Motion storage motion = motions[_motionId];
    bytes32 userPermissions = getUserRoles(msgSender(), _permissionDomainId);

    uint8 roleIndex;
    bool newlyAtThreshold;
    bool anyBelowThreshold;

    while (uint256(motion.requiredPermissions) >= (1 << roleIndex)) {
      if ((motion.requiredPermissions & bytes32(1 << roleIndex)) > 0) {
        // Then the motion requires this permission. Let's check it
        // If the user is adding a vote but lacks the permission, skip
        if (uint256(userPermissions) & (1 << roleIndex) == 0 && _setTo) {
          roleIndex += 1;
          continue;
        }

        // Update appropriately if vote changes
        if (getUserVote(_motionId, msgSender(), roleIndex, _vote) != _setTo) {
          setUserVote(_motionId, msgSender(), _vote, roleIndex, _setTo);

          if (_setTo) {
            motionVoteCount[_motionId][_vote][roleIndex] += 1;
          } else {
            motionVoteCount[_motionId][_vote][roleIndex] -= 1;
          }

          if (_vote == Vote.Approve) {
            emit ApprovalChanged(msgSender(), _motionId, roleIndex, _setTo);
          } else {
            emit RejectionChanged(msgSender(), _motionId, roleIndex, _setTo);
          }
        }

        if (_vote == Vote.Approve) {
          uint256 threshold = getDomainSkillRoleThreshold(motion.domainSkillId, roleIndex);
          if (motionVoteCount[_motionId][_vote][roleIndex] < threshold) {
            anyBelowThreshold = true;
          } else if (motionVoteCount[_motionId][_vote][roleIndex] == threshold && _setTo) {
            newlyAtThreshold = true;
          }
        }
      }

      roleIndex += 1;
    }

    if (_vote == Vote.Approve) {
      if (anyBelowThreshold) {
        delete motion.overallApprovalTimestamp;
      } else if (newlyAtThreshold) {
        motion.overallApprovalTimestamp = block.timestamp;
      }
    }
  }

  function cancel(
    uint256 _motionId
  ) public motionExists(_motionId) notExecuted(_motionId) notRejected(_motionId) {
    Motion storage motion = motions[_motionId];

    require(
      msgSender() == motion.creator ||
        checkThreshold(_motionId, Vote.Reject) ||
        block.timestamp > motion.creationTimestamp + 7 days,
      "colony-multisig-not-enough-rejections"
    );

    motion.rejected = true;

    emit MotionCancelled(msgSender(), _motionId);
  }

  function execute(
    uint256 _motionId
  ) public motionExists(_motionId) notExecuted(_motionId) notRejected(_motionId) {
    Motion storage motion = motions[_motionId];

    require(checkThreshold(_motionId, Vote.Approve), "colony-multisig-not-enough-approvals");

    // If approvals were made, threshold lowered, and then executed,
    //  motion.overallApprovalTimestamp is 0 (since it was never set)
    if (motion.overallApprovalTimestamp == 0) {
      // We set the overall approval timestamp to now, and return
      // We don't execute the motion, but we want to commit the timestamp
      //  (which wouldn't happen if we continued and a call failed)
      motion.overallApprovalTimestamp = block.timestamp;
      return;
    }

    motion.executed = true;
    bool overallSuccess = true;

    for (uint256 i = 0; i < motion.data.length; i += 1) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = address(motion.targets[i]).call(motion.data[i]);
      overallSuccess = overallSuccess && success;

      // Allow failing execution after seven days
      require(
        success || motion.overallApprovalTimestamp + 7 days <= block.timestamp,
        "colony-multisig-failed-not-one-week"
      );
    }

    emit MotionExecuted(msgSender(), _motionId, overallSuccess);
  }

  function checkThreshold(uint256 _motionId, Vote _vote) private view returns (bool thresholdMet) {
    Motion storage motion = motions[_motionId];
    uint8 roleIndex;

    // While there are still relevant roles we've not checked yet
    while (uint256(motion.requiredPermissions) >= (1 << roleIndex)) {
      // For the current role, is it required for the motion?
      if ((motion.requiredPermissions & bytes32(1 << roleIndex)) > 0) {
        uint256 threshold = getDomainSkillRoleThreshold(motion.domainSkillId, roleIndex);
        if (motionVoteCount[_motionId][_vote][roleIndex] < threshold) {
          return false;
        }
      }
      roleIndex += 1;
    }

    return true;
  }

  function getGlobalThreshold() public view returns (uint256) {
    return globalThreshold;
  }

  function getMotionCount() public view returns (uint256) {
    return motionCount;
  }

  function getMotion(uint256 motionId) public view returns (Motion memory) {
    return motions[motionId];
  }

  function getMotionRoleVoteCount(
    uint256 _motionId,
    uint8 _role,
    Vote _vote
  ) public view returns (uint256) {
    return motionVoteCount[_motionId][_vote][_role];
  }

  function getUserVote(
    uint256 _motionId,
    address _user,
    uint8 _role,
    Vote _vote
  ) public view returns (bool) {
    bytes32 userVotes = motionVotes[_motionId][_user][_vote];
    return (userVotes >> uint8(_role)) & bytes32(uint256(1)) == bytes32(uint256(1));
  }

  function getDomainSkillRoleCounts(
    uint256 _domainSkillId,
    uint8 _role
  ) public view returns (uint256) {
    return domainSkillRoleCounts[_domainSkillId][_role];
  }

  function getDomainSkillRoleThreshold(
    uint256 _domainSkillId,
    uint8 _role
  ) public view returns (uint256) {
    if (domainSkillThreshold[_domainSkillId] > 0) {
      return domainSkillThreshold[_domainSkillId];
    }

    if (globalThreshold > 0) {
      return globalThreshold;
    }

    return (domainSkillRoleCounts[_domainSkillId][_role] / 2) + 1;
  }

  function getActionSummary(
    bytes memory action,
    address target
  ) public view returns (ActionSummary memory overallActionSummary) {
    bytes[] memory actions;

    if (getSig(action) == MULTICALL) {
      actions = abi.decode(extractCalldata(action), (bytes[]));
    } else {
      actions = new bytes[](1);
      actions[0] = action;
    }

    for (uint256 i; i < actions.length; i++) {
      ActionSummary memory singleActionSummary = getSingleActionSummary(
        address(colonyNetwork),
        address(colony),
        actions[i],
        target
      );

      // slither-disable-next-line incorrect-equality
      if (overallActionSummary.domainSkillId == 0) {
        overallActionSummary.domainSkillId = singleActionSummary.domainSkillId;
        overallActionSummary.requiredPermissions = singleActionSummary.requiredPermissions;
      } else {
        // slither-disable-next-line incorrect-equality
        require(
          overallActionSummary.domainSkillId == singleActionSummary.domainSkillId &&
            overallActionSummary.requiredPermissions == singleActionSummary.requiredPermissions,
          "colony-multisig-invalid-motion"
        );
      }
    }

    return overallActionSummary;
  }

  // Copied from ColonyRoles.sol
  function getUserRoles(address who, uint256 where) public view returns (bytes32) {
    return userDomainRoles[who][where];
  }

  // Copied from ColonyRoles.sol
  function setUserRoles(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bytes32 _roles
  ) public {
    // This is not strictly necessary, since these roles are never used in subdomains
    require(_roles & ROOT_ROLES == 0 || _domainId == 1, "multisig-bad-domain-for-role");

    require(
      colony.validateDomainInheritance(_permissionDomainId, _childSkillIndex, _domainId),
      "multisig-invalid-domain-inheritance"
    );

    // Allow this function to be called if the caller:
    require(
      // Has core root permissions OR
      colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root) ||
        // Has core architecture, if we're using that permission in a child domain
        (colony.hasUserRole(
          msgSender(),
          _permissionDomainId,
          ColonyDataTypes.ColonyRole.Architecture
        ) && (_permissionDomainId != _domainId)),
      "multisig-caller-not-correct-permissions"
    );

    Domain memory domain = colony.getDomain(_domainId);

    bytes32 existingRoles = getUserRoles(_user, _domainId);
    bytes32 rolesChanged = _roles ^ existingRoles;
    bytes32 roles = _roles;
    bool setTo;

    for (uint8 roleId; roleId < uint8(ColonyRole.NUMBER_OF_ROLES); roleId += 1) {
      bool changed = uint256(rolesChanged) % 2 == 1;
      if (changed) {
        setTo = uint256(roles) % 2 == 1;
        setUserRole(_user, _domainId, roleId, setTo);

        if (setTo) {
          domainSkillRoleCounts[domain.skillId][roleId] += 1;
        } else {
          domainSkillRoleCounts[domain.skillId][roleId] -= 1;
        }

        emit MultisigRoleSet(msgSender(), _user, _domainId, roleId, setTo);
      }

      roles >>= 1;
      rolesChanged >>= 1;
    }
  }

  // Internal functions

  function validateMotionDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _motionId
  ) internal view {
    uint256 permissionSkillId = colony.getDomain(_permissionDomainId).skillId;
    uint256 userActingInDomainWithSkillId = colonyNetwork.getChildSkillId(
      permissionSkillId,
      _childSkillIndex
    );
    // slither-disable-next-line incorrect-equality
    require(
      userActingInDomainWithSkillId == motions[_motionId].domainSkillId,
      "colony-multisig-not-same-domain"
    );
  }

  function validateUserPermissions(uint256 _permissionDomainId, uint256 _motionId) internal view {
    bytes32 userPermissions = getUserRoles(msgSender(), _permissionDomainId);
    require(
      userPermissions & motions[_motionId].requiredPermissions > 0,
      "colony-multisig-no-permissions"
    );
  }

  function setUserVote(
    uint256 _motionId,
    address _user,
    Vote _type,
    uint8 _role,
    bool _setTo
  ) internal {
    bytes32 userVotes = motionVotes[_motionId][_user][_type];
    if (_setTo) {
      userVotes = userVotes | bytes32(uint256(2) ** uint256(_role));
    } else {
      userVotes = userVotes & BITNOT(bytes32(uint256(uint256(2) ** uint256(_role))));
    }
    motionVotes[_motionId][_user][_type] = userVotes;
  }

  // We've cribbed these two from DomainRoles, but we don't want to inherit DomainRoles as it would require calling
  //   setUserRole with an external call in order to not revert, as the inheritable version is `auth`ed.
  // The alternative would be to deploy an Authority with the extension, but that's not a bridge we want to cross.
  function setUserRole(address who, uint256 where, uint8 role, bool enabled) internal {
    bytes32 lastRoles = userDomainRoles[who][where];
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));
    if (enabled) {
      userDomainRoles[who][where] = lastRoles | shifted;
    } else {
      userDomainRoles[who][where] = lastRoles & BITNOT(shifted);
    }
  }

  // solhint-disable-next-line func-name-mixedcase
  function BITNOT(bytes32 input) internal pure returns (bytes32 output) {
    return (input ^ bytes32(uint(int(-1))));
  }
}
