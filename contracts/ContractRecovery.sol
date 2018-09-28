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

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

import "./CommonStorage.sol";
import "./Authority.sol";
import "./IColony.sol";


contract ContractRecovery is CommonStorage {

  modifier recovery() {
    require(recoveryMode, "colony-not-in-recovery-mode");
    _;
  }

  modifier stoppable() {
    require(!recoveryMode, "colony-in-recovery-mode");
    _;
  }

  modifier always() {
    _;
  }

  function setStorageSlotRecovery(uint256 _slot, bytes32 _value) public recovery auth {
    require(_slot != AUTHORITY_SLOT, "colony-common-protected-variable");
    require(_slot != OWNER_SLOT, "colony-common-protected-variable");
    require(_slot != RESOLVER_SLOT, "colony-common-protected-variable");

    // NB. This isn't necessarily a colony - could be ColonyNetwork. But they both have this function, so it's okay.
    IColony(this).checkNotAdditionalProtectedVariable(_slot);

    // Protect key variables
    uint64 _recoveryRolesCount = recoveryRolesCount;

    // Make recovery edit
    uint x = _slot;
    bytes32 y = _value;
    assembly {
      sstore(x, y)
    }

    // Restore key variables
    recoveryRolesCount = _recoveryRolesCount;

    // Reset recovery state
    recoveryMode = true;
    recoveryApprovalCount = 0;
    recoveryEditedTimestamp = now;
  }

  function isInRecoveryMode() public view returns (bool) {
    return recoveryMode;
  }

  function enterRecoveryMode() public stoppable auth {
    recoveryMode = true;
    recoveryApprovalCount = 0;
    recoveryEditedTimestamp = now;
  }

  function approveExitRecovery() public recovery auth {
    require(recoveryApprovalTimestamps[msg.sender] < recoveryEditedTimestamp, "colony-recovery-approval-already-given");
    recoveryApprovalTimestamps[msg.sender] = now;
    recoveryApprovalCount++;
  }

  function exitRecoveryMode() public recovery auth {
    uint totalAuthorized = recoveryRolesCount;
    // Don't double count the owner (if set);
    if (owner != 0x0 && !Authority(authority).hasUserRole(owner, RECOVERY_ROLE)) { totalAuthorized += 1; }
    uint numRequired = totalAuthorized / 2 + 1;
    require(recoveryApprovalCount >= numRequired, "colony-recovery-exit-insufficient-approvals");
    recoveryMode = false;
  }

  // Can only be called by the owner role.
  function setRecoveryRole(address _user) public stoppable auth {
    require(recoveryRolesCount < ~uint64(0), "colony-maximum-num-recovery-roles");
    if (!Authority(authority).hasUserRole(_user, RECOVERY_ROLE)) {
      Authority(authority).setUserRole(_user, RECOVERY_ROLE, true);
      recoveryRolesCount++;
    }
  }

  // Can only be called by the owner role.
  function removeRecoveryRole(address _user) public stoppable auth {
    if (Authority(authority).hasUserRole(_user, RECOVERY_ROLE)) {
      Authority(authority).setUserRole(_user, RECOVERY_ROLE, false);
      recoveryRolesCount--;
    }
  }

  function numRecoveryRoles() public view returns(uint64) {
    return recoveryRolesCount;
  }

}
