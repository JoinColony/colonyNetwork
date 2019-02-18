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

pragma solidity >=0.4.23 <0.5.0;
pragma experimental "ABIEncoderV2";

import "./ColonyStorage.sol";
import "./ITokenLocking.sol";


contract ColonyFunding is ColonyStorage, PatriciaTreeProofs {
  function setTaskManagerPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, TaskRole.Manager, _token, _amount);
    emit TaskPayoutSet(_id, TaskRole.Manager, _token, _amount);
  }

  function setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount) public stoppable paymentManagerOrSelf(_id) {
    setTaskPayout(_id, TaskRole.Worker, _token, _amount);
    emit TaskPayoutSet(_id, TaskRole.Worker, _token, _amount);
  }

  function setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, TaskRole.Evaluator, _token, _amount);
    emit TaskPayoutSet(_id, TaskRole.Evaluator, _token, _amount);
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
    Payment storage payment = payments[_id];
    address manager = payment.roles[uint8(TaskRole.Manager)].user;
    address evaluator = payment.roles[uint8(TaskRole.Evaluator)].user;
    address worker = payment.roles[uint8(TaskRole.Worker)].user;

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
    Payment storage payment = payments[_id];
    bool unsatisfactory = payment.roles[_role].rating == TaskRatings.Unsatisfactory;
    return unsatisfactory ? 0 : payment.payouts[_role][_token];
  }

  function getTotalTaskPayout(uint256 _id, address _token) public view returns(uint256) {
    uint totalPayouts;
    for (uint8 roleId = 0; roleId <= 2; roleId++) {
      totalPayouts = add(totalPayouts, getTaskPayout(_id, roleId, _token));
    }
    return totalPayouts;
  }

  function claimPayout(uint256 _id, uint8 _role, address _token) public
  stoppable
  taskFinalized(_id)
  {
    Payment storage payment = payments[_id];
    assert(payment.roles[_role].user != address(0x0));

    uint payout = payment.payouts[_role][_token];

    if (payment.roles[_role].rating == TaskRatings.Unsatisfactory || payout == 0) {
      return;
    }

    payment.payouts[_role][_token] = 0;

    fundingPots[payment.fundingPotId].balance[_token] = sub(fundingPots[payment.fundingPotId].balance[_token], payout);
    nonRewardPotsTotal[_token] = sub(nonRewardPotsTotal[_token], payout);

    uint fee = calculateNetworkFeeForPayout(payout);
    uint remainder = sub(payout, fee);

    if (_token == address(0x0)) {
      // Payout ether
      payment.roles[_role].user.transfer(remainder);
      // Fee goes directly to Meta Colony
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      address metaColonyAddress = colonyNetworkContract.getMetaColony();
      metaColonyAddress.transfer(fee);
    } else {
      // Payout token
      // TODO: (post CCv1) If it's a whitelisted token, it goes straight to the metaColony
      // If it's any other token, goes to the colonyNetwork contract first to be auctioned.
      ERC20Extended payoutToken = ERC20Extended(_token);
      payoutToken.transfer(payment.roles[_role].user, remainder);
      payoutToken.transfer(colonyNetworkAddress, fee);
    }

    emit TaskPayoutClaimed(_id, _role, _token, remainder);
  }

  function getFundingPotCount() public view returns (uint256 count) {
    return fundingPotCount;
  }

  function getFundingPotBalance(uint256 _potId, address _token) public view returns (uint256) {
    return fundingPots[_potId].balance[_token];
  }

  function getFundingPot(uint256 _potId) public view returns (FundingPotAssociatedType associatedType, uint256 associatedTypeId) {
    FundingPot storage pot = fundingPots[_potId];
    return (pot.associatedType, pot.associatedTypeId);
  }

  function moveFundsBetweenPots(uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token) public
  stoppable
  auth
  {
    // Prevent moving funds from between the same pot, which otherwise would cause the pot balance to
    // increment by _amount.
    require(_fromPot != _toPot, "colony-funding-cannot-move-funds-between-the-same-pot");

    // Prevent people moving funds from the pot for paying out token holders
    require(_fromPot > 0, "colony-funding-cannot-move-funds-from-rewards-pot");

    // Preventing sending from non-existent funding pots is not strictly necessary (if a pot doesn't exist, it can't have any funds if we
    // prevent sending to nonexistent funding pots) but doing this check explicitly gives us the error message for clients.
    require(_fromPot <= fundingPotCount, "colony-funding-from-nonexistent-pot"); // Only allow sending from created pots
    require(_toPot <= fundingPotCount, "colony-funding-nonexistent-pot"); // Only allow sending to created funding pots

    uint fromPotPreviousAmount = fundingPots[_fromPot].balance[_token];
    uint toPotPreviousAmount = fundingPots[_toPot].balance[_token];

    fundingPots[_fromPot].balance[_token] = sub(fromPotPreviousAmount, _amount);
    fundingPots[_toPot].balance[_token] = add(toPotPreviousAmount, _amount);

    // If this pot is associated with a Payment, prevent money being taken from the pot
    // if the remaining balance is less than the amount needed for payouts,
    // unless the payment was cancelled.
    FundingPotAssociatedType fromPotAssociatedType = fundingPots[_fromPot].associatedType;

    if (fromPotAssociatedType == FundingPotAssociatedType.Task) {
      uint fromTaskId = fundingPots[_fromPot].associatedTypeId;
      Payment storage payment = payments[fromTaskId];
      uint totalPayout = getTotalTaskPayout(fromTaskId, _token);
      uint surplus = (fromPotPreviousAmount > totalPayout) ? sub(fromPotPreviousAmount, totalPayout) : 0;
      require(payment.status == TaskStatus.Cancelled || surplus >= _amount, "colony-funding-task-bad-state");
      updateTaskPayoutsWeCannotMakeAfterPotChange(fromTaskId, _token, fromPotPreviousAmount);
    }

    FundingPotAssociatedType toPotAssociatedType = fundingPots[_toPot].associatedType;
    if (toPotAssociatedType == FundingPotAssociatedType.Task) {
      uint toTaskId = fundingPots[_toPot].associatedTypeId;
      updateTaskPayoutsWeCannotMakeAfterPotChange(toTaskId, _token, toPotPreviousAmount);
    }

    emit ColonyFundsMovedBetweenFundingPots(_fromPot, _toPot, _amount, _token);
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
      toClaim = sub(sub(targetToken.balanceOf(address(this)), nonRewardPotsTotal[_token]), fundingPots[0].balance[_token]);
    }

    feeToPay = toClaim / getRewardInverse();
    remainder = sub(toClaim, feeToPay);
    nonRewardPotsTotal[_token] = add(nonRewardPotsTotal[_token], remainder);
    fundingPots[1].balance[_token] = add(fundingPots[1].balance[_token], remainder);
    fundingPots[0].balance[_token] = add(fundingPots[0].balance[_token], feeToPay);

    emit ColonyFundsClaimed(_token, feeToPay, remainder);
  }

  function getNonRewardPotsTotal(address _token) public view returns (uint256) {
    return nonRewardPotsTotal[_token];
  }

  function startNextRewardPayout(address _token, bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)
  public auth stoppable
  {
    ITokenLocking tokenLocking = ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking());
    uint256 totalLockCount = tokenLocking.lockToken(token);

    require(!activeRewardPayouts[_token], "colony-reward-payout-token-active");

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

    activeRewardPayouts[_token] = true;

    rewardPayoutCycles[totalLockCount] = RewardPayoutCycle(
      rootHash,
      colonyWideReputation,
      totalTokens,
      fundingPots[0].balance[_token],
      _token,
      block.timestamp
    );

    emit RewardPayoutCycleStarted(totalLockCount);
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

    ERC20Extended(tokenAddress).transfer(msg.sender, remainder);
    ERC20Extended(tokenAddress).transfer(colonyNetworkAddress, fee);

    emit RewardPayoutClaimed(_payoutId, msg.sender, fee, remainder);
  }

  function finalizeRewardPayout(uint256 _payoutId) public stoppable {
    RewardPayoutCycle memory payout = rewardPayoutCycles[_payoutId];

    require(activeRewardPayouts[payout.tokenAddress], "colony-reward-payout-token-not-active");
    require(block.timestamp - payout.blockTimestamp > 60 days, "colony-reward-payout-active");

    activeRewardPayouts[payout.tokenAddress] = false;

    emit RewardPayoutCycleEnded(_payoutId);
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

    emit ColonyRewardInverseSet(_rewardInverse);
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

    ITokenLocking tokenLocking = ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking());
    uint256 userDepositTimestamp = tokenLocking.getUserLock(token, msg.sender).timestamp;
    uint256 userTokens = tokenLocking.getUserLock(token, msg.sender).balance;

    require(userDepositTimestamp < payout.blockTimestamp, "colony-reward-payout-deposit-too-recent");
    require(userTokens > 0, "colony-reward-payout-invalid-user-tokens");
    require(userReputation > 0, "colony-reward-payout-invalid-user-reputation");

    // squareRoots[0] - square root of userReputation
    // squareRoots[1] - square root of userTokens
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

  function updateTaskPayoutsWeCannotMakeAfterPotChange(uint256 _id, address _token, uint _prev) internal {
    Payment storage payment = payments[_id];
    uint totalTokenPayout = getTotalTaskPayout(_id, _token);
    uint tokenPot = fundingPots[payment.fundingPotId].balance[_token];

    if (_prev >= totalTokenPayout) {                                  // If the old amount in the pot was enough to pay for the budget
      if (tokenPot < totalTokenPayout) {                              // And the new amount in the pot is not enough to pay for the budget...
        payment.payoutsWeCannotMake += 1;                                // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                          // If this 'else' is running, then the old amount in the pot could not pay for the budget
      if (tokenPot >= totalTokenPayout) {                             // And the new amount in the pot can pay for the budget
        payment.payoutsWeCannotMake -= 1;                                // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function updateTaskPayoutsWeCannotMakeAfterBudgetChange(uint256 _id, address _token, uint _prev) internal {
    Payment storage payment = payments[_id];
    uint totalTokenPayout = getTotalTaskPayout(_id, _token);
    uint tokenPot = fundingPots[payment.fundingPotId].balance[_token];
    if (tokenPot >= _prev) {                                          // If the amount in the pot was enough to pay for the old budget...
      if (tokenPot < totalTokenPayout) {                              // And the amount is not enough to pay for the new budget...
        payment.payoutsWeCannotMake += 1;                                // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                          // If this 'else' is running, then the amount in the pot was not enough to pay for the old budget
      if (tokenPot >= totalTokenPayout) {                             // And the amount is enough to pay for the new budget...
        payment.payoutsWeCannotMake -= 1;                                // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  uint256 constant MAX_PAYOUT = 2**254 - 1; // Up to 254 bits to account for sign and payout modifiers.

  function setTaskPayout(uint256 _id, TaskRole _role, address _token, uint256 _amount) private
  taskExists(_id)
  taskNotComplete(_id)
  taskNotFinalized(_id)
  {
    require(_amount <= MAX_PAYOUT, "colony-funding-payout-too-large");

    uint currentTotalAmount = getTotalTaskPayout(_id, _token);
    payments[_id].payouts[uint8(_role)][_token] = _amount;

    // This call functions as a guard to make sure the new total payout doesn't overflow
    // If there is an overflow, the call will revert
    getTotalTaskPayout(_id, _token);

    updateTaskPayoutsWeCannotMakeAfterBudgetChange(_id, _token, currentTotalAmount);
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
