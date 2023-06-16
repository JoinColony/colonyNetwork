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

pragma solidity 0.8.20;

import "./../common/CommonAuthority.sol";
import "./ColonyDataTypes.sol";


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
    require(_colony  != address(0x0), "colony-authority-colony-cannot-be-zero");

    colony = _colony;

    // Root functions are used to change colony-wide parameters
    // Managing the meta colony
    addRoleCapability(ROOT_ROLE, "addNetworkColonyVersion(uint256,address)");
    addRoleCapability(ROOT_ROLE, "setNetworkFeeInverse(uint256)");
    addRoleCapability(ROOT_ROLE, "addGlobalSkill()");
    addRoleCapability(ROOT_ROLE, "deprecateGlobalSkill(uint256)");
    addRoleCapability(ROOT_ROLE, "setReputationMiningCycleReward(uint256)");
    addRoleCapability(ROOT_ROLE, "addExtensionToNetwork(bytes32,address)");
    // Managing user roles (overlaps with Architecture functionality)
    addRoleCapability(ROOT_ROLE, "setRecoveryRole(address)");
    addRoleCapability(ROOT_ROLE, "removeRecoveryRole(address)");
    addRoleCapability(ROOT_ROLE, "setRootRole(address,bool)");
    addRoleCapability(ROOT_ROLE, "setArchitectureRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ROOT_ROLE, "setArbitrationRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ROOT_ROLE, "setFundingRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ROOT_ROLE, "setAdministrationRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ROOT_ROLE, "setUserRoles(uint256,uint256,address,uint256,bytes32)");
    // Managing the colony
    addRoleCapability(ROOT_ROLE, "bootstrapColony(address[],int256[])");
    addRoleCapability(ROOT_ROLE, "upgrade(uint256)");
    addRoleCapability(ROOT_ROLE, "registerColonyLabel(string,string)");
    addRoleCapability(ROOT_ROLE, "editColony(string)");
    addRoleCapability(ROOT_ROLE, "editColonyByDelta(string)");
    addRoleCapability(ROOT_ROLE, "updateColonyOrbitDB(string)");
    addRoleCapability(ROOT_ROLE, "addLocalSkill()");
    addRoleCapability(ROOT_ROLE, "deprecateLocalSkill(uint256,bool)");
    addRoleCapability(ROOT_ROLE, "setPayoutWhitelist(address,bool)");
    addRoleCapability(ROOT_ROLE, "setDefaultGlobalClaimDelay(uint256)");
    // Managing tokens
    addRoleCapability(ROOT_ROLE, "unlockToken()");
    addRoleCapability(ROOT_ROLE, "mintTokens(uint256)");
    addRoleCapability(ROOT_ROLE, "mintTokensFor(address,uint256)");
    addRoleCapability(ROOT_ROLE, "burnTokens(address,uint256)");
    // Managing rewards
    addRoleCapability(ROOT_ROLE, "startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
    addRoleCapability(ROOT_ROLE, "setRewardInverse(uint256)");
    // Managing extensions
    addRoleCapability(ROOT_ROLE, "installExtension(bytes32,uint256)");
    addRoleCapability(ROOT_ROLE, "upgradeExtension(bytes32,uint256)");
    addRoleCapability(ROOT_ROLE, "deprecateExtension(bytes32,bool)");
    addRoleCapability(ROOT_ROLE, "uninstallExtension(bytes32)");
    // Other actions
    addRoleCapability(ROOT_ROLE, "makeArbitraryTransaction(address,bytes)");
    addRoleCapability(ROOT_ROLE, "makeArbitraryTransactions(address[],bytes[],bool)");
    addRoleCapability(ROOT_ROLE, "emitDomainReputationReward(uint256,address,int256)");
    addRoleCapability(ROOT_ROLE, "emitSkillReputationReward(uint256,address,int256)");

    // Architecture functions are used to create and manage domains & set permissions in domains
    addRoleCapability(ARCHITECTURE_ROLE, "addDomain(uint256,uint256,uint256)");
    addRoleCapability(ARCHITECTURE_ROLE, "addDomain(uint256,uint256,uint256,string)");
    addRoleCapability(ARCHITECTURE_ROLE, "editDomain(uint256,uint256,uint256,string)");
    addRoleCapability(ARCHITECTURE_ROLE, "deprecateDomain(uint256,uint256,uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "setUserRoles(uint256,uint256,address,uint256,bytes32)");
    addRoleCapability(ARCHITECTURE_ROLE, "setArchitectureRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "setArbitrationRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "setFundingRole(uint256,uint256,address,uint256,bool)");
    addRoleCapability(ARCHITECTURE_ROLE, "setAdministrationRole(uint256,uint256,address,uint256,bool)");

    // Arbitration functions are used to resolve disputes and make exceptional changes to reputation
    addRoleCapability(ARBITRATION_ROLE, "emitDomainReputationPenalty(uint256,uint256,uint256,address,int256)");
    addRoleCapability(ARBITRATION_ROLE, "emitSkillReputationPenalty(uint256,address,int256)");
    addRoleCapability(ARBITRATION_ROLE, "transferStake(uint256,uint256,address,address,uint256,uint256,address)");
    // NB expenditure owners can also call (some of) these functions, regardless of their permissions
    addRoleCapability(ARBITRATION_ROLE, "setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)");
    addRoleCapability(ARBITRATION_ROLE, "setExpenditurePayout(uint256,uint256,uint256,uint256,address,uint256)");
    addRoleCapability(ARBITRATION_ROLE, "setExpenditureMetadata(uint256,uint256,uint256,string)");
    addRoleCapability(ARBITRATION_ROLE, "transferExpenditureViaArbitration(uint256,uint256,uint256,address)"); // Deprecated
    addRoleCapability(ARBITRATION_ROLE, "setExpenditureClaimDelay(uint256,uint256,uint256,uint256,uint256)"); // Deprecated
    addRoleCapability(ARBITRATION_ROLE, "setExpenditurePayoutModifier(uint256,uint256,uint256,uint256,int256)"); // Deprecated

    // Funding functions are used to move resources between domains
    addRoleCapability(FUNDING_ROLE, "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)");
    addRoleCapability(FUNDING_ROLE, "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"); // Deprecated

    // Administration functions are used to propose and prepare expenditures for funding
    addRoleCapability(ADMINISTRATION_ROLE, "makeExpenditure(uint256,uint256,uint256)");
    addRoleCapability(ADMINISTRATION_ROLE, "makeTask(uint256,uint256,bytes32,uint256,uint256,uint256)"); // Deprecated
    addRoleCapability(ADMINISTRATION_ROLE, "addPayment(uint256,uint256,address,address,uint256,uint256,uint256)"); // Deprecated
    addRoleCapability(ADMINISTRATION_ROLE, "setPaymentRecipient(uint256,uint256,uint256,address)"); // Deprecated
    addRoleCapability(ADMINISTRATION_ROLE, "setPaymentSkill(uint256,uint256,uint256,uint256)"); // Deprecated
    addRoleCapability(ADMINISTRATION_ROLE, "setPaymentPayout(uint256,uint256,uint256,address,uint256)"); // Deprecated
    addRoleCapability(ADMINISTRATION_ROLE, "finalizePayment(uint256,uint256,uint256)"); // Deprecated
  }

  function addRoleCapability(uint8 role, bytes memory sig) private {
    bytes4 functionSig = bytes4(keccak256(sig));
    setRoleCapability(role, colony, functionSig, true);
  }
}
