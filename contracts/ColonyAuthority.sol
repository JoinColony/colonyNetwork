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
  uint8 constant architectureSubdomainRole = uint8(ColonyDataTypes.ColonyRole.ArchitectureSubdomain);
  uint8 constant rootRole = uint8(ColonyDataTypes.ColonyRole.Root);

  constructor(address colony) public CommonAuthority(colony) {
    // Add permissions for the Administration role
    setAdministrationCapability(colony, "makeTask(uint256,uint256,bytes32,uint256,uint256,uint256)");
    // TODO: add domain auth
    setAdministrationCapability(colony, "addPayment(address,address,uint256,uint256,uint256)");
    setAdministrationCapability(colony, "setPaymentRecipient(uint256,address)");
    setAdministrationCapability(colony, "setPaymentDomain(uint256,uint256)");
    setAdministrationCapability(colony, "setPaymentSkill(uint256,uint256)");
    setAdministrationCapability(colony, "setPaymentPayout(uint256,address,uint256)");
    setAdministrationCapability(colony, "finalizePayment(uint256)");
    // Only for admins in root domain
    setAdministrationCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");

    // Add permissions for the Funding role
    setFundingCapability(colony, "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)");

    // Add permissions for the Architecture role
    setArchitectureCapability(colony, "addDomain(uint256,uint256,uint256)");
    setArchitectureSubdomainCapability(colony, "setFundingRole(uint256,uint256,address,uint256,bool)");
    setArchitectureSubdomainCapability(colony, "setAdministrationRole(uint256,uint256,address,uint256,bool)");
    setArchitectureSubdomainCapability(colony, "setArchitectureRole(uint256,uint256,address,uint256,bool)");

    // Add permissions for the Root role
    setRootCapability(colony, "setFundingRole(uint256,uint256,address,uint256,bool)");
    setRootCapability(colony, "setAdministrationRole(uint256,uint256,address,uint256,bool)");
    setRootCapability(colony, "setArchitectureRole(uint256,uint256,address,uint256,bool)");
    setRootCapability(colony, "setRootRole(address,bool)");

    setRootCapability(colony, "setRecoveryRole(address)");
    setRootCapability(colony, "removeRecoveryRole(address)");

    setRootCapability(colony, "bootstrapColony(address[],int256[])");
    setRootCapability(colony, "registerColonyLabel(string,string)");
    setRootCapability(colony, "addNetworkColonyVersion(uint256,address)");
    setRootCapability(colony, "setNetworkFeeInverse(uint256)");
    setRootCapability(colony, "setRewardInverse(uint256)");
    setRootCapability(colony, "upgrade(uint256)");
    setRootCapability(colony, "mintTokens(uint256)");
    setRootCapability(colony, "addGlobalSkill(uint256)");
    setRootCapability(colony, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
  }

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

  function setArchitectureSubdomainCapability(address colony, bytes memory sig) private {
    addRoleCapability(architectureSubdomainRole, colony, sig);
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
