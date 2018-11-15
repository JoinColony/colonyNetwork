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
  uint8 founderRole = 0;
  uint8 adminRole = 1;

  constructor(address colony) public CommonAuthority(colony) {
    // Set token
    setFounderRoleCapability(colony, "setToken(address)");
    // Bootstrap colony
    setFounderRoleCapability(colony, "bootstrapColony(address[],int256[])");
    // Mint tokens
    setFounderRoleCapability(colony, "mintTokens(uint256)");
    // Add global skill
    setFounderRoleCapability(colony, "addGlobalSkill(uint256)");
    // Transfer ownership
    setFounderRoleCapability(colony, "setFounderRole(address)");
    // Remove admin role
    setFounderRoleCapability(colony, "removeAdminRole(address)");
    // Set recovery role
    setFounderRoleCapability(colony, "setRecoveryRole(address)");
    // Remove recovery role
    setFounderRoleCapability(colony, "removeRecoveryRole(address)");
    // Upgrade colony
    setFounderRoleCapability(colony, "upgrade(uint256)");
    // Claim colony ENS label
    setFounderRoleCapability(colony, "registerColonyLabel(string,string)");
    // Set Network fee inverse
    setFounderRoleCapability(colony, "setNetworkFeeInverse(uint256)");
    // Set Reward fee inverse
    setFounderRoleCapability(colony, "setRewardInverse(uint256)");
    // Add colony version to the network
    setFounderRoleCapability(colony, "addNetworkColonyVersion(uint256,address)");

    // Allocate funds
    setAdminRoleCapability(colony, "moveFundsBetweenPots(uint256,uint256,uint256,address)");
    setFounderRoleCapability(colony, "moveFundsBetweenPots(uint256,uint256,uint256,address)");
    // Add domain
    setAdminRoleCapability(colony, "addDomain(uint256)");
    setFounderRoleCapability(colony, "addDomain(uint256)");
    // Add task
    setAdminRoleCapability(colony, "makeTask(bytes32,uint256,uint256,uint256)");
    setFounderRoleCapability(colony, "makeTask(bytes32,uint256,uint256,uint256)");
    // Start next reward payout
    setAdminRoleCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    setFounderRoleCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    // Set admin
    setAdminRoleCapability(colony, "setAdminRole(address)");
    setFounderRoleCapability(colony, "setAdminRole(address)");
  }

  function setFounderRoleCapability(address colony, bytes sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(founderRole, colony, functionSig, true);
  }

  function setAdminRoleCapability(address colony, bytes sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(adminRole, colony, functionSig, true);
  }
}
