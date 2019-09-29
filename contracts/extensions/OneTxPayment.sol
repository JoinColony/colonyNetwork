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

pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "./../colony/ColonyAuthority.sol";
import "./../colony/ColonyDataTypes.sol";
import "./../colony/IColony.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./ColonyExtension.sol";

// ignore-file-swc-108

contract OneTxPayment is ColonyExtension {
  uint256 constant UINT256_MAX = 2**256 - 1;
  bytes4 constant ADD_PAYMENT_SIG = bytes4(keccak256("addPayment(uint256,uint256,address,address,uint256,uint256,uint256)"));
  bytes4 constant MOVE_FUNDS_SIG = bytes4(keccak256("moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"));

  IColonyNetwork colonyNetwork;

  /// @notice Returns the version of the extension
  function version() public pure returns (uint256) {
    return 1;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
  }

  /// @notice Called when upgrading the extension (currently a no-op since this OneTxPayment does not support upgrading)
  function upgrade() public auth {}

  /// @notice Called when uninstalling the extension
  function uninstall() public auth {
    selfdestruct(address(uint160(address(colony))));
  }

  /// @notice Completes a colony payment in a single transaction
  /// @dev Assumes that each entity holds administration and funding roles in the same domain,
  /// although contract and caller can have the permissions in different domains.
  /// Payment is taken from root domain, and the caller must have funding permission explicitly in the root domain
  /// @param _permissionDomainId The domainId in which the _contract_ has permissions to add a payment and fund it
  /// @param _childSkillIndex Index of the _permissionDomainId skill.children array to get
  /// @param _callerPermissionDomainId The domainId in which the _caller_ has permissions to add a payment and fund it
  /// @param _callerChildSkillIndex Index of the _callerPermissionDomainId skill.children array to get
  /// @param _workers The addresses of the recipients of the payment
  /// @param _tokens Addresses of the tokens the payments are being made in. 0x00 for Ether.
  /// @param _amounts amounts of the tokens being paid out
  /// @param _domainId The Id of the domain the payment should be coming from
  /// @param _skillId The Id of the skill that the payment should be marked with, possibly awarding reputation in this skill.
  function makePayment(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    address payable[] memory _workers,
    address[] memory _tokens,
    uint256[] memory _amounts,
    uint256 _domainId,
    uint256 _skillId) public
  {
    // Arrays must be of equal size
    require(
      _workers.length == _tokens.length && _workers.length == _amounts.length,
      "colony-one-tx-payment-arrays-must-be-equal-length"
    );
    // Check caller is able to call {add,finalize}Payment and moveFundsBetweenPots on the colony
    validateCallerPermissions(_callerPermissionDomainId, _callerChildSkillIndex, _domainId);
    // In addition, check the caller is able to call moveFundsBetweenPots from the root domain
    require(
      ColonyAuthority(colony.authority()).canCall(msg.sender, 1, address(colony), MOVE_FUNDS_SIG),
      "colony-one-tx-payment-root-funding-not-authorized"
    );
    // Get around stack too deep with array
    // paymentData[0] = expenditure slot
    // paymentData[1] = expenditureId/paymentId
    // paymentData[3] = fundingPotId
    uint256[3] memory paymentData;
    paymentData[0] = 0;
    if (_tokens.length > 1) {
      // Make a new expenditure
      paymentData[1] = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, _domainId);
      ColonyDataTypes.Expenditure memory expenditure = colony.getExpenditure(paymentData[1]);
      paymentData[2] = expenditure.fundingPotId;
      colony.setExpenditureRecipient(paymentData[1], paymentData[0], _workers[0]);
      colony.setExpenditureSkill(paymentData[1], paymentData[0], _skillId);
    } else {
      // Add a new payment
      paymentData[1] = colony.addPayment(
        _permissionDomainId,
        _childSkillIndex,
        _workers[0],
        _tokens[0],
        _amounts[0],
        _domainId,
        _skillId);
      ColonyDataTypes.Payment memory payment = colony.getPayment(paymentData[1]);
      paymentData[2] = payment.fundingPotId;
    }

    for (uint256 index = 0; index < _workers.length; index++) {
      if (_tokens.length > 1) {
        if (index != 0 && _workers[index] != _workers[index-1]) {
          paymentData[0]++;
          colony.setExpenditureRecipient(paymentData[1], paymentData[0], _workers[index]);
          colony.setExpenditureSkill(paymentData[1], paymentData[0], _skillId);
          }
        colony.setExpenditurePayout(paymentData[1], paymentData[0], _tokens[index], _amounts[index]);
      }
      // Fund the payment
      colony.moveFundsBetweenPots(
        1, // Root domain always 1
        UINT256_MAX, // Not used, this extension must have funding permission in the root for this function to work
        _childSkillIndex,
        1, // Root domain funding pot is always 1
        paymentData[2],
        _amounts[index],
        _tokens[index]
      );
    }
    if (_tokens.length > 1) {
      colony.finalizeExpenditure(paymentData[1]);
      paymentData[0] = 0;
      // Claim payout on behalf of the recipients
      for (uint256 index = 0; index < _workers.length; index++) {
        if (index != 0 && _workers[index] != _workers[index-1]) {
          paymentData[0]++;
        }
        colony.claimExpenditurePayout(paymentData[1], paymentData[0], _tokens[index]);
      }
    } else {
      colony.finalizePayment(_permissionDomainId, _childSkillIndex, paymentData[1]);
      // Claim payout on behalf of the recipient
      colony.claimPayment(paymentData[1], _tokens[0]);
    }
  }

  /// @notice Completes a colony payment in a single transaction
  /// @dev Assumes that each entity holds administration and funding roles in the same domain,
  /// although contract and caller can have the permissions in different domains.
  /// Payment is taken from domain funds - if the domain does not have sufficient funds, call will fail.
  /// @param _permissionDomainId The domainId in which the _contract_ has permissions to add a payment and fund it
  /// @param _childSkillIndex Index of the _permissionDomainId skill.children array to get
  /// @param _callerPermissionDomainId The domainId in which the _caller_ has permissions to add a payment and fund it
  /// @param _callerChildSkillIndex Index of the _callerPermissionDomainId skill.children array to get
  /// @param _workers The addresses of the recipients of the payment
  /// @param _tokens The addresses of the token the payments are being made in. 0x00 for Ether.
  /// @param _amounts The amounts of the tokens being paid out
  /// @param _domainId The Id of the domain the payment should be coming from
  /// @param _skillId The Id of the skill that the payment should be marked with, possibly awarding reputation in this skill.
  function makePaymentFundedFromDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    address payable[] memory  _workers,
    address[] memory _tokens,
    uint256[] memory _amounts,
    uint256 _domainId,
    uint256 _skillId) public
  {
    // Check caller is able to call {add,finalize}Payment and moveFundsBetweenPots on the colony
    validateCallerPermissions(_callerPermissionDomainId, _callerChildSkillIndex, _domainId);
    //Arrays must be of equal size
    require(
      _workers.length == _tokens.length && _workers.length == _amounts.length,
      "colony-one-tx-payment-arrays-must-be-equal-length"
    );
    // Get around stack too deep with array
    // paymentData[0] = expenditure slot
    // paymentData[1] = expenditureId/paymentId
    // paymentData[3] = fundingPotId
    uint256[3] memory paymentData;
    paymentData[0] = 0;
    ColonyDataTypes.Domain memory domain = colony.getDomain(_domainId);
    if (_tokens.length > 1) {
      // Make a new expenditure
      paymentData[1] = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, _domainId);
      ColonyDataTypes.Expenditure memory expenditure = colony.getExpenditure(paymentData[1]);
      paymentData[2] = expenditure.fundingPotId;
      colony.setExpenditureRecipient(paymentData[1], paymentData[0], _workers[0]);
      colony.setExpenditureSkill(paymentData[1], paymentData[0], _skillId);
    } else {
      // Add a new payment
      paymentData[1] = colony.addPayment(
        _permissionDomainId,
        _childSkillIndex,
        _workers[0],
        _tokens[0],
        _amounts[0],
        _domainId,
        _skillId);
      ColonyDataTypes.Payment memory payment = colony.getPayment(paymentData[1]);
      paymentData[2] = payment.fundingPotId;
    }
    for (uint256 index = 0; index < _workers.length; index++) {
      if (_tokens.length > 1) {
        if (index != 0 && _workers[index] != _workers[index-1]) {
          paymentData[0]++;
          colony.setExpenditureRecipient(paymentData[1], paymentData[0], _workers[index]);
          colony.setExpenditureSkill(paymentData[1], paymentData[0], _skillId);
          }
        colony.setExpenditurePayout(paymentData[1], paymentData[0], _tokens[index], _amounts[index]);
      }
      // Fund the payment
      colony.moveFundsBetweenPots(
        _permissionDomainId,
        _childSkillIndex,
        _childSkillIndex,
        domain.fundingPotId,
        paymentData[2],
        _amounts[index],
        _tokens[index]
      );
    }
    if (_tokens.length > 1) {
      colony.finalizeExpenditure(paymentData[1]);
      paymentData[0] = 0;
      // Claim payout on behalf of the recipients
      for (uint256 index = 0; index < _workers.length; index++) {
        if (index != 0 && _workers[index] != _workers[index-1]) {
          paymentData[0]++;
        }
        colony.claimExpenditurePayout(paymentData[1], paymentData[0], _tokens[index]);
      }
    } else {
      colony.finalizePayment(_permissionDomainId, _childSkillIndex, paymentData[1]);
      // Claim payout on behalf of the recipient
      colony.claimPayment(paymentData[1], _tokens[0]);
    }
  }

  function validateCallerPermissions(
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    uint256 _domainId) internal view
  {
    require(
      ColonyAuthority(colony.authority()).canCall(msg.sender, _callerPermissionDomainId, address(colony), ADD_PAYMENT_SIG),
      "colony-one-tx-payment-administration-not-authorized"
    );
    require(
      ColonyAuthority(colony.authority()).canCall(msg.sender, _callerPermissionDomainId, address(colony), MOVE_FUNDS_SIG),
      "colony-one-tx-payment-funding-not-authorized"
    );

    if (_callerPermissionDomainId != _domainId) {
      uint256 permissionSkillId = colony.getDomain(_callerPermissionDomainId).skillId;
      uint256 domainSkillId = colony.getDomain(_domainId).skillId;
      require(domainSkillId > 0, "colony-one-tx-payment-domain-does-not-exist");

      uint256 childSkillId = colonyNetwork.getChildSkillId(permissionSkillId, _callerChildSkillIndex);
      require(childSkillId == domainSkillId, "colony-one-tx-payment-bad-child-skill");
    }
  }
}
