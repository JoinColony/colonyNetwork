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
pragma experimental "ABIEncoderV2";

import "./../tokenLocking/ITokenLocking.sol";
import "./ColonyStorage.sol";


contract ColonyFunding is ColonyStorage { // ignore-swc-123

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
  domainNotDeprecated(getDomainFromFundingPot(_toPot))
  authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  validFundingTransfer(_fromPot, _toPot)
  {
    require(validateDomainInheritance(_domainId, _fromChildSkillIndex, getDomainFromFundingPot(_fromPot)), "colony-invalid-domain-inheritence");
    require(validateDomainInheritance(_domainId, _toChildSkillIndex, getDomainFromFundingPot(_toPot)), "colony-invalid-domain-inheritence");

    moveFundsBetweenPotsFunctionality(_fromPot, _toPot, _amount, _token);
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
    moveFundsBetweenPotsFunctionality(_fromPot, _toPot, _amount, _token);
  }

  function claimColonyFunds(address _token) public stoppable {
    uint toClaim;
    uint feeToPay;
    uint remainder;
    if (_token == address(0x0)) {
      // It's ether
      toClaim = sub(sub(address(this).balance, nonRewardPotsTotal[_token]), fundingPots[0].balance[_token]);
    } else {
      // Assume it's an ERC 20 token.
      ERC20Extended targetToken = ERC20Extended(_token);
      toClaim = sub(sub(targetToken.balanceOf(address(this)), nonRewardPotsTotal[_token]), fundingPots[0].balance[_token]); // ignore-swc-123
    }

    feeToPay = toClaim / getRewardInverse(); // ignore-swc-110 . This variable is set when the colony is
    // initialised to MAX_UINT, and cannot be set to zero via setRewardInverse, so this is a false positive. It *can* be set
    // to 0 via recovery mode, but a) That's not why MythX is balking here and b) There's only so much we can stop people being
    // able to do with recovery mode.
    remainder = sub(toClaim, feeToPay);
    nonRewardPotsTotal[_token] = add(nonRewardPotsTotal[_token], remainder);
    fundingPots[1].balance[_token] = add(fundingPots[1].balance[_token], remainder);
    fundingPots[0].balance[_token] = add(fundingPots[0].balance[_token], feeToPay);

    emit ColonyFundsClaimed(msgSender(), _token, feeToPay, remainder);
  }

  function getNonRewardPotsTotal(address _token) public view returns (uint256) {
    return nonRewardPotsTotal[_token];
  }

  function setTaskManagerPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, TaskRole.Manager, _token, _amount);
    emit TaskPayoutSet(_id, TaskRole.Manager, _token, _amount);
  }

  function setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, TaskRole.Evaluator, _token, _amount);
    emit TaskPayoutSet(_id, TaskRole.Evaluator, _token, _amount);
  }

  function setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, TaskRole.Worker, _token, _amount);
    emit TaskPayoutSet(_id, TaskRole.Worker, _token, _amount);
  }

  // To get all payouts for a task iterate over roles.length
  function getTaskPayout(uint256 _id, uint8 _role, address _token) public view returns (uint256) {
    Task storage task = tasks[_id];
    bool unsatisfactory = task.roles[_role].rating == TaskRatings.Unsatisfactory;
    return unsatisfactory ? 0 : task.payouts[_role][_token];
  }

  function claimTaskPayout(uint256 _id, uint8 _role, address _token) public
  stoppable
  taskFinalized(_id)
  {
    Task storage task = tasks[_id];
    FundingPot storage fundingPot = fundingPots[task.fundingPotId];
    assert(task.roles[_role].user != address(0x0));

    uint payout = task.payouts[_role][_token];
    task.payouts[_role][_token] = 0;

    bool unsatisfactory = task.roles[_role].rating == TaskRatings.Unsatisfactory;
    if (!unsatisfactory) {
      processPayout(task.fundingPotId, _token, payout, task.roles[_role].user);
    } else {
      fundingPot.payouts[_token] = sub(fundingPot.payouts[_token], payout);
    }
  }

  function setExpenditurePayouts(uint256 _id, uint256[] memory _slots, address _token, uint256[] memory _amounts)
  public
  stoppable
  expenditureExists(_id)
  expenditureDraft(_id)
  expenditureOnlyOwner(_id)
  {
    setExpenditurePayoutsInternal(_id, _slots, _token, _amounts);
  }

  function setExpenditurePayout(uint256 _id, uint256 _slot, address _token, uint256 _amount)
  public
  stoppable
  {
    uint256[] memory slots = new uint256[](1);
    slots[0] = _slot;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = _amount;
    setExpenditurePayouts(_id, slots, _token, amounts);
  }

  int256 constant MAX_PAYOUT_MODIFIER = int256(WAD);
  int256 constant MIN_PAYOUT_MODIFIER = -int256(WAD);

  function claimExpenditurePayout(uint256 _id, uint256 _slot, address _token) public
  stoppable
  expenditureExists(_id)
  expenditureFinalized(_id)
  {
    Expenditure storage expenditure = expenditures[_id];
    ExpenditureSlot storage slot = expenditureSlots[_id][_slot];

    require(
      add(expenditure.finalizedTimestamp, add(expenditure.globalClaimDelay, slot.claimDelay)) <= block.timestamp,
      "colony-expenditure-cannot-claim"
    );

    FundingPot storage fundingPot = fundingPots[expenditure.fundingPotId];
    assert(fundingPot.balance[_token] >= fundingPot.payouts[_token]);

    uint256 initialPayout = expenditureSlotPayouts[_id][_slot][_token];
    delete expenditureSlotPayouts[_id][_slot][_token];

    int256 payoutModifier = imin(imax(slot.payoutModifier, MIN_PAYOUT_MODIFIER), MAX_PAYOUT_MODIFIER);
    uint256 payoutScalar = uint256(payoutModifier + int256(WAD));

    uint256 repPayout = wmul(initialPayout, payoutScalar);
    uint256 tokenPayout = min(initialPayout, repPayout);
    uint256 tokenSurplus = sub(initialPayout, tokenPayout);

    // Send any surplus back to the domain (for payoutScalars < 1)
    if (tokenSurplus > 0) {
      fundingPot.payouts[_token] = sub(fundingPot.payouts[_token], tokenSurplus);
      fundingPot.balance[_token] = sub(fundingPot.balance[_token], tokenSurplus);
      FundingPot storage domainFundingPot = fundingPots[domains[expenditure.domainId].fundingPotId];
      domainFundingPot.balance[_token] = add(domainFundingPot.balance[_token], tokenSurplus);
    }

    // Process reputation updates if internal token
    if (_token == token && !isExtension(slot.recipient)) {
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      colonyNetworkContract.appendReputationUpdateLog(slot.recipient, int256(repPayout), domains[expenditure.domainId].skillId);
      if (slot.skills.length > 0 && slot.skills[0] > 0) {
        // Currently we support at most one skill per Expenditure, but this will likely change in the future.
        colonyNetworkContract.appendReputationUpdateLog(slot.recipient, int256(repPayout), slot.skills[0]);
      }
    }

    // Finish the payout
    processPayout(expenditure.fundingPotId, _token, tokenPayout, slot.recipient);
  }

  function setPaymentPayout(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, address _token, uint256 _amount) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, payments[_id].domainId)
  validPayoutAmount(_amount)
  paymentNotFinalized(_id)
  {
    Payment storage payment = payments[_id];
    FundingPot storage fundingPot = fundingPots[payment.fundingPotId];
    assert(fundingPot.associatedType == FundingPotAssociatedType.Payment);

    uint currentTotalAmount = fundingPot.payouts[_token];
    fundingPot.payouts[_token] = _amount;

    updatePayoutsWeCannotMakeAfterBudgetChange(payment.fundingPotId, _token, currentTotalAmount);

    emit PaymentPayoutSet(msgSender(), _id, _token, _amount);
  }

  function claimPayment(uint256 _id, address _token) public
  stoppable
  paymentFinalized(_id)
  {
    Payment storage payment = payments[_id];
    FundingPot storage fundingPot = fundingPots[payment.fundingPotId];
    assert(fundingPot.balance[_token] >= fundingPot.payouts[_token]);

    processPayout(payment.fundingPotId, _token, fundingPot.payouts[_token], payment.recipient);
  }

  // View

  function getFundingPotCount() public view returns (uint256 count) {
    return fundingPotCount;
  }

  function getFundingPotBalance(uint256 _potId, address _token) public view returns (uint256) {
    return fundingPots[_potId].balance[_token];
  }

  function getFundingPotPayout(uint256 _potId, address _token) public view returns (uint256) {
    return fundingPots[_potId].payouts[_token];
  }

  function getFundingPot(uint256 _potId) public view returns
  (FundingPotAssociatedType associatedType, uint256 associatedTypeId, uint256 payoutsWeCannotMake)
  {
    FundingPot storage fundingPot = fundingPots[_potId];
    return (fundingPot.associatedType, fundingPot.associatedTypeId, fundingPot.payoutsWeCannotMake);
  }

  function getDomainFromFundingPot(uint256 _fundingPotId) public view returns (uint256 domainId) {
    require(_fundingPotId <= fundingPotCount, "colony-funding-nonexistent-pot");
    FundingPot storage fundingPot = fundingPots[_fundingPotId];

    if (fundingPot.associatedType == FundingPotAssociatedType.Domain) {
      domainId = fundingPot.associatedTypeId;
    } else if (fundingPot.associatedType == FundingPotAssociatedType.Task) {
      domainId = tasks[fundingPot.associatedTypeId].domainId;
    } else if (fundingPot.associatedType == FundingPotAssociatedType.Payment) {
      domainId = payments[fundingPot.associatedTypeId].domainId;
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
    address _token
  )
    internal
  {
    FundingPot storage fromPot = fundingPots[_fromPot];
    FundingPot storage toPot = fundingPots[_toPot];

    fromPot.balance[_token] = sub(fromPot.balance[_token], _amount);
    toPot.balance[_token] = add(toPot.balance[_token], _amount);

    if (_fromPot == 1){
      // If we're moving from the root pot, then check we haven't dropped below what we need
      // to cover any approvals that we've made.
      require(fromPot.balance[_token] >= tokenApprovalTotals[_token], "colony-funding-too-many-approvals");
    }

    // If this pot is associated with a Task or Expenditure, prevent money
    // being taken from the pot if the remaining balance is less than
    // the amount needed for payouts, unless the task was cancelled.
    if (fromPot.associatedType == FundingPotAssociatedType.Task) {
      require(
        tasks[fromPot.associatedTypeId].status == TaskStatus.Cancelled ||
        fromPot.balance[_token] >= fromPot.payouts[_token],
        "colony-funding-task-bad-state"
      );
    }
    if (fromPot.associatedType == FundingPotAssociatedType.Expenditure) {
      require(
        expenditures[fromPot.associatedTypeId].status == ExpenditureStatus.Cancelled ||
        fromPot.balance[_token] >= fromPot.payouts[_token],
        "colony-funding-expenditure-bad-state"
      );
    }

    if (
      fromPot.associatedType == FundingPotAssociatedType.Expenditure ||
      fromPot.associatedType == FundingPotAssociatedType.Payment ||
      fromPot.associatedType == FundingPotAssociatedType.Task
    ) {
      uint256 fromPotPreviousAmount = add(fromPot.balance[_token], _amount);
      updatePayoutsWeCannotMakeAfterPotChange(_fromPot, _token, fromPotPreviousAmount);
    }

    if (
      toPot.associatedType == FundingPotAssociatedType.Expenditure ||
      toPot.associatedType == FundingPotAssociatedType.Payment ||
      toPot.associatedType == FundingPotAssociatedType.Task
    ) {
      uint256 toPotPreviousAmount = sub(toPot.balance[_token], _amount);
      updatePayoutsWeCannotMakeAfterPotChange(_toPot, _token, toPotPreviousAmount);
    }

    if (_toPot == 0 ) {
      nonRewardPotsTotal[_token] = sub(nonRewardPotsTotal[_token], _amount);
    }

    emit ColonyFundsMovedBetweenFundingPots(msgSender(), _fromPot, _toPot, _amount, _token);
  }

  function updatePayoutsWeCannotMakeAfterPotChange(uint256 _fundingPotId, address _token, uint _prev) internal {
    FundingPot storage tokenPot = fundingPots[_fundingPotId];

    if (_prev >= tokenPot.payouts[_token]) {                          // If the old amount in the pot was enough to pay for the budget
      if (tokenPot.balance[_token] < tokenPot.payouts[_token]) {      // And the new amount in the pot is not enough to pay for the budget...
        tokenPot.payoutsWeCannotMake += 1;                            // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                          // If this 'else' is running, then the old amount in the pot could not pay for the budget
      if (tokenPot.balance[_token] >= tokenPot.payouts[_token]) {     // And the new amount in the pot can pay for the budget
        tokenPot.payoutsWeCannotMake -= 1;                            // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function updatePayoutsWeCannotMakeAfterBudgetChange(uint256 _fundingPotId, address _token, uint _prev) internal {
    FundingPot storage tokenPot = fundingPots[_fundingPotId];

    if (tokenPot.balance[_token] >= _prev) {                          // If the amount in the pot was enough to pay for the old budget...
      if (tokenPot.balance[_token] < tokenPot.payouts[_token]) {      // And the amount is not enough to pay for the new budget...
        tokenPot.payoutsWeCannotMake += 1;                            // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                          // If this 'else' is running, then the amount in the pot was not enough to pay for the old budget
      if (tokenPot.balance[_token] >= tokenPot.payouts[_token]) {     // And the amount is enough to pay for the new budget...
        tokenPot.payoutsWeCannotMake -= 1;                            // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function setExpenditurePayoutsInternal(uint256 _id, uint256[] memory _slots, address _token, uint256[] memory _amounts)
  internal
  {
    require(_slots.length == _amounts.length, "colony-expenditure-bad-slots");

    FundingPot storage fundingPot = fundingPots[expenditures[_id].fundingPotId];
    assert(fundingPot.associatedType == FundingPotAssociatedType.Expenditure);

    uint256 currentTotal = fundingPot.payouts[_token];

    for (uint256 i; i < _slots.length; i++) {
      require(_amounts[i] <= MAX_PAYOUT, "colony-payout-too-large");

      uint256 currentPayout = expenditureSlotPayouts[_id][_slots[i]][_token];

      expenditureSlotPayouts[_id][_slots[i]][_token] = _amounts[i];
      fundingPot.payouts[_token] = add(sub(currentTotal, currentPayout), _amounts[i]);


      emit ExpenditurePayoutSet(msgSender(), _id, _slots[i], _token, _amounts[i]);
    }

    updatePayoutsWeCannotMakeAfterBudgetChange(expenditures[_id].fundingPotId, _token, currentTotal);
  }

  function setTaskPayout(uint256 _id, TaskRole _role, address _token, uint256 _amount) private
  taskExists(_id)
  taskNotComplete(_id)
  validPayoutAmount(_amount)
  {
    Task storage task = tasks[_id];
    FundingPot storage fundingPot = fundingPots[task.fundingPotId];
    assert(fundingPot.associatedType == FundingPotAssociatedType.Task);

    uint currentTotalAmount = fundingPot.payouts[_token];
    uint currentTaskRolePayout = task.payouts[uint8(_role)][_token];
    task.payouts[uint8(_role)][_token] = _amount;

    fundingPot.payouts[_token] = add(sub(currentTotalAmount, currentTaskRolePayout), _amount);

    updatePayoutsWeCannotMakeAfterBudgetChange(task.fundingPotId, _token, currentTotalAmount);
  }

  function processPayout(uint256 _fundingPotId, address _token, uint256 _payout, address payable _user) private {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    address payable metaColonyAddress = colonyNetworkContract.getMetaColony();

    fundingPots[_fundingPotId].balance[_token] = sub(fundingPots[_fundingPotId].balance[_token], _payout);
    fundingPots[_fundingPotId].payouts[_token] = sub(fundingPots[_fundingPotId].payouts[_token], _payout);
    nonRewardPotsTotal[_token] = sub(nonRewardPotsTotal[_token], _payout);

    uint fee = isOwnExtension(_user) ? 0 : calculateNetworkFeeForPayout(_payout);
    uint remainder = sub(_payout, fee);

    if (_token == address(0x0)) {
      // Payout ether
      // Fee goes directly to Meta Colony
      _user.transfer(remainder);
      metaColonyAddress.transfer(fee);
    } else {
      // Payout token
      // If it's a whitelisted token, it goes straight to the metaColony
      // If it's any other token, goes to the colonyNetwork contract first to be auctioned.
      ERC20Extended payoutToken = ERC20Extended(_token);
      assert(payoutToken.transfer(_user, remainder));
      if (colonyNetworkContract.getPayoutWhitelist(_token)) {
        assert(payoutToken.transfer(metaColonyAddress, fee));
      } else {
        assert(payoutToken.transfer(colonyNetworkAddress, fee));
      }
    }

    emit PayoutClaimed(msgSender(), _fundingPotId, _token, remainder);
  }
}