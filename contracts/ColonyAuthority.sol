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
  uint8 constant FUNDING_ROLE = uint8(ColonyDataTypes.ColonyRole.Funding);
  uint8 constant ADMINISTRATION_ROLE = uint8(ColonyDataTypes.ColonyRole.Administration);
  uint8 constant ARBITRATION_ROLE = uint8(ColonyDataTypes.ColonyRole.Arbitration);
  uint8 constant ARCHITECTURE_ROLE = uint8(ColonyDataTypes.ColonyRole.Architecture);
  uint8 constant ARCHITECTURE_SUBDOMAIN_ROLE = uint8(ColonyDataTypes.ColonyRole.ArchitectureSubdomain);
  uint8 constant ROOT_ROLE = uint8(ColonyDataTypes.ColonyRole.Root);

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
    addRoleCapability(ADMINISTRATION_ROLE, colony, sig);
  }

  function setFundingCapability(address colony, bytes memory sig) private {
    addRoleCapability(FUNDING_ROLE, colony, sig);
  }

  function setArbitrationCapability(address colony, bytes memory sig) private {
    addRoleCapability(ARBITRATION_ROLE, colony, sig);
  }

  function setArchitectureCapability(address colony, bytes memory sig) private {
    addRoleCapability(ARCHITECTURE_ROLE, colony, sig);
  }

  function setArchitectureSubdomainCapability(address colony, bytes memory sig) private {
    addRoleCapability(ARCHITECTURE_SUBDOMAIN_ROLE, colony, sig);
  }

  function setRootCapability(address colony, bytes memory sig) private {
    addRoleCapability(ROOT_ROLE, colony, sig);
  }

  // Internal helper
  function addRoleCapability(uint8 role, address colony, bytes memory sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(role, colony, functionSig, true);
  }
}
