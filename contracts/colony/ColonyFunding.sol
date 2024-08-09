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

pragma solidity 0.8.27;
pragma experimental "ABIEncoderV2";

import { ITokenLocking } from "./../tokenLocking/ITokenLocking.sol";
import { ColonyStorage } from "./ColonyStorage.sol";
import { ERC20Extended } from "./../common/ERC20Extended.sol";
import { IColonyNetwork } from "./../colonyNetwork/IColonyNetwork.sol";
import { DomainTokenReceiver } from "./../common/DomainTokenReceiver.sol";

contract ColonyFunding is
  ColonyStorage // ignore-swc-123
{
  // Public

  function moveFundsBetweenPots(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    address _token
  )
    public
    stoppable
  {
    moveFundsBetweenPots(
      _permissionDomainId,
      _childSkillIndex,
      _domainId,
      _fromChildSkillIndex,
      _toChildSkillIndex,
      _fromPot,
      _toPot,
      _amount,
      block.chainid,
      _token
    );
  }

  function moveFundsBetweenPots(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    uint256 _chainId,
    address _token
  )
    public
    stoppable
    domainNotDeprecated(getDomainFromFundingPot(_toPot))
    authDomain(_permissionDomainId, _childSkillIndex, _domainId)
    validFundingTransfer(_fromPot, _toPot)
  {
    require(
      validateDomainInheritance(_domainId, _fromChildSkillIndex, getDomainFromFundingPot(_fromPot)),
      "colony-invalid-domain-inheritance"
    );
    require(
      validateDomainInheritance(_domainId, _toChildSkillIndex, getDomainFromFundingPot(_toPot)),
      "colony-invalid-domain-inheritance"
    );

    moveFundsBetweenPotsFunctionality(_fromPot, _toPot, _amount, _chainId, _token);
  }

  function moveFundsBetweenPots(
    uint256 _permissionDomainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    address _token
  )
    public
    stoppable
    domainNotDeprecated(getDomainFromFundingPot(_toPot))
    authDomain(_permissionDomainId, _fromChildSkillIndex, getDomainFromFundingPot(_fromPot))
    authDomain(_permissionDomainId, _toChildSkillIndex, getDomainFromFundingPot(_toPot))
    validFundingTransfer(_fromPot, _toPot)
  {
    moveFundsBetweenPotsFunctionality(_fromPot, _toPot, _amount, block.chainid, _token);
  }

  function claimColonyFunds(address _token) public stoppable {
    uint256 toClaim;
    uint256 feeToPay;
    uint256 remainder;
    if (_token == address(0x0)) {
      // It's ether
      toClaim =
        (address(this).balance - nonRewardPotsTotal[_token]) -
        getFundingPotBalance(0, _token);
    } else {
      // Assume it's an ERC 20 token.
      ERC20Extended targetToken = ERC20Extended(_token);
      toClaim =
        (targetToken.balanceOf(address(this)) - nonRewardPotsTotal[_token]) -
        getFundingPotBalance(0, _token); // ignore-swc-123
    }

    feeToPay = toClaim / getRewardInverse(); // ignore-swc-110 . This variable is set when the colony is
    // initialised to MAX_UINT, and cannot be set to zero via setRewardInverse, so this is a false positive. It *can* be set
    // to 0 via recovery mode, but a) That's not why MythX is balking here and b) There's only so much we can stop people being
    // able to do with recovery mode.
    remainder = toClaim - feeToPay;
    nonRewardPotsTotal[_token] += remainder;
    setFundingPotBalance(
      1,
      block.chainid,
      _token,
      getFundingPotBalance(1, block.chainid, _token) + remainder
    );
    setFundingPotBalance(
      0,
      block.chainid,
      _token,
      getFundingPotBalance(0, block.chainid, _token) + feeToPay
    );

    emit ColonyFundsClaimed(msgSender(), _token, feeToPay, remainder);
  }

  function claimDomainFunds(address _token, uint256 _domainId) public stoppable {
    require(domainExists(_domainId), "colony-funding-domain-does-not-exist");
    address domainTokenReceiverAddress = IColonyNetwork(colonyNetworkAddress)
      .idempotentDeployDomainTokenReceiver(_domainId);
    uint256 fundingPotId = domains[_domainId].fundingPotId;
    // It's deployed, so check current balance of pot

    uint256 claimAmount;

    if (_token == address(0x0)) {
      claimAmount = address(domainTokenReceiverAddress).balance;
    } else {
      claimAmount = ERC20Extended(_token).balanceOf(address(domainTokenReceiverAddress));
    }

    uint256 feeToPay = claimAmount / getRewardInverse(); // ignore-swc-110 . This variable is set when the colony is
    // initialised to MAX_UINT, and cannot be set to zero via setRewardInverse, so this is a false positive. It *can* be set
    // to 0 via recovery mode, but a) That's not why MythX is balking here and b) There's only so much we can stop people being
    // able to do with recovery mode.
    uint256 remainder = claimAmount - feeToPay;
    nonRewardPotsTotal[_token] += remainder;

    fundingPots[0].balance[_token] += feeToPay;

    uint256 approvedAmount = domainReputationTokenApprovals[_domainId][_token];
    if (!tokenEarnsReputationOnPayout(_token) || approvedAmount >= remainder) {
      // Either the token doesn't earn reputation or there is enough approval
      // Either way, the domain gets all the funds
      fundingPots[fundingPotId].balance[_token] += remainder;
      if (tokenEarnsReputationOnPayout(_token)) {
        // If it does earn reputation, deduct the approved amount
        domainReputationTokenApprovals[_domainId][_token] -= remainder;
      }
      emit DomainFundsClaimed(msgSender(), _token, _domainId, feeToPay, remainder);
    } else {
      // The token earns reputation and there is not enough approvalable
      // The domain gets what was approved
      fundingPots[fundingPotId].balance[_token] += approvedAmount;
      // And the rest goes to the root pot
      Domain storage rootDomain = domains[1];
      fundingPots[rootDomain.fundingPotId].balance[_token] += remainder - approvedAmount;
      domainReputationTokenApprovals[_domainId][_token] = 0;
      emit DomainFundsClaimed(msgSender(), _token, _domainId, feeToPay, approvedAmount);
      emit ColonyFundsClaimed(msgSender(), _token, 0, remainder - approvedAmount);
    }

    // Claim funds

    DomainTokenReceiver(domainTokenReceiverAddress).transferToColony(_token);
  }

  function tokenEarnsReputationOnPayout(address _token) internal view returns (bool) {
    return _token == token;
  }

  function editAllowedDomainTokenReceipt(
    uint256 _domainId,
    address _token,
    uint256 _amount,
    bool _add
  ) public stoppable auth {
    require(domainExists(_domainId), "colony-funding-domain-does-not-exist");
    require(tokenEarnsReputationOnPayout(_token), "colony-funding-token-does-not-earn-reputation");
    require(_domainId > 1, "colony-funding-root-domain");
    if (_add) {
      domainReputationTokenApprovals[_domainId][_token] += _amount;
    } else {
      domainReputationTokenApprovals[_domainId][_token] -= _amount;
    }
  }

  function getAllowedDomainTokenReceipt(
    uint256 _domainId,
    address _token
  ) public view returns (uint256) {
    return domainReputationTokenApprovals[_domainId][_token];
  }

  function getNonRewardPotsTotal(address _token) public view returns (uint256) {
    return nonRewardPotsTotal[_token];
  }

  /// @notice For owners to update payouts with one token and many slots
  function setExpenditurePayouts(
    uint256 _id,
    uint256[] memory _slots,
    address _token,
    uint256[] memory _amounts
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    setExpenditurePayoutsInternal(_id, _slots, block.chainid, _token, _amounts);
  }

  /// @notice For arbitrators to update payouts with one token and one slot
  function setExpenditurePayout(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _slot,
    address _token,
    uint256 _amount
  )
    public
    stoppable
  {
    setExpenditurePayout(_permissionDomainId, _childSkillIndex, _id, _slot, block.chainid, _token, _amount);
  }

  function setExpenditurePayout(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _slot,
    uint256 _chainId,
    address _token,
    uint256 _amount
  )
    public
    stoppable
    validExpenditure(_id)
    authDomain(_permissionDomainId, _childSkillIndex, expenditures[_id].domainId)
  {
    uint256[] memory slots = new uint256[](1);
    slots[0] = _slot;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = _amount;
    setExpenditurePayoutsInternal(_id, slots, _chainId, _token, amounts);
  }

  /// @notice For owners to update payouts with one token and one slot
  function setExpenditurePayout(
    uint256 _id,
    uint256 _slot,
    address _token,
    uint256 _amount
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    uint256[] memory slots = new uint256[](1);
    slots[0] = _slot;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = _amount;
    setExpenditurePayoutsInternal(_id, slots, block.chainid, _token, amounts);
  }

  int256 constant MAX_PAYOUT_MODIFIER = int256(WAD);
  int256 constant MIN_PAYOUT_MODIFIER = -int256(WAD);

  function claimExpenditurePayout(uint256 _id, uint256 _slot, address _token) public stoppable {
    claimExpenditurePayout(_id, _slot, block.chainid, _token);
  }

  function claimExpenditurePayout(
    uint256 _id,
    uint256 _slot,
    uint256 _chainId,
    address _token
  ) public stoppable expenditureFinalized(_id) {
    Expenditure storage expenditure = expenditures[_id];
    ExpenditureSlot storage slot = expenditureSlots[_id][_slot];

    // First two checks prevent overflows
    require(
      type(uint256).max - expenditure.globalClaimDelay > slot.claimDelay &&
        type(uint256).max - expenditure.globalClaimDelay - slot.claimDelay >
        expenditure.finalizedTimestamp &&
        expenditure.finalizedTimestamp + expenditure.globalClaimDelay + slot.claimDelay <=
        block.timestamp,
      "colony-expenditure-cannot-claim"
    );

    uint256 fundingPotId = expenditure.fundingPotId;
    assert(
      getFundingPotBalance(fundingPotId, _chainId, _token) >=
        getFundingPotPayout(fundingPotId, _chainId, _token)
    );

    uint256 repPayout;
    uint256 tokenPayout;

    {
      uint256 initialPayout = getExpenditureSlotPayout(_id, _slot, _chainId, _token);
      setExpenditureSlotPayout(_id, _slot, _chainId, _token, 0);

      int256 payoutModifier = imin(
        imax(slot.payoutModifier, MIN_PAYOUT_MODIFIER),
        MAX_PAYOUT_MODIFIER
      );
      uint256 payoutScalar = uint256(payoutModifier + int256(WAD));
      repPayout = wmul(initialPayout, payoutScalar);
      tokenPayout = min(initialPayout, repPayout);
      uint256 tokenSurplus = initialPayout - tokenPayout;

      // Deduct any surplus from the outstanding payouts (for payoutScalars < 1)

      if (tokenSurplus > 0) {
        // UNCOMMENT
        uint256 oldFundingPotPayout = getFundingPotPayout(fundingPotId, _chainId, _token);
        setFundingPotPayout(fundingPotId, _chainId, _token, oldFundingPotPayout - tokenSurplus);
      }
    }

    // Process reputation updates if internal token
    if (_token == token && !isExtension(slot.recipient)) {
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      colonyNetworkContract.appendReputationUpdateLog(
        slot.recipient,
        int256(repPayout),
        domains[expenditure.domainId].skillId
      );
      if (slot.skills.length > 0 && slot.skills[0] > 0) {
        // Currently we support at most one skill per Expenditure, but this will likely change in the future.
        colonyNetworkContract.appendReputationUpdateLog(
          slot.recipient,
          int256(repPayout),
          slot.skills[0]
        );
      }
    }

    // Finish the payout
    uint256 payoutMinusFee = processPayout(
      expenditure.fundingPotId,
      _chainId,
      _token,
      tokenPayout,
      slot.recipient
    );

    emit PayoutClaimed(msgSender(), _id, _slot, _token, payoutMinusFee);
  }

  // View

  function getFundingPotCount() public view returns (uint256 count) {
    return fundingPotCount;
  }

  function getFundingPotBalance(uint256 _potId, address _token) public view returns (uint256) {
    return getFundingPotBalance(_potId, block.chainid, _token);
  }

  function getFundingPotProxyBalance(
    uint256 _potId,
    uint256 _chainId,
    address _token
  ) public view returns (uint256) {
    return fundingPots[_potId].chainBalances[_chainId][_token];
  }

  function recordClaimedFundsFromBridge(
    uint256 _chainId,
    address _token,
    uint256 _amount
  ) public stoppable {
    fundingPots[1].chainBalances[_chainId][_token] += _amount;

    emit ProxyColonyFundsClaimed(_chainId, _token, _amount);
  }

  function getFundingPotPayout(uint256 _potId, address _token) public view returns (uint256) {
    return getFundingPotPayout(_potId, block.chainid, _token);
  }

  function getFundingPot(
    uint256 _potId
  )
    public
    view
    returns (
      FundingPotAssociatedType associatedType,
      uint256 associatedTypeId,
      uint256 payoutsWeCannotMake
    )
  {
    FundingPot storage fundingPot = fundingPots[_potId];
    return (fundingPot.associatedType, fundingPot.associatedTypeId, fundingPot.payoutsWeCannotMake);
  }

  function getDomainFromFundingPot(uint256 _fundingPotId) public view returns (uint256 domainId) {
    require(_fundingPotId <= fundingPotCount, "colony-funding-nonexistent-pot");
    FundingPot storage fundingPot = fundingPots[_fundingPotId];

    if (fundingPot.associatedType == FundingPotAssociatedType.Domain) {
      domainId = fundingPot.associatedTypeId;
    } else if (fundingPot.associatedType == FundingPotAssociatedType.DEPRECATED_Task) {
      domainId = DEPRECATED_tasks[fundingPot.associatedTypeId].domainId;
    } else if (fundingPot.associatedType == FundingPotAssociatedType.DEPRECATED_Payment) {
      domainId = DEPRECATED_payments[fundingPot.associatedTypeId].domainId;
    } else if (fundingPot.associatedType == FundingPotAssociatedType.Expenditure) {
      domainId = expenditures[fundingPot.associatedTypeId].domainId;
    } else {
      // If rewards pot, return root domain.
      assert(_fundingPotId == 0);
      domainId = 1;
    }
  }

  function getRewardInverse() public view returns (uint256) {
    return rewardInverse;
  }

  // Internal

  function moveFundsBetweenPotsFunctionality(
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    uint256 _chainId,
    address _token
  ) internal {
    FundingPot storage fromPot = fundingPots[_fromPot];
    FundingPot storage toPot = fundingPots[_toPot];

    setFundingPotBalance(
      _fromPot,
      _chainId,
      _token,
      getFundingPotBalance(_fromPot, _chainId, _token) - _amount
    );
    setFundingPotBalance(
      _toPot,
      _chainId,
      _token,
      getFundingPotBalance(_toPot, _chainId, _token) + _amount
    );

    if (_fromPot == 1 && _chainId == block.chainid) {
      // If we're moving from the root pot, then check we haven't dropped below what we need
      // to cover any approvals that we've made.
      require(
        getFundingPotBalance(_fromPot, _chainId, _token) >= tokenApprovalTotals[_token],
        "colony-funding-too-many-approvals"
      );
    }

    if (fromPot.associatedType == FundingPotAssociatedType.Expenditure) {
      // Prevent money being removed if the remaining balance is insufficient for payouts,
      //  unless the expenditure was cancelled
      require(
        expenditures[fromPot.associatedTypeId].status == ExpenditureStatus.Cancelled ||
          getFundingPotBalance(_fromPot, _chainId, _token) >=
          getFundingPotPayout(_fromPot, _chainId, _token),
        "colony-funding-expenditure-bad-state"
      );

      uint256 fromPotPreviousAmount = getFundingPotBalance(_fromPot, _chainId, _token) + _amount;
      updatePayoutsWeCannotMakeAfterPotChange(_fromPot, _chainId, _token, fromPotPreviousAmount);
    }

    if (toPot.associatedType == FundingPotAssociatedType.Expenditure) {
      uint256 toPotPreviousAmount = getFundingPotBalance(_toPot, _chainId, _token) - _amount;
      updatePayoutsWeCannotMakeAfterPotChange(_toPot, _chainId, _token, toPotPreviousAmount);
    }

    if (_toPot == 0) {
      nonRewardPotsTotal[_token] -= _amount;
    }

    emit ColonyFundsMovedBetweenFundingPots(msgSender(), _fromPot, _toPot, _amount, _token);
  }

  function updatePayoutsWeCannotMakeAfterPotChange(
    uint256 _fundingPotId,
    uint256 _chainId,
    address _token,
    uint256 _prev
  ) internal {
    FundingPot storage tokenPot = fundingPots[_fundingPotId];

    if (_prev >= getFundingPotPayout(_fundingPotId, _chainId, _token)) {
      // If the old amount in the pot was enough to pay for the budget
      if (
        getFundingPotBalance(_fundingPotId, _chainId, _token) <
        getFundingPotPayout(_fundingPotId, _chainId, _token)
      ) {
        // And the new amount in the pot is not enough to pay for the budget...
        tokenPot.payoutsWeCannotMake += 1; // Then this is a set of payouts we cannot make that we could before.
      }
    } else {
      // If this 'else' is running, then the old amount in the pot could not pay for the budget
      if (
        getFundingPotBalance(_fundingPotId, _chainId, _token) >=
        getFundingPotPayout(_fundingPotId, _chainId, _token)
      ) {
        // And the new amount in the pot can pay for the budget
        tokenPot.payoutsWeCannotMake -= 1; // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function updatePayoutsWeCannotMakeAfterBudgetChange(
    uint256 _fundingPotId,
    uint256 _chainId,
    address _token,
    uint256 _prev
  ) internal {
    FundingPot storage tokenPot = fundingPots[_fundingPotId];

    if (getFundingPotBalance(_fundingPotId, _chainId, _token) >= _prev) {
      // If the amount in the pot was enough to pay for the old budget...
      if (getFundingPotBalance(_fundingPotId, _chainId, _token) < getFundingPotPayout(_fundingPotId, _chainId, _token)) {
        // And the amount is not enough to pay for the new budget...
        tokenPot.payoutsWeCannotMake += 1; // Then this is a set of payouts we cannot make that we could before.
      }
    } else {
      // If this 'else' is running, then the amount in the pot was not enough to pay for the old budget
      if (getFundingPotBalance(_fundingPotId, _chainId, _token) >= getFundingPotPayout(_fundingPotId, _chainId, _token)) {
        // And the amount is enough to pay for the new budget...
        tokenPot.payoutsWeCannotMake -= 1; // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function setExpenditurePayoutsInternal(
    uint256 _id,
    uint256[] memory _slots,
    uint256 _chainId,
    address _token,
    uint256[] memory _amounts
  ) internal {
    require(_slots.length == _amounts.length, "colony-expenditure-bad-slots");

    FundingPot storage fundingPot = fundingPots[expenditures[_id].fundingPotId];
    assert(fundingPot.associatedType == FundingPotAssociatedType.Expenditure);

    uint256 previousTotal = getFundingPotPayout(expenditures[_id].fundingPotId, _chainId, _token);
    uint256 runningTotal = previousTotal;

    for (uint256 i; i < _slots.length; i++) {
      require(_amounts[i] <= MAX_PAYOUT, "colony-payout-too-large");
      uint256 currentPayout = getExpenditureSlotPayout(_id, _slots[i], _chainId, _token);
      // uint256 currentPayout = expenditureSlotPayouts[_id][_slots[i]][_token];
      setExpenditureSlotPayout(_id, _slots[i], _chainId, _token, _amounts[i]);
      // expenditureSlotPayouts[_id][_slots[i]][_token] = _amounts[i];
      runningTotal = (runningTotal - currentPayout) + _amounts[i];

      emit ExpenditurePayoutSet(msgSender(), _id, _slots[i], _token, _amounts[i]);
    }

    // fundingPot.payouts[_token] = runningTotal;
    setFundingPotPayout(expenditures[_id].fundingPotId, _chainId, _token, runningTotal);

    updatePayoutsWeCannotMakeAfterBudgetChange(
      expenditures[_id].fundingPotId,
      _chainId,
      _token,
      previousTotal
    );
  }

  function processPayout(
    uint256 _fundingPotId,
    uint256 _chainId,
    address _token,
    uint256 _payout,
    address payable _user
  ) private returns (uint256) {
    refundDomain(_fundingPotId, _chainId, _token);

    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    address payable metaColonyAddress = colonyNetworkContract.getMetaColony();

    setFundingPotBalance(
      _fundingPotId,
      _chainId,
      _token,
      getFundingPotBalance(_fundingPotId, _chainId, _token) - _payout
    );
    setFundingPotPayout(
      _fundingPotId,
      _chainId,
      _token,
      getFundingPotPayout(_fundingPotId, _chainId, _token) - _payout
    );

    uint256 payoutToUser;

    if (_chainId == block.chainid) {
      nonRewardPotsTotal[_token] -= _payout;

      uint256 fee = isOwnExtension(_user) ? 0 : calculateNetworkFeeForPayout(_payout);
      payoutToUser = _payout - fee;

      if (_token == address(0x0)) {
        // Payout ether
        // Fee goes directly to Meta Colony
        _user.transfer(payoutToUser);
        metaColonyAddress.transfer(fee);
      } else {
        // Payout token
        // If it's a whitelisted token, it goes straight to the metaColony
        // If it's any other token, goes to the colonyNetwork contract first to be auctioned.
        ERC20Extended payoutToken = ERC20Extended(_token);
        assert(payoutToken.transfer(_user, payoutToUser));
        if (colonyNetworkContract.getPayoutWhitelist(_token)) {
          assert(payoutToken.transfer(metaColonyAddress, fee));
        } else {
          assert(payoutToken.transfer(colonyNetworkAddress, fee));
        }
      }
    } else {
        // TODO: Shell colony payout
        bytes memory payload = abi.encodeWithSignature(
          "transferFromBridge(address,address,uint256)",
          _token,
          _user,
          _payout
        );
        IColonyNetwork(colonyNetworkAddress).bridgeMessage(_chainId, payload);
    }

    // slither-disable-next-line reentrancy-unlimited-gas
    emit PayoutClaimed(msgSender(), _fundingPotId, _token, payoutToUser);

    return payoutToUser;
  }

  function refundDomain(uint256 _fundingPotId, uint256 _chainId, address _token) private {
    if (
      getFundingPotPayout(_fundingPotId, _chainId, _token) <
      getFundingPotBalance(_fundingPotId, _chainId, _token)
    ) {
      uint256 domainId = getDomainFromFundingPot(_fundingPotId);
      uint256 surplus = getFundingPotBalance(_fundingPotId, _chainId, _token) -
        getFundingPotPayout(_fundingPotId, _chainId, _token);

      moveFundsBetweenPotsFunctionality(
        _fundingPotId,
        domains[domainId].fundingPotId,
        surplus,
        _chainId,
        _token
      );
    }
  }

  function getFundingPotBalance(
    uint256 _potId,
    uint256 _chainId,
    address _token
  ) internal view returns (uint256) {
    if (_chainId == block.chainid) {
      return fundingPots[_potId].balance[_token];
    }
    return fundingPots[_potId].chainBalances[_chainId][_token];
  }

  function setFundingPotBalance(
    uint256 _potId,
    uint256 _chainId,
    address _token,
    uint256 _newValue
  ) internal stoppable {
    if (_chainId == block.chainid) {
      fundingPots[_potId].balance[_token] = _newValue;
    } else {
      fundingPots[_potId].chainBalances[_chainId][_token] = _newValue;
    }
  }

  function getFundingPotPayout(
    uint256 _potId,
    uint256 _chainId,
    address _token
  ) internal view returns (uint256) {
    if (_chainId == block.chainid) {
      return fundingPots[_potId].payouts[_token];
    }
    return fundingPots[_potId].chainPayouts[_chainId][_token];
  }

  function setFundingPotPayout(
    uint256 _potId,
    uint256 _chainId,
    address _token,
    uint256 _newValue
  ) internal {
    if (_chainId == block.chainid) {
      fundingPots[_potId].payouts[_token] = _newValue;
    } else {
      fundingPots[_potId].chainPayouts[_chainId][_token] = _newValue;
    }
  }

  function getExpenditureSlotPayout(
    uint256 _id,
    uint256 _slot,
    address _token
  ) public view returns (uint256) {
    return getExpenditureSlotPayout(_id, _slot, block.chainid, _token);
  }

  function getExpenditureSlotPayout(
    uint256 _id,
    uint256 _slot,
    uint256 chainId,
    address _token
  ) public view returns (uint256) {
    if (chainId == block.chainid) {
      return expenditureSlotPayouts[_id][_slot][_token];
    }
    return expenditureSlotChainPayouts[_id][_slot][chainId][_token];
  }

  function setExpenditureSlotPayout(
    uint256 _id,
    uint256 _slot,
    uint256 chainId,
    address _token,
    uint256 _newValue
  ) internal {
    if (chainId == block.chainid) {
      expenditureSlotPayouts[_id][_slot][_token] = _newValue;
    } else {
      expenditureSlotChainPayouts[_id][_slot][chainId][_token] = _newValue;
    }
  }
}
