// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.25;

import { CommonAuthority } from "./../common/CommonAuthority.sol";
import { ColonyDataTypes } from "./ColonyDataTypes.sol";

// prettier-ignore
contract ColonyAuthority is CommonAuthority {
  uint8 constant FUNDING_ROLE = uint8(ColonyDataTypes.ColonyRole.Funding);
  uint8 constant ADMINISTRATION_ROLE = uint8(ColonyDataTypes.ColonyRole.Administration);
  uint8 constant ARBITRATION_ROLE = uint8(ColonyDataTypes.ColonyRole.Arbitration);
  uint8 constant ARCHITECTURE_ROLE = uint8(ColonyDataTypes.ColonyRole.Architecture);
  uint8 constant ROOT_ROLE = uint8(ColonyDataTypes.ColonyRole.Root);

  // colony is used in the constructor by calls to addRoleCapability, despite what slither thinks
  // slither-disable-next-line immutable-states
  address internal colony;

  constructor(address _colony) CommonAuthority(_colony) {
    require(_colony != address(0x0), "colony-authority-colony-cannot-be-zero");

    colony = _colony;

    // Add permissions for the Administration role
    addRoleCapability(ADMINISTRATION_ROLE, "makeTask(uint256,uint256,bytes32,uint256,uint256,uint256)"); // Only for versions < 14
    addRoleCapability(ADMINISTRATION_ROLE, "addPayment(uint256,uint256,address,address,uint256,uint256,uint256)"); // Only for versions < 14
    addRoleCapability(ADMINISTRATION_ROLE, "setPaymentRecipient(uint256,uint256,uint256,address)"); // Only for versions < 14
    addRoleCapability(ADMINISTRATION_ROLE, "setPaymentSkill(uint256,uint256,uint256,uint256)"); // Only for versions < 14
    addRoleCapability(ADMINISTRATION_ROLE, "setPaymentPayout(uint256,uint256,uint256,address,uint256)"); // Only for versions < 14
    addRoleCapability(ADMINISTRATION_ROLE, "finalizePayment(uint256,uint256,uint256)"); // Only for versions < 14

    // Add permissions for the Funding role
    addRoleCapability(FUNDING_ROLE, "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)");

    // Add permissions for the Architecture role
    addRoleCapability(ARCHITECTURE_ROLE, "addDomain(uint256,uint256,uint256)");
    addRoleCapability(ARCHITECTURE_ROLE, "setArchitectureRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "setFundingRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "setAdministrationRole(uint256,uint256,address,uint256,bool)");

    // Add permissions for the Root role
    addRoleCapability(ROOT_ROLE, "setRootRole(address,bool)");
    addRoleCapability(ROOT_ROLE, "setArchitectureRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ROOT_ROLE, "setFundingRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ROOT_ROLE, "setAdministrationRole(uint256,uint256,address,uint256,bool)");

    // Managing recovery roles
    addRoleCapability(ROOT_ROLE, "setRecoveryRole(address)");
    addRoleCapability(ROOT_ROLE, "removeRecoveryRole(address)");

    // Colony functions
    addRoleCapability(ROOT_ROLE, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    addRoleCapability(ROOT_ROLE, "bootstrapColony(address[],int256[])");
    addRoleCapability(ROOT_ROLE, "registerColonyLabel(string,string)");
    addRoleCapability(ROOT_ROLE, "setRewardInverse(uint256)");
    addRoleCapability(ROOT_ROLE, "mintTokens(uint256)");
    addRoleCapability(ROOT_ROLE, "upgrade(uint256)");

    //  Meta Colony functions
    addRoleCapability(ROOT_ROLE, "addNetworkColonyVersion(uint256,address)");
    addRoleCapability(ROOT_ROLE, "setNetworkFeeInverse(uint256)");

    // Added in colony v3 (auburn-glider)
    addRoleCapability(ROOT_ROLE, "updateColonyOrbitDB(string)");
    addRoleCapability(ROOT_ROLE, "setArbitrationRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "setArbitrationRole(uint256,uint256,address,uint256,bool)");

    // Added in colony v4 (burgundy-glider)
    addRoleCapability(ADMINISTRATION_ROLE, "makeExpenditure(uint256,uint256,uint256)");
    addRoleCapability(ARBITRATION_ROLE, "transferExpenditureViaArbitration(uint256,uint256,uint256,address)");
    addRoleCapability(ARBITRATION_ROLE, "setExpenditurePayoutModifier(uint256,uint256,uint256,uint256,int256)");
    addRoleCapability(ARBITRATION_ROLE, "setExpenditureClaimDelay(uint256,uint256,uint256,uint256,uint256)");

    // Added in colony v5 (cerulean-lwss)
    addRoleCapability(ROOT_ROLE, "setPayoutWhitelist(address,bool)");
    addRoleCapability(ROOT_ROLE, "mintTokensFor(address,uint256)");
    addRoleCapability(ROOT_ROLE, "setReputationMiningCycleReward(uint256)");
    addRoleCapability(ROOT_ROLE, "addExtensionToNetwork(bytes32,address)");
    addRoleCapability(ROOT_ROLE, "setUserRoles(uint256,uint256,address,uint256,bytes32)");
    addRoleCapability(ROOT_ROLE, "installExtension(bytes32,uint256)");
    addRoleCapability(ROOT_ROLE, "upgradeExtension(bytes32,uint256)");
    addRoleCapability(ROOT_ROLE, "deprecateExtension(bytes32,bool)");
    addRoleCapability(ROOT_ROLE, "uninstallExtension(bytes32)");
    addRoleCapability(ROOT_ROLE, "makeArbitraryTransaction(address,bytes)");
    addRoleCapability(ROOT_ROLE, "emitDomainReputationReward(uint256,address,int256)");
    addRoleCapability(ROOT_ROLE, "emitSkillReputationReward(uint256,address,int256)");
    addRoleCapability(ARBITRATION_ROLE, "transferStake(uint256,uint256,address,address,uint256,uint256,address)");
    addRoleCapability(ARBITRATION_ROLE, "emitDomainReputationPenalty(uint256,uint256,uint256,address,int256)");
    addRoleCapability(ARBITRATION_ROLE, "emitSkillReputationPenalty(uint256,address,int256)");
    addRoleCapability(ARBITRATION_ROLE, "setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)");
    addRoleCapability(ARCHITECTURE_ROLE, "setUserRoles(uint256,uint256,address,uint256,bytes32)");
    addRoleCapability(ARCHITECTURE_ROLE, "addDomain(uint256,uint256,uint256,string)");
    addRoleCapability(ARCHITECTURE_ROLE, "editDomain(uint256,uint256,uint256,string)");
    addRoleCapability(ROOT_ROLE, "editColony(string)");
    addRoleCapability(ROOT_ROLE, "burnTokens(address,uint256)");
    addRoleCapability(ROOT_ROLE, "unlockToken()");

    // Added in colony v7 (dandelion-lwss)
    addRoleCapability(FUNDING_ROLE, "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)");

    // Added in colony v8 (ebony-lwss)
    addRoleCapability(ROOT_ROLE, "makeArbitraryTransactions(address[],bytes[],bool)");
    addRoleCapability(ROOT_ROLE, "setDefaultGlobalClaimDelay(uint256)");
    addRoleCapability(ARBITRATION_ROLE, "setExpenditureMetadata(uint256,uint256,uint256,string)");

    // Added in colony v9 (fuschia-lwss)
    addRoleCapability(ROOT_ROLE, "addLocalSkill()");
    addRoleCapability(ROOT_ROLE, "deprecateLocalSkill(uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "deprecateDomain(uint256,uint256,uint256,bool)");
    addRoleCapability(ROOT_ROLE, "editColonyByDelta(string)");

    // Added in colony v10 (ginger-lwss)
    addRoleCapability(ARBITRATION_ROLE, "setExpenditurePayout(uint256,uint256,uint256,uint256,address,uint256)");
<<<<<<< HEAD

    // Added in colony v15 (hazel-lwss-2)
    addRoleCapability(ARBITRATION_ROLE, "cancelExpenditureViaArbitration(uint256,uint256,uint256)");
    addRoleCapability(ARBITRATION_ROLE, "finalizeExpenditureViaArbitration(uint256,uint256,uint256)");
||||||| parent of 57fb1b07 (First commit, to be squashed)
=======

    // Added in colony vxxx
    addRoleCapability(ROOT_ROLE, "setBridgeData(address,bytes,bytes,uint256,uint256,bytes,bytes,bytes,bytes)");
>>>>>>> 57fb1b07 (First commit, to be squashed)
  }

  function addRoleCapability(uint8 role, bytes memory sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(role, colony, functionSig, true);
  }
}
