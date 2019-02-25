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

pragma solidity >=0.5.3;

import "./ColonyDataTypes.sol";
import "./ColonyRoles.sol";


contract ColonyAuthority is ColonyRoles {
  uint8 constant founderRole = uint8(ColonyDataTypes.ColonyRole.Founder);
  uint8 constant adminRole = uint8(ColonyDataTypes.ColonyRole.Admin);
  uint8 constant fundingRole = uint8(ColonyDataTypes.ColonyRole.Funding);
  uint8 constant administrationRole = uint8(ColonyDataTypes.ColonyRole.Administration);
  uint8 constant arbitrationRole = uint8(ColonyDataTypes.ColonyRole.Arbitration);
  uint8 constant architectureRole = uint8(ColonyDataTypes.ColonyRole.Architecture);
  uint8 constant rootRole = uint8(ColonyDataTypes.ColonyRole.Root);

  constructor(address colony) public CommonAuthority(colony) {
    // Bootstrap colony
    setFounderRoleCapability(colony, "bootstrapColony(address[],int256[])");
    // Mint tokens
    setFounderRoleCapability(colony, "mintTokens(uint256)");
    // Add global skill
    setFounderRoleCapability(colony, "addGlobalSkill(uint256)");
    // Transfer founder role
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

    // Add payment
    setAdminRoleCapability(colony, "addPayment(address,address,uint256,uint256,uint256)");
    setFounderRoleCapability(colony, "addPayment(address,address,uint256,uint256,uint256)");
    // Update payments
    setAdminRoleCapability(colony, "finalizePayment(uint256)");
    setFounderRoleCapability(colony, "finalizePayment(uint256)");

    setAdminRoleCapability(colony, "setPaymentRecipient(uint256,address)");
    setFounderRoleCapability(colony, "setPaymentRecipient(uint256,address)");
    
    setAdminRoleCapability(colony, "setPaymentDomain(uint256,uint256)");
    setFounderRoleCapability(colony, "setPaymentDomain(uint256,uint256)");

    setAdminRoleCapability(colony, "setPaymentSkill(uint256,uint256)");
    setFounderRoleCapability(colony, "setPaymentSkill(uint256,uint256)");

    setAdminRoleCapability(colony, "setPaymentPayout(uint256,address,uint256)");
    setFounderRoleCapability(colony, "setPaymentPayout(uint256,address,uint256)");

    // Start next reward payout
    setAdminRoleCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    setFounderRoleCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    // Set admin
    setAdminRoleCapability(colony, "setAdminRole(address)");
    setFounderRoleCapability(colony, "setAdminRole(address)");

    // Add permissions for the Administration role
    setAdministrationCapability(colony, "makeTask(uint256,uint256,bytes32,uint256,uint256,uint256)");

    // Add permissions for the Funding role
    setFundingCapability(colony, "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)");
  }

  // Colony-wide roles
  function setFounderRoleCapability(address colony, bytes memory sig) private {
    addRoleCapability(founderRole, colony, sig);
  }

  function setAdminRoleCapability(address colony, bytes memory sig) private {
    addRoleCapability(adminRole, colony, sig);
  }

  // Domain-level roles
  function setAdministrationCapability(address colony, bytes memory sig) private {
    addRoleCapability(administrationRole, colony, sig);
  }

  function setFundingCapability(address colony, bytes memory sig) private {
    addRoleCapability(fundingRole, colony, sig);
  }

  function setArbitrationCapability(address colony, bytes memory sig) private {
    addRoleCapability(arbitrationRole, colony, sig);
  }

  function setArchitectureCapability(address colony, bytes memory sig) private {
    addRoleCapability(architectureRole, colony, sig);
  }

  function setRootCapability(address colony, bytes memory sig) private {
    addRoleCapability(rootRole, colony, sig);
  }

  // Internal helper
  function addRoleCapability(uint8 role, address colony, bytes memory sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(role, colony, functionSig, true);
  }
}
