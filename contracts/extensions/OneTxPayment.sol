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

import "./ColonyExtension.sol";
import "./../common/BasicMetaTransaction.sol";

// ignore-file-swc-108


contract OneTxPayment is ColonyExtension, BasicMetaTransaction {
  event OneTxPaymentMade(address agent, uint256 fundamentalId, uint256 nPayouts);

  ColonyDataTypes.ColonyRole constant ADMINISTRATION = ColonyDataTypes.ColonyRole.Administration;
  ColonyDataTypes.ColonyRole constant FUNDING = ColonyDataTypes.ColonyRole.Funding;

  mapping(address => uint256) metatransactionNonces;
  function getMetatransactionNonce(address userAddress) override public view returns (uint256 nonce){
    return metatransactionNonces[userAddress];
  }

  function incrementMetatransactionNonce(address user) override internal {
    metatransactionNonces[user]++;
  }

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("OneTxPayment");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 3;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {} // solhint-disable-line no-empty-blocks

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {} // solhint-disable-line no-empty-blocks

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }

  bytes4 constant MAKE_PAYMENT_SIG = bytes4(keccak256(
    "makePayment(uint256,uint256,uint256,uint256,address[],address[],uint256[],uint256,uint256)"
  ));

  bytes4 constant MAKE_PAYMENT_DOMAIN_SIG = bytes4(keccak256(
    "makePaymentFundedFromDomain(uint256,uint256,uint256,uint256,address[],address[],uint256[],uint256,uint256)"
  ));

  bytes32 constant REQUIRED_ROLES = (
    bytes32(uint256(1)) << uint8(FUNDING) |
    bytes32(uint256(1)) << uint8(ADMINISTRATION)
  );

  /// @notice Return the permissions required for each function
  /// @param _sig The function signature
  /// @return The byte32 of permissions required
  function getCapabilityRoles(bytes4 _sig) public view override returns (bytes32) {
    if (_sig == MAKE_PAYMENT_SIG || _sig == MAKE_PAYMENT_DOMAIN_SIG) {
      return REQUIRED_ROLES;
    } else {
      return bytes32(0);
    }
  }

  /// @notice Completes a colony payment in a single transaction
  /// @dev Assumes that each entity holds administration and funding roles in the root domain
  /// @param _permissionDomainId The domainId in which the _contract_ has permissions to add a payment and fund it
  /// @param _childSkillIndex Index of the _permissionDomainId skill.children array to get
  /// @param _callerPermissionDomainId The domainId in which the _caller_ has the administration permission (must have funding in root)
  /// @param _callerChildSkillIndex Index of the _callerPermissionDomainId skill.children array to get
  /// @param _workers The addresses of the recipients of the payment
  /// @param _tokens Addresses of the tokens the payments are being made in. 0x00 for Ether.
  /// @param _amounts amounts of the tokens being paid out
  /// @param _domainId The domainId the payment should be coming from
  /// @param _skillId The skillId that the payment should be marked with, possibly awarding reputation in this skill.
  function makePayment(
    uint256 _permissionDomainId, // Unused
    uint256 _childSkillIndex,
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    address payable[] memory _workers,
    address[] memory _tokens,
    uint256[] memory _amounts,
    uint256 _domainId,
    uint256 _skillId
  )
    public
  {
    require(_workers.length == _tokens.length && _workers.length == _amounts.length, "one-tx-payment-invalid-input");

    require(
      colony.hasInheritedUserRole(msgSender(), 1, FUNDING, _childSkillIndex, _domainId) &&
      colony.hasInheritedUserRole(msgSender(), _callerPermissionDomainId, ADMINISTRATION, _callerChildSkillIndex, _domainId),
      "one-tx-payment-not-authorized"
    );


    if (_workers.length == 1) {

      uint256 paymentId = colony.addPayment(1, _childSkillIndex, _workers[0], _tokens[0], _amounts[0], _domainId, _skillId);
      uint256 fundingPotId = colony.getPayment(paymentId).fundingPotId;

      colony.moveFundsBetweenPots(1, UINT256_MAX, _childSkillIndex, 1, fundingPotId, _amounts[0], _tokens[0]);

      colony.finalizePayment(1, _childSkillIndex, paymentId);
      colony.claimPayment(paymentId, _tokens[0]);

      emit OneTxPaymentMade(msgSender(), paymentId, _workers.length);
    } else {

      uint256 expenditureId = colony.makeExpenditure(1, _childSkillIndex, _domainId);
      uint256 fundingPotId = colony.getExpenditure(expenditureId).fundingPotId;

      prepareFunding(_childSkillIndex, fundingPotId, _tokens, _amounts);

      uint256 idx;
      uint256 slot;

      for (idx = 0; idx < _workers.length; idx++) {

         // If a new worker, start a new slot
        if (idx == 0 || _workers[idx] != _workers[idx-1]) {
          require(idx == 0 || _workers[idx] > _workers[idx-1], "one-tx-payment-bad-worker-order");

          slot++;
          colony.setExpenditureRecipient(expenditureId, slot, _workers[idx]);

          if (_skillId != 0) {
            colony.setExpenditureSkill(expenditureId, slot, _skillId);
          }
        } else {
          require(_tokens[idx] > _tokens[idx-1], "one-tx-payment-bad-token-order");
        }

        colony.setExpenditurePayout(expenditureId, slot, _tokens[idx], _amounts[idx]);
      }

      finalizeAndClaim(expenditureId, _workers, _tokens);

      emit OneTxPaymentMade(msgSender(), expenditureId, _workers.length);
    }
  }

  /// @notice Completes a colony payment in a single transaction
  /// @dev Assumes that each entity holds administration and funding roles in the same domain,
  ///   although contract and caller can have the permissions in different domains.
  /// Payment is taken from domain funds - if the domain does not have sufficient funds, call will fail.
  /// @param _permissionDomainId The domainId in which the _contract_ has permissions to add a payment and fund it
  /// @param _childSkillIndex Index of the _permissionDomainId skill.children array to get
  /// @param _callerPermissionDomainId The domainId in which the _caller_ has permissions to add a payment and fund it
  /// @param _callerChildSkillIndex Index of the _callerPermissionDomainId skill.children array to get
  /// @param _workers The addresses of the recipients of the payment
  /// @param _tokens The addresses of the token the payments are being made in. 0x00 for Ether.
  /// @param _amounts The amounts of the tokens being paid out
  /// @param _domainId The domainId the payment should be coming from
  /// @param _skillId The skillId that the payment should be marked with, possibly awarding reputation in this skill.
  function makePaymentFundedFromDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    address payable[] memory  _workers,
    address[] memory _tokens,
    uint256[] memory _amounts,
    uint256 _domainId,
    uint256 _skillId
  )
    public
  {
    require(_workers.length == _tokens.length && _workers.length == _amounts.length, "one-tx-payment-invalid-input");

    require(
      colony.hasInheritedUserRole(msgSender(), _callerPermissionDomainId, FUNDING, _callerChildSkillIndex, _domainId) &&
      colony.hasInheritedUserRole(msgSender(), _callerPermissionDomainId, ADMINISTRATION, _callerChildSkillIndex, _domainId),
      "one-tx-payment-not-authorized"
    );

    if (_workers.length == 1) {

      uint256 paymentId = colony.addPayment(_permissionDomainId, _childSkillIndex, _workers[0], _tokens[0], _amounts[0], _domainId, _skillId);
      uint256 fundingPotId = colony.getPayment(paymentId).fundingPotId;
      uint256 domainPotId = colony.getDomain(_domainId).fundingPotId;

      // We use a separate function to get around the local variable limit :(
      moveFundsWithinDomain(_permissionDomainId, _childSkillIndex, domainPotId, fundingPotId, _amounts[0], _tokens[0]);

      colony.finalizePayment(_permissionDomainId, _childSkillIndex, paymentId);
      colony.claimPayment(paymentId, _tokens[0]);

      emit OneTxPaymentMade(msgSender(), paymentId, _workers.length);
    } else {

      uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, _domainId);
      uint256 fundingPotId = colony.getExpenditure(expenditureId).fundingPotId;
      uint256 domainPotId = colony.getDomain(_domainId).fundingPotId;

      prepareFundingWithinDomain(_permissionDomainId, _childSkillIndex, domainPotId, fundingPotId, _tokens, _amounts);

      uint256 idx;
      uint256 slot;

      for (idx = 0; idx < _workers.length; idx++) {

         // If a new worker, start a new slot
        if (idx == 0 || _workers[idx] != _workers[idx-1]) {
          require(idx == 0 || _workers[idx] > _workers[idx-1], "one-tx-payment-bad-worker-order");

          slot++;
          colony.setExpenditureRecipient(expenditureId, slot, _workers[idx]);

          if (_skillId != 0) {
            colony.setExpenditureSkill(expenditureId, slot, _skillId);
          }
        } else {
          require(_tokens[idx] > _tokens[idx-1], "one-tx-payment-bad-token-order");
        }

        colony.setExpenditurePayout(expenditureId, slot, _tokens[idx], _amounts[idx]);
      }

      finalizeAndClaim(expenditureId, _workers, _tokens);

      emit OneTxPaymentMade(msgSender(), expenditureId, _workers.length);
    }
  }

  function calculateUniqueAmounts(
    address[] memory _tokens,
    uint256[] memory _amounts
  )
    internal
    pure
    returns (uint256, address[] memory, uint256[] memory)
  {
    uint256 uniqueTokensIdx;
    address[] memory uniqueTokens = new address[](_tokens.length);
    uint256[] memory uniqueAmounts = new uint256[](_tokens.length);

    for (uint256 i; i < _tokens.length; i++) {

      bool isMatch;
      uint256 j;

      while (j < uniqueTokensIdx && !isMatch) {
        if (_tokens[i] == uniqueTokens[j]) {
          isMatch = true;
          uniqueAmounts[j] = add(uniqueAmounts[j], _amounts[i]);
        }
        j++;
      }

      if (!isMatch) {
        uniqueTokens[uniqueTokensIdx] = _tokens[i];
        uniqueAmounts[uniqueTokensIdx] = _amounts[i];
        uniqueTokensIdx++;
      }

    }

    return (uniqueTokensIdx, uniqueTokens, uniqueAmounts);
  }

  function prepareFunding(
    uint256 _childSkillIndex,
    uint256 _fundingPotId,
    address[] memory _tokens,
    uint256[] memory _amounts
  ) internal {
    (
      uint256 uniqueTokensIdx,
      address[] memory uniqueTokens,
      uint256[] memory uniqueAmounts
    ) = calculateUniqueAmounts(_tokens, _amounts);

    for (uint256 i; i < uniqueTokensIdx; i++) {
      colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        _childSkillIndex,
        1,
        _fundingPotId,
        uniqueAmounts[i],
        uniqueTokens[i]
      );
    }
  }

  function prepareFundingWithinDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainPotId,
    uint256 _fundingPotId,
    address[] memory _tokens,
    uint256[] memory _amounts
  ) internal {
    (
      uint256 uniqueTokensIdx,
      address[] memory uniqueTokens,
      uint256[] memory uniqueAmounts
    ) = calculateUniqueAmounts(_tokens, _amounts);

    for (uint256 i; i < uniqueTokensIdx; i++) {
      colony.moveFundsBetweenPots(
        _permissionDomainId,
        _childSkillIndex,
        _childSkillIndex,
        _domainPotId,
        _fundingPotId,
        uniqueAmounts[i],
        uniqueTokens[i]
      );
    }
  }

  function moveFundsWithinDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainPotId,
    uint256 _fundingPotId,
    uint256 _amount,
    address _token
  )
    internal
  {
    colony.moveFundsBetweenPots(_permissionDomainId, _childSkillIndex, _childSkillIndex, _domainPotId, _fundingPotId, _amount, _token);
  }

  function finalizeAndClaim(uint256 _expenditureId, address payable[] memory  _workers, address[] memory _tokens) internal {
    colony.finalizeExpenditure(_expenditureId);

    uint256 slot;

    for (uint256 idx; idx < _workers.length; idx++) {
      if (idx == 0 || _workers[idx] != _workers[idx-1]) {
        slot++;
      }
      colony.claimExpenditurePayout(_expenditureId, slot, _tokens[idx]);
    }
  }
}
