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

// ignore-file-swc-108


contract MultisigPermissions is ColonyExtensionMeta, ColonyDataTypes, ExtractCallData, GetActionDomainSkillId {

  // Events
  
  event MultisigRoleSet(address agent, address user, uint256 domainId, uint256 roleId, bool setTo);
  event MotionExecuted(address agent, uint256 motionId, bool success);
  event MotionCreated(address agent, uint256 motionId);
  event ApprovalChanged(address agent, uint256 motionId, ColonyRole role, bool approval);
  event GlobalThresholdSet(uint256 globalThreshold);
  event DomainSkillThresholdSet(uint256 domainSkillId, uint256 threshold);

  // Datatypes

  struct Motion {
    address[] targets;
    bytes[] data;
    // Number of approvals
    uint256 approvalCount;
    uint256 domainSkillId;
    bytes32 requiredPermissions;
    uint256 overallApprovalTimestamp;
    bool executed;
  }

  bytes4 constant MULTICALL = bytes4(keccak256("multicall(bytes[])"));
  bytes4 constant SET_USER_ROLES = bytes4(keccak256("setUserRoles(uint256,uint256,address,uint256,bytes32)"));
  bytes32 constant ROOT_ROLES = (
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Recovery) |
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root)
  );

  bytes32 constant ONLY_ROOT_ROLE_MASK = bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root);
  bytes32 constant ONLY_ARCHITECTURE_ROLE_MASK = bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Architecture);

  // Storage

  IColonyNetwork colonyNetwork;

  uint256 globalThreshold;
  mapping(address => mapping(uint256 => bytes32)) internal userDomainRoles;


  // Domain Skill Id => Role => Usercount
  mapping(uint256 => mapping(uint8 => uint256)) domainSkillRoleCounts;

  // Domain Skill Id => fixed threshold
  mapping(uint256 => uint256) domainSkillThreshold;

  uint256 motionCount;
  mapping (uint256 => Motion) motions;

  // Motion Id => User => approvals
  mapping(uint256 => mapping(address => bytes32)) motionApprovals;
  // Motion Id => Permission => Approval Count
  mapping(uint256 => mapping(ColonyRole => uint256)) motionRoleApprovalCount;


  // Overrides

  /// @notice Returns the identifier of the extension
  /// @return _identifier The extension's identifier
  function identifier() public override pure returns (bytes32 _identifier) {
    return keccak256("MultisigPermissions");
  }

  /// @notice Returns the version of the extension
  /// @return _version The extension's version number
  function version() public override pure returns (uint256 _version) {
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
  function finishUpgrade() public override auth {}

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

  modifier notExecuted(uint256 _motionId) {
    require(!motions[_motionId].executed, "multisig-motion-already-executed");
    _;
  }

  modifier onlyCoreRoot() {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "multisig-permissions-not-core-root");
    _;
  }

  function setGlobalThreshold(uint256 _globalThreshold) public onlyCoreRoot {
    globalThreshold = _globalThreshold;

    emit GlobalThresholdSet(_globalThreshold);
  }

  function getGlobalThreshold() public view returns (uint256) {
    return globalThreshold;
  }

  function createMotion(uint256 _permissionDomainId, uint256 _childSkillIndex, address[] memory _targets, bytes[] memory _data) public notDeprecated {
    require(_targets.length == _data.length, "colony-multisig-invalid-motion");
    require(_targets.length >= 1, "colony-multisig-invalid-motion");

    motionCount += 1;
    Motion storage motion = motions[motionCount];
    motion.targets = _targets;
    motion.data = _data;

    for (uint256 i = 0; i < motion.data.length; i += 1) {
      uint256 actionDomainSkillId;
      bytes32 actionRequiredPermissions;

      (actionDomainSkillId, actionRequiredPermissions) = getActionSummary(motion.data[i], _targets[i]);

      if (motion.domainSkillId == 0 && motion.requiredPermissions == 0){
        motion.domainSkillId = actionDomainSkillId;
        motion.requiredPermissions = actionRequiredPermissions;
      } else {
        require(motion.domainSkillId == actionDomainSkillId && motion.requiredPermissions == actionRequiredPermissions, "colony-multisig-invalid-motion");
      }
    }

    validateMotionDomain((_permissionDomainId), _childSkillIndex, motionCount);
    validateUserPermissions(_permissionDomainId, motionCount);

    emit MotionCreated(msgSender(), motionCount);

    changeApproval(_permissionDomainId, _childSkillIndex, motionCount, true);
  }

  function changeApproval(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _motionId, bool _approved) public notExecuted(_motionId) {
    validateMotionDomain(_permissionDomainId, _childSkillIndex, _motionId);

    // If they're trying to approve, needs some overlap of permissions
    if (_approved){
      validateUserPermissions(_permissionDomainId, _motionId);
    }

    uint8 roleIndex = 0;
    bool newlyApproved = false;
    bool anyBelowThreshold = false;
    Motion storage motion = motions[_motionId];
    bytes32 userPermissions = getUserRoles(msgSender(), _permissionDomainId);

    while (uint256(motion.requiredPermissions) >= (1 << roleIndex)){
      if ((motion.requiredPermissions & bytes32(1 << roleIndex)) > 0){
        // Then the motion requires this permission. Let's check it

        // The user either needs to have the permission, or are removing an approval
        // If not, move on to next permissions
        if (!(uint256(userPermissions) & (1 << roleIndex) != 0 || !_approved)) {
          roleIndex += 1;
          continue;
        }

        // Update appropriately
        if (getUserApproval(_motionId, msgSender(), ColonyRole(roleIndex)) != _approved){
          // Then they changed their approval
          setUserApproval(_motionId, msgSender(), ColonyRole(roleIndex), _approved);
          if (_approved) {
            // They are now approving it
            motionRoleApprovalCount[_motionId][ColonyRole(roleIndex)] += 1;
          } else {
            motionRoleApprovalCount[_motionId][ColonyRole(roleIndex)] -= 1;
          }

          emit ApprovalChanged(msgSender(), _motionId, ColonyRole(roleIndex), _approved);
        }

        uint256 threshold = getDomainSkillRoleThreshold(motion.domainSkillId, ColonyRole(roleIndex));
        if (
          motionRoleApprovalCount[_motionId][ColonyRole(roleIndex)] < threshold
        ){
          anyBelowThreshold = true;
        } else if (
          motionRoleApprovalCount[_motionId][ColonyRole(roleIndex)] == threshold &&
          _approved
        ){
          newlyApproved = true;
        }

      }
      roleIndex += 1;
    }

    // Are we approved? Update the timestamp appropriately
    if (anyBelowThreshold){
       delete motion.overallApprovalTimestamp;
    } else if (newlyApproved){
      motion.overallApprovalTimestamp = block.timestamp;
    }
  }

  function execute(uint256 _motionId) public notExecuted(_motionId) {
    Motion storage motion = motions[_motionId];

    bytes32 motionPermissions = motion.requiredPermissions;
    uint8 roleIndex = 0;
    // While there are still relevant roles we've not checked yet
    while (uint256(motionPermissions) >= (1 << roleIndex)){
      // For the current role, is it required for the motion?
      if ((motionPermissions & bytes32(1 << roleIndex)) > 0){
        uint256 threshold = getDomainSkillRoleThreshold(motion.domainSkillId, ColonyRole(roleIndex));
        require(motionRoleApprovalCount[_motionId][ColonyRole(roleIndex)] >= threshold, "colony-multisig-permissions-not-enough-approvals");
      }
      roleIndex += 1;
    }

    // If approvals were made, threshold lowered, and then executed, motion.overallApprovalTimestamp is 0
    if (motion.overallApprovalTimestamp == 0){
      // We set the overall approval timestamp to now, and return
      // We don't execute the motion, but we want to commit the timestamp
      // (which wouldn't happen if we continued and the call(s) failed)
      motion.overallApprovalTimestamp = block.timestamp;
      return;
    }

    bool overallSuccess = true;
    motion.executed = true;

    // Execute the motion, if it meets the threshold
    for (uint256 i = 0; i < motion.data.length; i += 1){
      (bool success, ) = address(motion.targets[i]).call(motion.data[i]);
      overallSuccess = overallSuccess && success;
      // Allow failing execution after seven days
      require(success || motion.overallApprovalTimestamp + 7 days <= block.timestamp, "colony-multisig-failed-not-one-week");
    }

    emit MotionExecuted(msgSender(), _motionId, overallSuccess);
  }


  function getMotionCount() public view returns(uint256) {
    return motionCount;
  }

  function getMotion(uint256 motionId) public view returns (Motion memory){
    return motions[motionId];
  }
  function getMotionRoleApprovalCount(uint256 _motionId, ColonyRole _role) public view returns (uint256){
    return motionRoleApprovalCount[_motionId][_role];
  }

  function getUserApproval(uint256 _motionId, address _user, ColonyRole _permission) public view returns (bool) {
    bytes32 approvals = motionApprovals[_motionId][_user];
    return (approvals >> uint8(_permission)) & bytes32(uint256(1)) == bytes32(uint256(1));
  }

  function getDomainSkillRoleCounts(uint256 _domainSkillId, uint8 role) public view returns (uint256) {
    return domainSkillRoleCounts[_domainSkillId][role];
  }

  function getDomainSkillThreshold(uint256 _domainSkillId) public view returns (uint256) {
    return domainSkillThreshold[_domainSkillId];
  }

  function setDomainSkillThreshold(uint256 _domainSkillId, uint256 _threshold) public onlyCoreRoot {
    domainSkillThreshold[_domainSkillId] = _threshold;

    emit DomainSkillThresholdSet(_domainSkillId, _threshold);
  }

  function getDomainSkillRoleThreshold(uint256 _domainSkillId, ColonyRole _role) public view returns (uint256) {
    // If domain skill threshold explicitly set, use that value
    if (domainSkillThreshold[_domainSkillId] > 0){
      return domainSkillThreshold[_domainSkillId];
    }

    // Otherwise, if global threshold set, return that
    if (globalThreshold > 0){
      return globalThreshold;
    }
    return domainSkillRoleCounts[_domainSkillId][uint8(_role)]/2 + 1;
  }

  // Copied role functions
  function getUserRoles(address who, uint256 where) public view returns (bytes32) {
    return userDomainRoles[who][where];
  }

  // Evaluates a "domain proof" which checks that childDomainId is part of the subtree starting at permissionDomainId
  function validateDomainInheritance(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId) internal view returns (bool) {
    // Validate the permissions proof
    uint256 colonyDomainCount = colony.getDomainCount();
    require(_permissionDomainId > 0 && _permissionDomainId <= colonyDomainCount, "multisig-domain-does-not-exist");
    require(_domainId > 0 && _domainId <= colonyDomainCount, "multisig-domain-does-not-exist");
    
    if (_permissionDomainId == _domainId) {
      return _childSkillIndex == UINT256_MAX;
    } else {
      Domain memory domain = colony.getDomain(_permissionDomainId);
      uint256 childSkillId = colonyNetwork.getChildSkillId(domain.skillId, _childSkillIndex);
      Domain memory childDomain = colony.getDomain(_domainId);
      return childSkillId == childDomain.skillId;
    }
  }


  function setUserRoles(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bytes32 _roles
  ) public
  {
    require(validateDomainInheritance(_permissionDomainId, _childSkillIndex, _domainId), "multisig-invalid-domain-inheritance");

    // Allow this function to be called if the caller:
    require(
    // Has core root permissions OR
      colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root) ||
    // Has core architecture, if we're using that permission in a child domain of where we have it
      (
        // Core architecture check
        colony.hasUserRole(msgSender(), _permissionDomainId, ColonyDataTypes.ColonyRole.Architecture) &&
        // In a child domain check
        (_permissionDomainId != _domainId)
      ),
      "multisig-caller-not-correct-permissions"
    );
    // Note that if we're using multisig to award permissions, the caller is this contract, which is expected
    // to have all permissions

    // This is not strictly necessary, since these roles are never used in subdomains
    require(_roles & ROOT_ROLES == 0 || _domainId == 1, "colony-bad-domain-for-role");
    Domain memory domain = colony.getDomain(_domainId);

    bool setTo;
    bytes32 existingRoles = getUserRoles(_user, _domainId);
    bytes32 rolesChanged = _roles ^ existingRoles;
    bytes32 roles = _roles;

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

  function getSig(bytes memory motion) internal pure returns (bytes4 sig) {
    assembly {
      sig := mload(add(motion, 0x20))
    }
  }

  function getActionSummary(bytes memory action, address target) public view returns (uint256 domainSkillId, bytes32 requiredPermissions) {
    bytes4 sig;
    bytes[] memory actions;

    if (getSig(action) == MULTICALL) {
      actions = abi.decode(extractCalldata(action), (bytes[]));
    } else {
      actions = new bytes[](1); actions[0] = action;
    }

    uint256 overallDomainSkillId;
    bytes32 overallPermissionMask;

    for (uint256 i; i < actions.length; i++) {
      sig = getSig(actions[i]);
      require(sig != MULTICALL, "colony-multisig-no-nested-multicall");
      // Get the permissions required for this call
      bytes32 permissionMask = ColonyRoles(target).getCapabilityRoles(sig);

      // Get the skill Id of the domain this call acts in
      if (permissionMask | ROOT_ROLES == ROOT_ROLES) {
        domainSkillId = colony.getDomain(1).skillId;
        // We might be here if the function is unknown (and therefore, presumably, public), and returns 0x00 for
        // permissions. We require the root permission on the multisig in those circumstances (if it's
        // truly public, the caller can just call it. Otherwise, the multisig as a whole is calling it so we
        // tie it to root).
        permissionMask = ONLY_ROOT_ROLE_MASK;
      } else {
        domainSkillId = getActionDomainSkillId(actions[i], address(colonyNetwork), address(colony));

        // A special case for setUserRoles, which can be called by root (everywhere) and
        // by architecture (if being used in a child domain of where you have the permission)
        if (sig == SET_USER_ROLES) {
          if (domainSkillId == colony.getDomain(1).skillId) {
            permissionMask = ONLY_ROOT_ROLE_MASK;
          } else {
            permissionMask = ONLY_ARCHITECTURE_ROLE_MASK;
          }
        }
      }

      // We store the permissions, and the domain they're required in.
      // If there are actions that require different permissions, or act in different domains,
      // then there is no valid action summary and we revert.
      if (overallDomainSkillId == 0) {
        overallDomainSkillId = domainSkillId;
        overallPermissionMask = permissionMask;
      } else {
        require(overallDomainSkillId == domainSkillId && overallPermissionMask == permissionMask, "colony-multisig-invalid-motion");
      }
    }
    return (overallDomainSkillId, overallPermissionMask);
  }

  function validateMotionDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _motionId) internal view {
      // Work out which domain they're using their permissions in, via child skill index
      uint256 permissionSkillId = colony.getDomain(_permissionDomainId).skillId;
      uint256 userActingInDomainWithSkillId = colonyNetwork.getChildSkillId(permissionSkillId, _childSkillIndex);
      // Check it's same as the domain being acted on by _motionId
      // slither-disable-next-line incorrect-equality
      require(userActingInDomainWithSkillId == motions[_motionId].domainSkillId, "colony-multisig-not-same-domain");
  }

  function validateUserPermissions(uint256 _permissionDomainId, uint256 _motionId) internal view {
      // Get permissions in _permissionDomainId for user
      bytes32 userPermissions = getUserRoles(msgSender(), _permissionDomainId);
      require(userPermissions & motions[_motionId].requiredPermissions > 0, "colony-multisig-no-permissions");
  }

  function setUserApproval(uint256 _motionId, address _user, ColonyRole _permission, bool _approved) internal {
    bytes32 approvals = motionApprovals[_motionId][_user];
    if (_approved) {
      approvals = approvals | bytes32(uint256(2) ** uint256(_permission));
    } else {
      approvals = approvals & BITNOT(bytes32(uint256(uint256(2) ** uint256(_permission))));
    }
    motionApprovals[_motionId][_user] = approvals;    
  }

  // We've cribbed these from DomainRoles, but we don't want to inherit DomainRoles as it would require calling
  // setUserRole with an external call in order to not revert, as the inheritable version is `auth`ed. The alternative
  // would be to deploy an Authority with the extension, but that's not a bridge we want to cross.
  function setUserRole(address who, uint256 where, uint8 role, bool enabled) internal {
    bytes32 lastRoles = userDomainRoles[who][where];
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));
    if (enabled) {
      userDomainRoles[who][where] = lastRoles | shifted;
    } else {
      userDomainRoles[who][where] = lastRoles & BITNOT(shifted);
    }
  }

  function BITNOT(bytes32 input) internal pure returns (bytes32 output) {
    return (input ^ bytes32(uint(int(-1))));
  }


}
