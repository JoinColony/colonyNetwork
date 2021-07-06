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

import "./../colony/ColonyDataTypes.sol";
import "./ContractRecoveryDataTypes.sol";
import "./CommonAuthority.sol";
import "./CommonStorage.sol";
import "./IRecovery.sol";


/// @title Used for recovery in both ColonyNetwork and Colony instances
/// @notice Implements functions defined in IRecovery interface
contract ContractRecovery is ContractRecoveryDataTypes, CommonStorage { // ignore-swc-123
  uint8 constant RECOVERY_ROLE = uint8(ColonyDataTypes.ColonyRole.Recovery);

  function setStorageSlotRecovery(uint256 _slot, bytes32 _value) public recovery auth {
    require(_slot != AUTHORITY_SLOT, "colony-common-protected-variable");
    require(_slot != OWNER_SLOT, "colony-common-protected-variable");
    require(_slot != RESOLVER_SLOT, "colony-common-protected-variable");

    bytes32 flag;
    uint256 flagSlot = uint256(keccak256(abi.encodePacked("RECOVERY_PROTECTED", _slot)));
    assembly {
      flag := sload(flagSlot)
    }

    require(flag != PROTECTED, "colony-protected-variable");

    // NB. This isn't necessarily a colony - could be ColonyNetwork. But they both have this function, so it's okay.
    IRecovery(address(this)).checkNotAdditionalProtectedVariable(_slot); // ignore-swc-123

    // Protect key variables - not sure this requires explicit protecting, as this is actually in RESOLVER_SLOT
    // which is already forbidden
    uint64 _recoveryRolesCount = recoveryRolesCount;

    // Make recovery edit
    uint x = _slot;
    bytes32 y = _value;
    bytes32 oldValue;
    assembly {
      oldValue := sload(x)
      sstore(x, y) // ignore-swc-124
    }

    // Make sure we're not trying to change a flag protecting something else
    require(oldValue != PROTECTED, "colony-protected-variable");

    // Restore key variables
    recoveryRolesCount = _recoveryRolesCount;

    // Reset recovery state
    recoveryMode = true;
    recoveryApprovalCount = 0;
    recoveryEditedTimestamp = block.timestamp;

    emit RecoveryStorageSlotSet(msgSender(), _slot, oldValue, _value);
  }

  function isInRecoveryMode() public view returns (bool) {
    return recoveryMode;
  }

  function enterRecoveryMode() public stoppable auth {
    recoveryMode = true;
    recoveryApprovalCount = 0;
    recoveryEditedTimestamp = block.timestamp;

    emit RecoveryModeEntered(msgSender());
  }

  function approveExitRecovery() public recovery auth {
    require(recoveryApprovalTimestamps[msgSender()] < recoveryEditedTimestamp, "colony-recovery-approval-already-given");  // ignore-swc-116
    recoveryApprovalTimestamps[msgSender()] = block.timestamp;
    recoveryApprovalCount++;

    emit RecoveryModeExitApproved(msgSender());
  }

  function exitRecoveryMode() public recovery auth {
    uint totalAuthorized = recoveryRolesCount;
    // Don't double count the owner (if set);
    if (owner != address(0x0) && !CommonAuthority(address(authority)).hasUserRole(owner, RECOVERY_ROLE)) {
      totalAuthorized += 1;
    }
    uint numRequired = totalAuthorized / 2 + 1;
    require(recoveryApprovalCount >= numRequired, "colony-recovery-exit-insufficient-approvals");
    recoveryMode = false;

    emit RecoveryModeExited(msgSender());
  }

  // Can only be called by the root role.
  function setRecoveryRole(address _user) public stoppable auth {
    require(recoveryRolesCount < ~uint64(0), "colony-maximum-num-recovery-roles");

    if (!CommonAuthority(address(authority)).hasUserRole(_user, RECOVERY_ROLE)) { // ignore-swc-113
      recoveryRolesCount++;
      CommonAuthority(address(authority)).setUserRole(_user, RECOVERY_ROLE, true);

      emit RecoveryRoleSet(_user, true);
    }
  }

  // Can only be called by the root role.
  function removeRecoveryRole(address _user) public stoppable auth {
    if (CommonAuthority(address(authority)).hasUserRole(_user, RECOVERY_ROLE)) { // ignore-swc-113 ignore-swc-128
      recoveryRolesCount--; // ignore-swc-107 ignore-swc-101
      CommonAuthority(address(authority)).setUserRole(_user, RECOVERY_ROLE, false); // ignore-swc-113 ignore-swc-107

      emit RecoveryRoleSet(_user, false);
    }
  }

  function numRecoveryRoles() public view returns(uint64) {
    return recoveryRolesCount;
  }
}
