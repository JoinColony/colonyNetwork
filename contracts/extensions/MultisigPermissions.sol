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
pragma experimental ABIEncoderV2;

import { ColonyDataTypes, IColony } from "./../colony/IColony.sol";
import { ColonyRoles } from "./../colony/ColonyRoles.sol";
import { IColonyNetwork } from "./../colonyNetwork/IColonyNetwork.sol";
import { ColonyExtensionMeta } from "./ColonyExtensionMeta.sol";

// ignore-file-swc-108


contract MultisigPermissions is ColonyExtensionMeta, ColonyDataTypes {

  // Events

  // event ExpenditureMadeViaStake(address indexed creator, uint256 expenditureId, uint256 stake);
  // event ExpenditureCancelled(uint256 expenditureId);
  // event StakeReclaimed(uint256 expenditureId);

  // Datatypes

  struct Motion {
    address[] targets;
    bytes[] data;
    // Number of approvals
    uint256 approvalCount;
    uint256 overallDomainSkillId;
    bytes32 overallPermissions;
    uint256 overallApprovalTimestamp;
    bool executed;
  }

  event MultisigRoleSet(address agent, address user, uint256 domainId, uint256 roleId, bool setTo);
  event MotionExecuted(address agent, uint256 motionId, bool success);
  event MotionCreated(address agent, uint256 motionId);
  event ApprovalChanged(address agent, uint256 motionId, bool approval);

  bytes4 constant MULTICALL = bytes4(keccak256("multicall(bytes[])"));
  bytes4 constant SETUSERROLES = bytes4(keccak256("setUserRoles(uint256,uint256,address,uint256,bytes32)"));
  bytes32 constant ROOT_ROLES = (
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Recovery) |
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root)
  );

  bytes32 constant ONLY_ROOT_ROLE_MASK = bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root);
  bytes32 constant ONLY_ARCHITECTURE_ROLE_MASK = bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Architecture);

  // Storage

  IColonyNetwork colonyNetwork;

  uint256 threshold;
  mapping(address=>mapping(uint256=>bytes32)) internal userDomainRoles;

  uint256 motionCount;
  mapping (uint256 => Motion) motions;

  // Motion Id => User =>Have they approved
  mapping(uint256 => mapping(address => bool)) motionApprovals;

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

  function getCapabilityRoles(bytes4 _sig) public view override returns (bytes32) {
    if (_sig == SETUSERROLES) {
      return (
        bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Architecture) |
        bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root)
      );
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

  function initialise(uint256 _threshold) public {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "multisig-permissions-not-core-root");
    require(_threshold >= 1, "multisig-permissions-bad-threshold");
    threshold = _threshold;
    emit ExtensionInitialised();
  }

  function getThreshold() public view returns (uint256) {
    return threshold;
  }

  function createMotion(uint256 _permissionDomainId, uint256 _childSkillIndex, address[] memory _targets, bytes[] memory _data) notDeprecated public {
    require(threshold >= 1, "multisig-permissions-not-initialised");
    require(_targets.length == _data.length, "colony-multisig-invalid-motion");
    require(_targets.length >= 1, "colony-multisig-invalid-motion");

    motionCount += 1;
    Motion storage motion = motions[motionCount];
    motion.targets = _targets;
    motion.data = _data;

    uint256 domainSkillId;
    bytes32 permissions;

    for (uint256 i = 0; i < motions[motionCount].data.length; i += 1) {
      uint256 actionDomainSkillId;
      bytes32 actionPermissions;

      (actionDomainSkillId, actionPermissions) = getActionSummary(motion.data[i], _targets[i]);

      if (motion.overallDomainSkillId == 0 && motion.overallPermissions == 0){
        motion.overallDomainSkillId = actionDomainSkillId;
        motion.overallPermissions = actionPermissions;
      } else {
        require(motion.overallDomainSkillId == actionDomainSkillId && motion.overallPermissions == actionPermissions, "colony-multisig-invalid-motion");
      }
    }

    // Get permissions in _permissionDomainId for user
    bytes32 userPermissions = getUserRoles(msgSender(), _permissionDomainId);
    // Work out which domain they're using their permissions in, via child skill index
    uint256 permissionSkillId = colony.getDomain(_permissionDomainId).skillId;
    uint256 userActingInDomainWithSkillId = colonyNetwork.getChildSkillId(permissionSkillId, _childSkillIndex);

    // Check it's same as the domain being acted on by _motionId
    require(userActingInDomainWithSkillId == motion.overallDomainSkillId, "colony-multisig-not-same-domain");

    // Check they have the permissions
    require((userPermissions & motion.overallPermissions) > 0, "colony-multisig-no-permissions");

    emit MotionCreated(msgSender(), motionCount);

    changeApproval(motionCount, _permissionDomainId, _childSkillIndex, true);
  }

  function changeApproval(uint256 _motionId, uint256 _permissionDomainId, uint256 _childSkillIndex, bool _approved) public notExecuted(_motionId) {
    // Get permissions in _permissionDomainId for user
    bytes32 userPermissions = getUserRoles(msgSender(), _permissionDomainId);
    // Work out which domain they're using their permissions in, via child skill index
    uint256 permissionSkillId = colony.getDomain(_permissionDomainId).skillId;
    uint256 userActingInDomainWithSkillId = colonyNetwork.getChildSkillId(permissionSkillId, _childSkillIndex);

    // Check it's same as the domain being acted on by _motionId
    Motion storage motion = motions[_motionId];
    require(userActingInDomainWithSkillId == motion.overallDomainSkillId, "colony-multisig-not-same-domain");

    require(
      // Check they have the permissions OR
      (userPermissions & motion.overallPermissions) > 0 ||
      // Are trying to remove an approval
      _approved == false
    , "colony-multisig-no-permissions");

    // Update appropriately
    if (motionApprovals[_motionId][msgSender()] != _approved){
      motionApprovals[_motionId][msgSender()] = _approved;
      // Then they changed their approval
      if (_approved) {
        // They are now approving it
        motion.approvalCount += 1;
      } else {
        motion.approvalCount -= 1;
      }
      emit ApprovalChanged(msgSender(), _motionId, _approved);
    }

    // If now over the threshold (for the first time), start the 'timeout' clock
    if (motion.approvalCount == threshold && _approved == true) {
      motion.overallApprovalTimestamp = block.timestamp;
    }

    // If we lose our approvals before execution, un-set the approval timestamp
    if (motion.approvalCount == threshold - 1 && _approved == false) {
      motion.overallApprovalTimestamp = 0;
    }
  }

  function execute(uint256 _motionId) public notExecuted(_motionId) {
    Motion storage motion = motions[_motionId];

    require(motions[_motionId].approvalCount >= threshold, "colony-multisig-permissions-not-enough-approvals");

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
      (bool success, bytes memory result) = address(motion.targets[i]).call(motion.data[i]);
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

  function getUserApproval(uint256 _motionId, address _user) public view returns (bool){
    return motionApprovals[_motionId][_user];
  }

  // Copied role functions
  function getUserRoles(address who, uint256 where) public view returns (bytes32) {
    return userDomainRoles[who][where];
  }

  // Evaluates a "domain proof" which checks that childDomainId is part of the subtree starting at permissionDomainId
  function validateDomainInheritance(uint256 permissionDomainId, uint256 childSkillIndex, uint256 childDomainId) internal view returns (bool) {
    if (permissionDomainId == childDomainId) {
      return childSkillIndex == UINT256_MAX;
    } else {
      Domain memory domain = colony.getDomain(permissionDomainId);
      uint256 childSkillId = colonyNetwork.getChildSkillId(domain.skillId, childSkillIndex);
      Domain memory childDomain = colony.getDomain(childDomainId);
      return childSkillId == childDomain.skillId;
    }
  }


  function setUserRoles(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bytes32 _roles
  ) public //authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId)
  {
    // Validate the permissions proof
    uint256 colonyDomainCount = colony.getDomainCount();
    require(_permissionDomainId > 0 && _permissionDomainId <= colonyDomainCount, "multisig-domain-does-not-exist");
    require(_domainId > 0 && _domainId <= colonyDomainCount, "multisig-domain-does-not-exist");
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

    bool setTo;
    bytes32 existingRoles = getUserRoles(_user, _domainId);
    bytes32 rolesChanged = _roles ^ existingRoles;
    bytes32 roles = _roles;

    for (uint8 roleId; roleId < uint8(ColonyRole.NUMBER_OF_ROLES); roleId += 1) {
      bool changed = uint256(rolesChanged) % 2 == 1;
      if (changed) {
        setTo = uint256(roles) % 2 == 1;

        setUserRole(_user, _domainId, roleId, setTo);
        emit MultisigRoleSet(msgSender(), _user, _domainId, roleId, setTo);

      }
      roles >>= 1;
      rolesChanged >>= 1;
    }
  }

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

  function getSig(bytes memory motion) internal pure returns (bytes4 sig) {
    assembly {
      sig := mload(add(motion, 0x20))
    }
  }

  function getActionSummary(bytes memory action, address target) public view returns (uint256 domainSkillId, bytes32 permissions) {
    bytes4 sig;
    uint256 expenditureId;
    uint256 domainSkillId;
    bytes[] memory actions;

    if (getSig(action) == MULTICALL) {
      actions = abi.decode(extractCalldata(action), (bytes[]));
    } else {
      actions = new bytes[](1); actions[0] = action;
    }

    uint256 overallDomainSkillId;
    bytes32 overallPermissions;

    for (uint256 i; i < actions.length; i++) {
      sig = getSig(actions[i]);
      require(sig != MULTICALL, "colony-multisig-no-nested-multicall");
      // Get the permissions required for this call
      bytes32 permissions = ColonyRoles(target).getCapabilityRoles(sig);

      // Get the skill Id of the domain this call acts in
      if (permissions | ROOT_ROLES == ROOT_ROLES) {
        domainSkillId = colony.getDomain(1).skillId;
        // We might be here if the function is unknown (and therefore, presumably, public), and returns 0x00 for
        // permissions. We require the root permission on the multisig in those circumstances (if it's
        // truly public, the caller can just call it. Otherwise, the multisig as a whole is calling it so we
        // tie it to root).
        permissions = ONLY_ROOT_ROLE_MASK;
      } else {
        domainSkillId = getActionDomainSkillId(actions[i]);
      }

      // A special case for setUserRoles, which can be called by root (everywhere) and
      // by architecture (if being used in a child domain of where you have the permission)
      if (sig == SETUSERROLES) {
        if (domainSkillId == colony.getDomain(1).skillId) {
          permissions = ONLY_ROOT_ROLE_MASK;
        } else {
          permissions = ONLY_ARCHITECTURE_ROLE_MASK;
        }
      }

      // We store the permissions, and the domain they're required in.
      // If there are actions that require different permissions, or act in different domains,
      // then there is no valid action summary and we revert.
      if (overallDomainSkillId == 0) {
        overallDomainSkillId = domainSkillId;
        overallPermissions = permissions;
      } else {
        require(overallDomainSkillId == domainSkillId && overallPermissions == permissions, "colony-multisig-invalid-motion");
      }
    }
    return (overallDomainSkillId, overallPermissions);
  }


  function getActionDomainSkillId(bytes memory _action) internal view returns (uint256) {
    uint256 permissionDomainId;
    uint256 childSkillIndex;

    assembly {
      permissionDomainId := mload(add(_action, 0x24))
      childSkillIndex := mload(add(_action, 0x44))
    }

    uint256 permissionSkillId = colony.getDomain(permissionDomainId).skillId;
    return colonyNetwork.getChildSkillId(permissionSkillId, childSkillIndex);
  }

    // From https://ethereum.stackexchange.com/questions/131283/how-do-i-decode-call-data-in-solidity
  function extractCalldata(bytes memory calldataWithSelector) internal pure returns (bytes memory) {
      bytes memory calldataWithoutSelector;
      require(calldataWithSelector.length >= 4);

      assembly {
          let totalLength := mload(calldataWithSelector)
          let targetLength := sub(totalLength, 4)
          calldataWithoutSelector := mload(0x40)

          // Set the length of callDataWithoutSelector (initial length - 4)
          mstore(calldataWithoutSelector, targetLength)

          // Mark the memory space taken for callDataWithoutSelector as allocated
          mstore(0x40, add(calldataWithoutSelector, add(0x20, targetLength)))

          // Process first 32 bytes (we only take the last 28 bytes)
          mstore(add(calldataWithoutSelector, 0x20), shl(0x20, mload(add(calldataWithSelector, 0x20))))

          // Process all other data by chunks of 32 bytes
          for { let i := 0x1C } lt(i, targetLength) { i := add(i, 0x20) } {
              mstore(add(add(calldataWithoutSelector, 0x20), i), mload(add(add(calldataWithSelector, 0x20), add(i, 0x04))))
          }
      }

      return calldataWithoutSelector;
  }
}
