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

import "./CommonAuthority.sol";


contract ColonyAuthority is CommonAuthority {
  uint8 ownerRole = 0;
  uint8 adminRole = 1;

  constructor(address colony) public CommonAuthority(colony) {
    // Set token
    setOwnerRoleCapability(colony, "setToken(address)");
    // Bootstrap colony
    setOwnerRoleCapability(colony, "bootstrapColony(address[],int256[])");
    // Mint tokens
    setOwnerRoleCapability(colony, "mintTokens(uint256)");
    // Add global skill
    setOwnerRoleCapability(colony, "addGlobalSkill(uint256)");
    // Transfer ownership
    setOwnerRoleCapability(colony, "setOwnerRole(address)");
    // Remove admin role
    setOwnerRoleCapability(colony, "removeAdminRole(address)");
    // Set recovery role
    setOwnerRoleCapability(colony, "setRecoveryRole(address)");
    // Remove recovery role
    setOwnerRoleCapability(colony, "removeRecoveryRole(address)");
    // Upgrade colony
    setOwnerRoleCapability(colony, "upgrade(uint256)");
    // Claim colony ENS label
    setOwnerRoleCapability(colony, "registerColonyLabel(string)");
    // Set Network fee inverse
    setOwnerRoleCapability(colony, "setNetworkFeeInverse(uint256)");
    // Set Reward fee inverse
    setOwnerRoleCapability(colony, "setRewardInverse(uint256)");
    // Add colony version to the network
    setOwnerRoleCapability(colony, "addNetworkColonyVersion(uint256,address)");

    // Allocate funds
    setAdminRoleCapability(colony, "moveFundsBetweenPots(uint256,uint256,uint256,address)");
    setOwnerRoleCapability(colony, "moveFundsBetweenPots(uint256,uint256,uint256,address)");
    // Add domain
    setAdminRoleCapability(colony, "addDomain(uint256)");
    setOwnerRoleCapability(colony, "addDomain(uint256)");
    // Add task
    setAdminRoleCapability(colony, "makeTask(bytes32,uint256,uint256,uint256)");
    setOwnerRoleCapability(colony, "makeTask(bytes32,uint256,uint256,uint256)");
    // Start next reward payout
    setAdminRoleCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    setOwnerRoleCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    // Set admin
    setAdminRoleCapability(colony, "setAdminRole(address)");
    setOwnerRoleCapability(colony, "setAdminRole(address)");
  }

  function setOwnerRoleCapability(address colony, bytes sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(ownerRole, colony, functionSig, true);
  }

  function setAdminRoleCapability(address colony, bytes sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(adminRole, colony, functionSig, true);
  }
}
