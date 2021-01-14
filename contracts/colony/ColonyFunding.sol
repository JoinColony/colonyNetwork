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


contract ColonyFunding is ColonyStorage, PatriciaTreeProofs { // ignore-swc-123
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

  function setAllTaskPayouts(
    uint256 _id,
    address _token,
    uint256 _managerAmount,
    uint256 _evaluatorAmount,
    uint256 _workerAmount
  )
  public
  stoppable
  confirmTaskRoleIdentity(_id, TaskRole.Manager)
  {
    Task storage task = tasks[_id];
    address manager = task.roles[uint8(TaskRole.Manager)].user;
    address evaluator = task.roles[uint8(TaskRole.Evaluator)].user;
    address worker = task.roles[uint8(TaskRole.Worker)].user;

    require(
      evaluator == manager ||
      evaluator == address(0x0),
      "colony-funding-evaluator-already-set");

    require(
      worker == manager ||
      worker == address(0x0),
      "colony-funding-worker-already-set");

    this.setTaskManagerPayout(_id, _token, _managerAmount);
    this.setTaskEvaluatorPayout(_id, _token, _evaluatorAmount);
    this.setTaskWorkerPayout(_id, _token, _workerAmount);
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

    // Process reputation updates if own token
    if (_token == token) {
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      colonyNetworkContract.appendReputationUpdateLog(slot.recipient, int256(repPayout), domains[expenditure.domainId].skillId);
      if (slot.skills.length > 0 && slot.skills[0] > 0) {
        // Currently we support at most one skill per Expenditure, but this will likely change in the future.
        colonyNetworkContract.appendReputationUpdateLog(slot.recipient, int256(repPayout), slot.skills[0]);
      }
    }

    // Send any surplus back to the domain (for payoutScalars < 1)
    if (tokenSurplus > 0) {
      fundingPot.payouts[_token] = sub(fundingPot.payouts[_token], tokenSurplus);
      fundingPot.balance[_token] = sub(fundingPot.balance[_token], tokenSurplus);
      FundingPot storage domainFundingPot = fundingPots[domains[expenditure.domainId].fundingPotId];
      domainFundingPot.balance[_token] = add(domainFundingPot.balance[_token], tokenSurplus);
    }

    // Finish the payout
    processPayout(expenditure.fundingPotId, _token, tokenPayout, slot.recipient);
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

    emit PaymentPayoutSet(msg.sender, _id, _token, _amount);
  }

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
  authDomain(_permissionDomainId, _fromChildSkillIndex, getDomainFromFundingPot(_fromPot))
  authDomain(_permissionDomainId, _toChildSkillIndex, getDomainFromFundingPot(_toPot))
  validFundingTransfer(_fromPot, _toPot)
  {
    FundingPot storage fromPot = fundingPots[_fromPot];
    FundingPot storage toPot = fundingPots[_toPot];

    fromPot.balance[_token] = sub(fromPot.balance[_token], _amount);
    toPot.balance[_token] = add(toPot.balance[_token], _amount);

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

    emit ColonyFundsMovedBetweenFundingPots(msg.sender, _fromPot, _toPot, _amount, _token);
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

    emit ColonyFundsClaimed(msg.sender, _token, feeToPay, remainder);
  }

  function getNonRewardPotsTotal(address _token) public view returns (uint256) {
    return nonRewardPotsTotal[_token];
  }

  function startNextRewardPayout(address _token, bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)
  public stoppable auth
  {
    ITokenLocking tokenLocking = ITokenLocking(tokenLockingAddress);
    uint256 totalLockCount = tokenLocking.lockToken(token);
    uint256 thisPayoutAmount = sub(fundingPots[0].balance[_token], pendingRewardPayments[_token]);
    require(thisPayoutAmount > 0, "colony-reward-payout-no-rewards");
    pendingRewardPayments[_token] = add(pendingRewardPayments[_token], thisPayoutAmount);

    uint256 totalTokens = sub(ERC20Extended(token).totalSupply(), ERC20Extended(token).balanceOf(address(this)));
    require(totalTokens > 0, "colony-reward-payout-invalid-total-tokens");

    bytes32 rootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    uint256 colonyWideReputation = checkReputation(
      rootHash,
      domains[1].skillId,
      address(0x0),
      key,
      value,
      branchMask,
      siblings
    );
    require(colonyWideReputation > 0, "colony-reward-payout-invalid-colony-wide-reputation");

    rewardPayoutCycles[totalLockCount] = RewardPayoutCycle(
      rootHash,
      colonyWideReputation,
      totalTokens,
      thisPayoutAmount,
      _token,
      block.timestamp,
      thisPayoutAmount,
      false
    );

    emit RewardPayoutCycleStarted(msg.sender, totalLockCount);
  }

  function claimRewardPayout(
    uint256 _payoutId,
    uint256[7] memory _squareRoots,
    bytes memory key,
    bytes memory value,
    uint256 branchMask,
    bytes32[] memory siblings
  ) public stoppable
  {
    uint256 userReputation = checkReputation(
      rewardPayoutCycles[_payoutId].reputationState,
      domains[1].skillId,
      msg.sender,
      key,
      value,
      branchMask,
      siblings
    );

    address tokenAddress;
    uint256 reward;
    (tokenAddress, reward) = calculateRewardForUser(_payoutId, _squareRoots, userReputation);

    uint fee = calculateNetworkFeeForPayout(reward);
    uint remainder = sub(reward, fee);

    fundingPots[0].balance[tokenAddress] = sub(fundingPots[0].balance[tokenAddress], reward);
    pendingRewardPayments[rewardPayoutCycles[_payoutId].tokenAddress] = sub(
      pendingRewardPayments[rewardPayoutCycles[_payoutId].tokenAddress],
      reward
    );
    rewardPayoutCycles[_payoutId].amountRemaining = sub(rewardPayoutCycles[_payoutId].amountRemaining, reward);

    assert(ERC20Extended(tokenAddress).transfer(msg.sender, remainder));
    assert(ERC20Extended(tokenAddress).transfer(colonyNetworkAddress, fee));

    emit RewardPayoutClaimed(_payoutId, msg.sender, fee, remainder);
  }

  function finalizeRewardPayout(uint256 _payoutId) public stoppable {
    RewardPayoutCycle memory payout = rewardPayoutCycles[_payoutId];
    require(payout.reputationState != 0x00, "colony-reward-payout-does-not-exist");
    require(!payout.finalized, "colony-reward-payout-already-finalized");
    require(block.timestamp - payout.blockTimestamp > 60 days, "colony-reward-payout-active");

    rewardPayoutCycles[_payoutId].finalized = true;
    pendingRewardPayments[payout.tokenAddress] = sub(pendingRewardPayments[payout.tokenAddress], payout.amountRemaining);

    emit RewardPayoutCycleEnded(msg.sender, _payoutId);
  }

  function getRewardPayoutInfo(uint256 _payoutId) public view returns (RewardPayoutCycle memory rewardPayoutCycle) {
    rewardPayoutCycle = rewardPayoutCycles[_payoutId];
  }

  function setRewardInverse(uint256 _rewardInverse) public
  stoppable
  auth
  {
    require(_rewardInverse > 0, "colony-reward-inverse-cannot-be-zero");
    rewardInverse = _rewardInverse;

    emit ColonyRewardInverseSet(msg.sender, _rewardInverse);
  }

  function getRewardInverse() public view returns (uint256) {
    return rewardInverse;
  }

  function checkReputation(
    bytes32 rootHash,
    uint256 skillId,
    address userAddress,
    bytes memory key,
    bytes memory value,
    uint256 branchMask,
    bytes32[] memory siblings
  ) internal view returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRootHashKey(key, value, branchMask, siblings);
    require(rootHash == impliedRoot, "colony-reputation-invalid-root-hash");

    uint256 reputationValue;
    address keyColonyAddress;
    uint256 keySkill;
    address keyUserAddress;

    assembly {
      reputationValue := mload(add(value, 32))
      keyColonyAddress := mload(add(key, 20))
      keySkill := mload(add(key, 52))
      keyUserAddress := mload(add(key, 72))
    }

    require(keyColonyAddress == address(this), "colony-reputation-invalid-colony-address");
    require(keySkill == skillId, "colony-reputation-invalid-skill-id");
    require(keyUserAddress == userAddress, "colony-reputation-invalid-user-address");

    return reputationValue;
  }

  function calculateRewardForUser(uint256 payoutId, uint256[7] memory squareRoots, uint256 userReputation) internal returns (address, uint256) {
    RewardPayoutCycle memory payout = rewardPayoutCycles[payoutId];

    // Checking if payout is active
    require(block.timestamp - payout.blockTimestamp <= 60 days, "colony-reward-payout-not-active");

    ITokenLocking tokenLocking = ITokenLocking(tokenLockingAddress);
    uint256 userTokens = tokenLocking.getUserLock(token, msg.sender).balance;

    require(userTokens > 0, "colony-reward-payout-invalid-user-tokens");
    require(userReputation > 0, "colony-reward-payout-invalid-user-reputation");

    // squareRoots[0] - square root of userReputation
    // squareRoots[1] - square root of userTokens (deposited in TokenLocking)
    // squareRoots[2] - square root of payout.colonyWideReputation
    // squareRoots[3] - square root of totalTokens
    // squareRoots[4] - square root of numerator
    // squareRoots[5] - square root of denominator
    // squareRoots[6] - square root of payout.amount

    require(mul(squareRoots[0], squareRoots[0]) <= userReputation, "colony-reward-payout-invalid-parameter-user-reputation");
    require(mul(squareRoots[1], squareRoots[1]) <= userTokens, "colony-reward-payout-invalid-parameter-user-token");
    require(mul(squareRoots[2], squareRoots[2]) >= payout.colonyWideReputation, "colony-reward-payout-invalid-parameter-total-reputation");
    require(mul(squareRoots[3], squareRoots[3]) >= payout.totalTokens, "colony-reward-payout-invalid-parameter-total-tokens");
    require(mul(squareRoots[6], squareRoots[6]) <= payout.amount, "colony-reward-payout-invalid-parameter-amount");
    uint256 numerator = mul(squareRoots[0], squareRoots[1]);
    uint256 denominator = mul(squareRoots[2], squareRoots[3]);

    require(mul(squareRoots[4], squareRoots[4]) <= numerator, "colony-reward-payout-invalid-parameter-numerator");
    require(mul(squareRoots[5], squareRoots[5]) >= denominator, "colony-reward-payout-invalid-parameter-denominator");

    uint256 reward = (mul(squareRoots[4], squareRoots[6]) / squareRoots[5]) ** 2;

    tokenLocking.unlockTokenForUser(token, msg.sender, payoutId);

    return (payout.tokenAddress, reward);
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

  function setExpenditurePayout(uint256 _id, uint256 _slot, address _token, uint256 _amount)
  public
  stoppable
  expenditureExists(_id)
  expenditureActive(_id)
  expenditureOnlyOwner(_id)
  validPayoutAmount(_amount)
  {
    FundingPot storage fundingPot = fundingPots[expenditures[_id].fundingPotId];
    assert(fundingPot.associatedType == FundingPotAssociatedType.Expenditure);

    uint256 currentTotal = fundingPot.payouts[_token];
    uint256 currentPayout = expenditureSlotPayouts[_id][_slot][_token];

    expenditureSlotPayouts[_id][_slot][_token] = _amount;
    fundingPot.payouts[_token] = add(sub(currentTotal, currentPayout), _amount);

    updatePayoutsWeCannotMakeAfterBudgetChange(expenditures[_id].fundingPotId, _token, currentTotal);

    emit ExpenditurePayoutSet(msg.sender, _id, _slot, _token, _amount);
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
    fundingPots[_fundingPotId].balance[_token] = sub(fundingPots[_fundingPotId].balance[_token], _payout);
    nonRewardPotsTotal[_token] = sub(nonRewardPotsTotal[_token], _payout);

    uint fee = calculateNetworkFeeForPayout(_payout);
    uint remainder = sub(_payout, fee);
    fundingPots[_fundingPotId].payouts[_token] = sub(fundingPots[_fundingPotId].payouts[_token], _payout);

    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    address payable metaColonyAddress = colonyNetworkContract.getMetaColony();

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

    emit PayoutClaimed(msg.sender, _fundingPotId, _token, remainder);
  }

  function calculateNetworkFeeForPayout(uint256 _payout) private view returns (uint256 fee) {
    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    uint256 feeInverse = colonyNetworkContract.getFeeInverse();

    if (_payout == 0 || feeInverse == 1) {
      fee = _payout;
    } else {
      fee = _payout/feeInverse + 1;
    }
  }
}
