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

import "../lib/dappsys/roles.sol";


contract Authority is DSRoles {
  uint8 adminRole = 1;

  constructor(address colony) public {
    bytes4 moveFundsBetweenPotsSig = bytes4(keccak256("moveFundsBetweenPots(uint256,uint256,uint256,address)"));
    bytes4 addDomainSig = bytes4(keccak256("addDomain(uint256)"));
    bytes4 makeTaskSig = bytes4(keccak256("makeTask(bytes32,uint256)"));
    bytes4 startNextRewardPayoutSig = bytes4(keccak256("startNextRewardPayout(address)"));
    bytes4 cancelTaskSig = bytes4(keccak256("cancelTask(uint256)"));
    bytes4 setAdminSig = bytes4(keccak256("setAdmin(address)"));

    // Admin
    // Allocate funds
    setRoleCapability(adminRole, colony, moveFundsBetweenPotsSig, true);
    // Add domain
    setRoleCapability(adminRole, colony, addDomainSig, true);
    // Add task
    setRoleCapability(adminRole, colony, makeTaskSig, true);
    // Start next reward payout
    setRoleCapability(adminRole, colony, startNextRewardPayoutSig, true);
    // Cancel task
    setRoleCapability(adminRole, colony, cancelTaskSig, true);
    // Set admin
    setRoleCapability(adminRole, colony, setAdminSig, true);
  }
}
