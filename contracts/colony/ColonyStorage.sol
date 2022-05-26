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
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/math.sol";
import "./../common/CommonStorage.sol";
import "./../common/ERC20Extended.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../extensions/ColonyExtension.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./ColonyAuthority.sol";
import "./ColonyDataTypes.sol";

// ignore-file-swc-131
// ignore-file-swc-108


contract ColonyStorage is ColonyDataTypes, ColonyNetworkDataTypes, DSMath, CommonStorage {
  uint256 constant COLONY_NETWORK_SLOT = 6;
  uint256 constant ROOT_LOCAL_SKILL_SLOT = 36;

  // Storage

  // When adding variables, do not make them public, otherwise all contracts that inherit from
  // this one will have the getters. Make custom getters in the contract that seems most appropriate,
  // and add it to IColony.sol

  address colonyNetworkAddress; // Storage slot 6
  address token; // Storage slot 7
  uint256 rewardInverse; // Storage slot 8

  uint256 taskCount; // Storage slot 9
  uint256 fundingPotCount; // Storage slot 10
  uint256 domainCount; // Storage slot 11

  // Mapping function signature to 2 task roles whose approval is needed to execute
  mapping (bytes4 => TaskRole[2]) reviewers; // Storage slot 12

  // Role assignment functions require special type of sign-off.
  // This keeps track of which functions are related to role assignment
  mapping (bytes4 => bool) roleAssignmentSigs; // Storage slot 13

  mapping (uint256 => Task) tasks; // Storage slot 14

  // FundingPots can be tied to tasks or domains, so giving them their own mapping.
  // FundingPot 1 can be thought of as the pot belonging to the colony itself that hasn't been assigned
  // to anything yet, but has had some siphoned off in to the reward pot.
  // FundingPot 0 is the 'reward' pot containing funds that can be paid to holders of colony tokens in the future.
  mapping (uint256 => FundingPot) fundingPots; // Storage slot 15

  // Keeps track of all reward payout cycles
  mapping (uint256 => RewardPayoutCycle) rewardPayoutCycles; // Storage slot 16

  mapping (address => uint256) pendingRewardPayments; // Storage slot 17

  // This keeps track of how much of the colony's funds that it owns have been moved into funding pots other than pot 0,
  // which (by definition) have also had the reward amount siphoned off and put in to pot 0.
  // This is decremented whenever a payout occurs and the colony loses control of the funds.
  mapping (address => uint256) nonRewardPotsTotal; // Storage slot 18

  mapping (uint256 => RatingSecrets) public taskWorkRatings; // Storage slot 19

  mapping (uint256 => Domain) public domains; // Storage slot 20

  // Mapping task id to current "active" nonce for executing task changes
  mapping (uint256 => uint256) taskChangeNonces; // Storage slot 21

  uint256 paymentCount; // Storage slot 22
  mapping (uint256 => Payment) payments; // Storage slot 23

  uint256 expenditureCount; // Storage slot 24
  mapping (uint256 => Expenditure) expenditures; // Storage slot 25
  mapping (uint256 => mapping (uint256 => ExpenditureSlot)) expenditureSlots; // Storage slot 26
  mapping (uint256 => mapping (uint256 => mapping (address => uint256))) expenditureSlotPayouts; // Storage slot 27

  // Used for stake management ([user][approvee][domainId] => amount)
  mapping (address => mapping (address => mapping (uint256 => uint256))) approvals; // Storage slot 28
  mapping (address => mapping (address => mapping (uint256 => uint256))) obligations; // Storage slot 29

  address tokenLockingAddress; // Storage slot 30

  mapping (address => mapping (uint256 => bool)) tokenLocks; // Storage slot 31

  // Mapping of token address -> address approved -> amount approved
  mapping (address => mapping (address => uint256 )) tokenApprovals; // Storage slot 32

  // Mapping of token address -> total amount approved
  mapping (address => uint256 ) tokenApprovalTotals; // Storage slot 33

  uint256 defaultGlobalClaimDelay; // Storage slot 34

  uint256 constant METATRANSACTION_NONCES_SLOT = 35;
  mapping(address => uint256) metatransactionNonces; // Storage slot 35

  uint256 rootLocalSkill; // Storage slot 36
  mapping (uint256 => bool) localSkills; // Storage slot 37

  // Constants

  uint256 constant MAX_PAYOUT = 2**128 - 1; // 340,282,366,920,938,463,463 WADs
  bytes32 constant ROOT_ROLES = bytes32(uint256(1)) << uint8(ColonyRole.Recovery) | bytes32(uint256(1)) << uint8(ColonyRole.Root);
  bytes32 constant BYTES32_1 = bytes32(uint256(1));

  // Modifiers

  modifier domainNotDeprecated(uint256 _id) {
    require(
      !IColonyNetwork(colonyNetworkAddress).getSkill(domains[_id].skillId).deprecated,
      "colony-domain-deprecated"
    );
    _;
  }

  modifier validPayoutAmount(uint256 _amount) {
    require(_amount <= MAX_PAYOUT, "colony-payout-too-large");
    _;
  }

  modifier paymentFunded(uint256 _id) {
    FundingPot storage fundingPot = fundingPots[payments[_id].fundingPotId];
    require(fundingPot.payoutsWeCannotMake == 0, "colony-payment-not-funded");
    _;
  }

  modifier paymentNotFinalized(uint256 _id) {
    require(!payments[_id].finalized, "colony-payment-finalized");
    _;
  }

  modifier paymentFinalized(uint256 _id) {
    require(payments[_id].finalized, "colony-payment-not-finalized");
    _;
  }

  modifier confirmTaskRoleIdentity(uint256 _id, TaskRole _role) {
    Role storage role = tasks[_id].roles[uint8(_role)];
    require(msgSender() == role.user, "colony-task-role-identity-mismatch");
    _;
  }

  modifier taskExists(uint256 _id) {
    require(_id > 0 && _id <= taskCount, "colony-task-does-not-exist");
    _;
  }

  modifier taskNotFinalized(uint256 _id) {
    require(tasks[_id].status != TaskStatus.Finalized, "colony-task-already-finalized");
    _;
  }

  modifier taskFinalized(uint256 _id) {
    require(tasks[_id].status == TaskStatus.Finalized, "colony-task-not-finalized");
    _;
  }

  modifier expenditureExists(uint256 _id) {
    require(_id > 0 && _id <= expenditureCount, "colony-expenditure-does-not-exist");
    _;
  }

  modifier expenditureDraft(uint256 _id) {
    require(expenditures[_id].status == ExpenditureStatus.Draft, "colony-expenditure-not-draft");
    _;
  }

  modifier expenditureDraftOrLocked(uint256 _id) {
    require(
      expenditures[_id].status == ExpenditureStatus.Draft ||
      expenditures[_id].status == ExpenditureStatus.Locked,
      "colony-expenditure-not-draft-or-locked"
    );
    _;
  }

  modifier expenditureFinalized(uint256 _id) {
    require(expenditures[_id].status == ExpenditureStatus.Finalized, "colony-expenditure-not-finalized");
    _;
  }

  modifier expenditureOnlyOwner(uint256 _id) {
    require(expenditures[_id].owner == msgSender(), "colony-expenditure-not-owner");
    _;
  }

  modifier validGlobalOrLocalSkill(uint256 _skillId) {
    require(isValidGlobalOrLocalSkill(_skillId), "colony-not-valid-global-or-local-skill");
    _;
  }

  modifier taskComplete(uint256 _id) {
    require(tasks[_id].completionTimestamp > 0, "colony-task-not-complete");
    _;
  }

  modifier taskNotComplete(uint256 _id) {
    require(tasks[_id].completionTimestamp == 0, "colony-task-complete");
    _;
  }

  modifier validFundingTransfer(uint256 _fromPot, uint256 _toPot) {
    // Prevent moving funds from between the same pot, which otherwise would cause the pot balance to increment by _amount.
    require(_fromPot != _toPot, "colony-funding-cannot-move-funds-between-the-same-pot");

    // Prevent people moving funds from the pot designated to paying out token holders
    require(_fromPot > 0, "colony-funding-cannot-move-funds-from-rewards-pot");
    _;
  }

  modifier isInBootstrapPhase() {
    require(taskCount == 0 && expenditureCount == 0 && paymentCount == 0, "colony-not-in-bootstrap-mode");
    _;
  }

  // Note that these require messages currently cannot propogate up because of the `executeTaskRoleAssignment` logic
  modifier isAdmin(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, address _user) {
    require(ColonyAuthority(address(authority)).hasUserRole(_user, _permissionDomainId, uint8(ColonyRole.Administration)), "colony-not-admin");
    require(validateDomainInheritance(_permissionDomainId, _childSkillIndex, tasks[_id].domainId), "ds-auth-invalid-domain-inheritence");
    _;
  }

  modifier self() {
    require(address(this) == msgSender(), "colony-not-self");
    _;
  }

  modifier onlyOwnExtension() {
    require(isOwnExtension(msgSender()), "colony-must-be-own-extension");
    assert(msgSender() == msg.sender);
    _;
  }

  modifier auth override {
    require(isAuthorized(msgSender(), 1, msg.sig), "ds-auth-unauthorized");
    _;
  }

  modifier authDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _childDomainId) {
    require(domainExists(_permissionDomainId), "ds-auth-permission-domain-does-not-exist");
    require(domainExists(_childDomainId), "ds-auth-child-domain-does-not-exist");
    require(isAuthorized(msgSender(), _permissionDomainId, msg.sig), "ds-auth-unauthorized");
    require(validateDomainInheritance(_permissionDomainId, _childSkillIndex, _childDomainId), "ds-auth-invalid-domain-inheritence");
    _;
  }

  modifier archSubdomain(uint256 _permissionDomainId, uint256 _childDomainId) {
    if (canCallOnlyBecauseArchitect(msgSender(), _permissionDomainId, msg.sig)) {
      require(_permissionDomainId != _childDomainId, "ds-auth-only-authorized-in-child-domain");
    }
    _;
  }

  // Evaluates a "domain proof" which checks that childDomainId is part of the subtree starting at permissionDomainId
  function validateDomainInheritance(uint256 permissionDomainId, uint256 childSkillIndex, uint256 childDomainId) internal view returns (bool) {
    if (permissionDomainId == childDomainId) {
      return childSkillIndex == UINT256_MAX;
    } else {
      uint256 childSkillId = IColonyNetwork(colonyNetworkAddress).getChildSkillId(domains[permissionDomainId].skillId, childSkillIndex);
      return childSkillId == domains[childDomainId].skillId;
    }
  }

  // Checks to see if the permission comes ONLY from the Architecture role (i.e. user does not have root, etc.)
  function canCallOnlyBecauseArchitect(address src, uint256 domainId, bytes4 sig) internal view returns (bool) {
    return DomainRoles(address(authority)).canCallOnlyBecause(src, domainId, uint8(ColonyRole.Architecture), address(this), sig);
  }

  function isAuthorized(address src, uint256 domainId, bytes4 sig) internal view returns (bool) {
    return (src == owner) || DomainRoles(address(authority)).canCall(src, domainId, address(this), sig);
  }

  function isContract(address addr) internal returns (bool) {
    uint256 size;
    assembly { size := extcodesize(addr) }
    return size > 0;
  }

  function isOwnExtension(address addr) internal returns (bool) {
    if (!isContract(addr)) {
      return false;
    }

    // slither-disable-next-line unused-return
    try ColonyExtension(addr).identifier() returns (bytes32 extensionId) {
      return IColonyNetwork(colonyNetworkAddress).getExtensionInstallation(extensionId, address(this)) == addr;
    } catch {
      return false;
    }
  }

  function isExtension(address addr) internal returns (bool) {
    if (!isContract(addr)) {
      return false;
    }

    // slither-disable-next-line unused-return
    try ColonyExtension(addr).identifier() returns (bytes32 extensionId) {
      // slither-disable-next-line unused-return
      try ColonyExtension(addr).getColony() returns (address claimedAssociatedColony) {
        return IColonyNetwork(colonyNetworkAddress).getExtensionInstallation(extensionId, claimedAssociatedColony) == addr;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  function isValidGlobalOrLocalSkill(uint256 skillId) internal view returns (bool) {
    Skill memory skill = IColonyNetwork(colonyNetworkAddress).getSkill(skillId);
    return (skill.globalSkill || localSkills[skillId]) && !skill.deprecated;
  }

  function domainExists(uint256 domainId) internal view returns (bool) {
    return domainId > 0 && domainId <= domainCount;
  }

  function calculateNetworkFeeForPayout(uint256 _payout) internal view returns (uint256 fee) {
    uint256 feeInverse = IColonyNetwork(colonyNetworkAddress).getFeeInverse();

    // slither-disable-next-line incorrect-equality
    if (_payout == 0 || feeInverse == 1) {
      fee = _payout;
    } else {
      fee = _payout / feeInverse + 1;
    }
  }

  function executeCall(address to, uint256 value, bytes memory data) internal returns (bool success) {
    assembly {
              // call contract at address a with input mem[in…(in+insize))
              //   providing g gas and v wei and output area mem[out…(out+outsize))
              //   returning 0 on error (eg. out of gas) and 1 on success

              // call(g,     a,  v,     in,              insize,      out, outsize)
      success := call(gas(), to, value, add(data, 0x20), mload(data), 0, 0)
    }
  }
}
