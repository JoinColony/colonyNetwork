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
import "./DomainRoles.sol";


contract CommonAuthority is DomainRoles {
  uint8 constant RECOVERY_ROLE = uint8(ColonyDataTypes.ColonyRole.Recovery);

  constructor(address contractAddress) public {
    setRecoveryRoleCapability(contractAddress, "enterRecoveryMode()");
    setRecoveryRoleCapability(contractAddress, "approveExitRecovery()");
    setRecoveryRoleCapability(contractAddress, "setStorageSlotRecovery(uint256,bytes32)");
    setRecoveryRoleCapability(contractAddress, "exitRecoveryMode()");
  }

  function setRecoveryRoleCapability(address contractAddress, bytes memory sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(RECOVERY_ROLE, contractAddress, functionSig, true);
  }
}
