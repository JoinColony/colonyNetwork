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

pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/roles.sol";


contract Authority is DSRoles {
  uint8 owner_role = 0;
  uint8 admin_role = 1;

  function Authority(address colony) public {
    bytes4 makeTaskSig = bytes4(keccak256("makeTask(bytes32,uint256)"));
    setRoleCapability(owner_role, colony, makeTaskSig, true);
    setRoleCapability(admin_role, colony, makeTaskSig, true);

    bytes4 acceptTaskSig = bytes4(keccak256("finalizeTask(uint256)"));
    setRoleCapability(owner_role, colony, acceptTaskSig, true);
    setRoleCapability(admin_role, colony, acceptTaskSig, true);

    bytes4 setTaskDueDateSig = bytes4(keccak256("setTaskDueDate(uint256,uint256)"));
    setRoleCapability(owner_role, colony, setTaskDueDateSig, true);
    setRoleCapability(admin_role, colony, setTaskDueDateSig, true);

    bytes4 setTaskPayoutSig = bytes4(keccak256("setTaskPayout(uint256,uint256,address,uint256)"));
    setRoleCapability(owner_role, colony, setTaskPayoutSig, true);
    setRoleCapability(admin_role, colony, setTaskPayoutSig, true);

    bytes4 moveFundsBetweenPotsSig = bytes4(keccak256("moveFundsBetweenPots(uint256,uint256,uint256,address)"));
    setRoleCapability(owner_role, colony, moveFundsBetweenPotsSig, true);
    setRoleCapability(admin_role, colony, moveFundsBetweenPotsSig, true);
  }
}
