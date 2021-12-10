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

import "./../../lib/dappsys/auth.sol";
import "./../common/MetaTransactionMsgSender.sol";

// ignore-file-swc-131
// ignore-file-swc-108


abstract contract CommonStorage is DSAuth, MetaTransactionMsgSender {
  uint256 constant UINT256_MAX = 2**256 - 1;

  uint256 constant AUTHORITY_SLOT = 0;
  uint256 constant OWNER_SLOT = 1;
  uint256 constant RESOLVER_SLOT = 2;

  bytes32 constant PROTECTED = keccak256("Recovery Mode Protected Slot");

  function protectSlot(uint256 _slot) internal always {
    uint256 flagSlot = uint256(keccak256(abi.encodePacked("RECOVERY_PROTECTED", _slot)));
    uint256 protectFlag = uint256(PROTECTED);
    assembly {
      sstore(flagSlot, protectFlag) // ignore-swc-124
    }
  }

  // Address of the Resolver contract used by EtherRouter for lookups and routing
  address resolver; // Storage slot 2 (from DSAuth there is authority and owner at storage slots 0 and 1 respectively)

  // Recovery variables
  bool recoveryMode;
  uint64 recoveryRolesCount;
  uint64 recoveryApprovalCount;// Storage slot 3
  uint256 recoveryEditedTimestamp; // Storage slot 4
  mapping (address => uint256) recoveryApprovalTimestamps; // Storage slot 5

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
}
