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

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

import "./ColonyStorage.sol";
import "./ITokenLocking.sol";


contract ColonyFunding is ColonyStorage, PatriciaTreeProofs {
  event RewardPayoutCycleStarted(uint256 indexed id);
  event RewardPayoutCycleEnded(uint256 indexed id);
  event TaskWorkerPayoutChanged(uint256 indexed id, address token, uint256 amount);
  event TaskPayoutClaimed(uint256 indexed id, uint256 role, address token, uint256 amount);

  function setTaskManagerPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, MANAGER, _token, _amount);
  }

  function setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, EVALUATOR, _token, _amount);
  }

  function setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount) public stoppable self {
    setTaskPayout(_id, WORKER, _token, _amount);

    emit TaskWorkerPayoutChanged(_id, _token, _amount);
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
  confirmTaskRoleIdentity(_id, MANAGER)
  {
    Task storage task = tasks[_id];

    require(task.roles[EVALUATOR].user == task.roles[MANAGER].user || task.roles[EVALUATOR].user == 0x0, "colony-funding-evaluator-already-set");
    require(task.roles[WORKER].user == task.roles[MANAGER].user || task.roles[WORKER].user == 0x0, "colony-funding-worker-already-set");

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
    Task storage task = tasks[_id];
    require(task.roles[_role].user == msg.sender, "colony-claim-payout-access-denied");

    if (task.roles[_role].rating == TaskRatings.Unsatisfactory) {
      return;
    }

    uint payout = task.payouts[_role][_token];
    task.payouts[_role][_token] = 0;

    pots[task.potId].balance[_token] = sub(pots[task.potId].balance[_token], payout);
    nonRewardPotsTotal[_token] = sub(nonRewardPotsTotal[_token], payout);

    uint fee = calculateNetworkFeeForPayout(payout);
    uint remainder = sub(payout, fee);

    if (_token == 0x0) {
      // Payout ether
      address user = task.roles[_role].user;
      user.transfer(remainder);
      // Fee goes directly to Meta Colony
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      address metaColonyAddress = colonyNetworkContract.getMetaColony();
      metaColonyAddress.transfer(fee);
    } else {
      // Payout token
      // TODO: (post CCv1) If it's a whitelisted token, it goes straight to the metaColony
      // If it's any other token, goes to the colonyNetwork contract first to be auctioned.
      ERC20Extended payoutToken = ERC20Extended(_token);
      payoutToken.transfer(task.roles[_role].user, remainder);
      payoutToken.transfer(colonyNetworkAddress, fee);
    }

    emit TaskPayoutClaimed(_id, _role, _token, remainder);
  }

  function getPotBalance(uint256 _potId, address _token) public view returns (uint256) {
    return pots[_potId].balance[_token];
  }

  function moveFundsBetweenPots(uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token) public
  stoppable
  auth
  {
    // Prevent people moving funds from the pot for paying out token holders
    require(_fromPot > 0, "colony-funding-cannot-move-funds-from-rewards-pot");

    // Preventing sending from non-existent pots is not strictly necessary (if a pot doesn't exist, it can't have any funds if we
    // prevent sending to nonexistent pots) but doing this check explicitly gives us the error message for clients.
    require(_fromPot <= potCount, "colony-funding-from-nonexistent-pot"); // Only allow sending from created pots
    require(_toPot <= potCount, "colony-funding-nonexistent-pot"); // Only allow sending to created pots

    uint fromTaskId = pots[_fromPot].taskId;
    uint toTaskId = pots[_toPot].taskId;

    uint fromPotPreviousAmount = pots[_fromPot].balance[_token];
    uint toPotPreviousAmount = pots[_toPot].balance[_token];

    // If this pot is associated with a task, prevent money being taken from the pot
    // if the remaining balance is less than the amount needed for payouts,
    // unless the task was cancelled.
    if (fromTaskId > 0) {
      Task storage task = tasks[fromTaskId];
      uint totalPayout = getTotalTaskPayout(fromTaskId, _token);
      uint surplus = (fromPotPreviousAmount > totalPayout) ? sub(fromPotPreviousAmount, totalPayout) : 0;
      require(task.status == CANCELLED || surplus >= _amount, "colony-funding-task-bad-state");
    }

    pots[_fromPot].balance[_token] = sub(fromPotPreviousAmount, _amount);
    pots[_toPot].balance[_token] = add(toPotPreviousAmount, _amount);
    updateTaskPayoutsWeCannotMakeAfterPotChange(toTaskId, _token, toPotPreviousAmount);
    updateTaskPayoutsWeCannotMakeAfterPotChange(fromTaskId, _token, fromPotPreviousAmount);
  }

  function claimColonyFunds(address _token) public stoppable {
    uint toClaim;
    uint feeToPay;
    uint remainder;
    if (_token == 0x0) {
      // It's ether
      toClaim = sub(sub(address(this).balance, nonRewardPotsTotal[_token]), pots[0].balance[_token]);
    } else {
      // Assume it's an ERC 20 token.
      ERC20Extended targetToken = ERC20Extended(_token);
      toClaim = sub(sub(targetToken.balanceOf(this), nonRewardPotsTotal[_token]), pots[0].balance[_token]);
    }

    feeToPay = toClaim / getRewardInverse();
    remainder = sub(toClaim, feeToPay);
    nonRewardPotsTotal[_token] = add(nonRewardPotsTotal[_token], remainder);
    pots[1].balance[_token] = add(pots[1].balance[_token], remainder);
    pots[0].balance[_token] = add(pots[0].balance[_token], feeToPay);
  }

  function getNonRewardPotsTotal(address _token) public view returns (uint256) {
    return nonRewardPotsTotal[_token];
  }

  function startNextRewardPayout(address _token, bytes key, bytes value, uint256 branchMask, bytes32[] siblings) public auth stoppable {
    ITokenLocking tokenLocking = ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking());
    uint256 totalLockCount = tokenLocking.lockToken(address(token));

    require(!activeRewardPayouts[_token], "colony-reward-payout-token-active");

    uint256 totalTokens = sub(token.totalSupply(), token.balanceOf(address(this)));
    require(totalTokens > 0, "colony-reward-payout-invalid-total-tokens");

    bytes32 rootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    uint256 colonyWideReputation = checkReputation(
      rootHash,
      domains[1].skillId,
      0x0,
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
      pots[0].balance[_token],
      _token,
      block.timestamp
    );

    emit RewardPayoutCycleStarted(totalLockCount);
  }

  function claimRewardPayout(
    uint256 _payoutId,
    uint256[7] _squareRoots,
    bytes key,
    bytes value,
    uint256 branchMask,
    bytes32[] siblings
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

    pots[0].balance[tokenAddress] = sub(pots[0].balance[tokenAddress], reward);

    ERC20Extended(tokenAddress).transfer(msg.sender, remainder);
    ERC20Extended(tokenAddress).transfer(colonyNetworkAddress, fee);
  }

  function finalizeRewardPayout(uint256 _payoutId) public stoppable {
    RewardPayoutCycle memory payout = rewardPayoutCycles[_payoutId];

    require(activeRewardPayouts[payout.tokenAddress], "colony-reward-payout-token-not-active");
    require(block.timestamp - payout.blockTimestamp > 60 days, "colony-reward-payout-active");

    activeRewardPayouts[payout.tokenAddress] = false;

    emit RewardPayoutCycleEnded(_payoutId);
  }

  function getRewardPayoutInfo(uint256 _payoutId) public view returns (bytes32, uint256, uint256, uint256, address, uint256) {
    RewardPayoutCycle memory rewardPayoutInfo = rewardPayoutCycles[_payoutId];
    return (
      rewardPayoutInfo.reputationState,
      rewardPayoutInfo.colonyWideReputation,
      rewardPayoutInfo.totalTokens,
      rewardPayoutInfo.amount,
      rewardPayoutInfo.tokenAddress,
      rewardPayoutInfo.blockTimestamp
    );
  }

  function setRewardInverse(uint256 _rewardInverse) public
  stoppable
  auth
  {
    require(_rewardInverse > 0, "colony-reward-inverse-cannot-be-zero");
    rewardInverse = _rewardInverse;
  }

  function getRewardInverse() public view returns (uint256) {
    return rewardInverse;
  }

  function checkReputation(
    bytes32 rootHash,
    uint256 skillId,
    address userAddress,
    bytes key,
    bytes value,
    uint256 branchMask,
    bytes32[] siblings
  ) internal view returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRoot(key, value, branchMask, siblings);
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

  function calculateRewardForUser(uint256 payoutId, uint256[7] squareRoots, uint256 userReputation) internal returns (address, uint256) {
    RewardPayoutCycle memory payout = rewardPayoutCycles[payoutId];
    // Checking if payout is active
    require(block.timestamp - payout.blockTimestamp <= 60 days, "colony-reward-payout-not-active");

    uint256 userTokens;
    ITokenLocking tokenLocking = ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking());
    (, userTokens,) = tokenLocking.getUserLock(address(token), msg.sender);

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

    tokenLocking.unlockTokenForUser(address(token), msg.sender, payoutId);

    return (payout.tokenAddress, reward);
  }

  function updateTaskPayoutsWeCannotMakeAfterPotChange(uint256 _id, address _token, uint _prev) internal {
    Task storage task = tasks[_id];
    uint totalTokenPayout = getTotalTaskPayout(_id, _token);
    uint tokenPot = pots[task.potId].balance[_token];
    if (_prev >= totalTokenPayout) {                                  // If the old amount in the pot was enough to pay for the budget
      if (tokenPot < totalTokenPayout) {                              // And the new amount in the pot is not enough to pay for the budget...
        task.payoutsWeCannotMake += 1;                                // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                          // If this 'else' is running, then the old amount in the pot could not pay for the budget
      if (tokenPot >= totalTokenPayout) {                             // And the new amount in the pot can pay for the budget
        task.payoutsWeCannotMake -= 1;                                // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function updateTaskPayoutsWeCannotMakeAfterBudgetChange(uint256 _id, address _token, uint _prev) internal {
    Task storage task = tasks[_id];
    uint totalTokenPayout = getTotalTaskPayout(_id, _token);
    uint tokenPot = pots[task.potId].balance[_token];
    if (tokenPot >= _prev) {                                          // If the amount in the pot was enough to pay for the old budget...
      if (tokenPot < totalTokenPayout) {                              // And the amount is not enough to pay for the new budget...
        task.payoutsWeCannotMake += 1;                                // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                          // If this 'else' is running, then the amount in the pot was not enough to pay for the old budget
      if (tokenPot >= totalTokenPayout) {                             // And the amount is enough to pay for the new budget...
        task.payoutsWeCannotMake -= 1;                                // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function setTaskPayout(uint256 _id, uint8 _role, address _token, uint256 _amount) private
  taskExists(_id)
  taskNotComplete(_id)
  {
    uint currentTotalAmount = getTotalTaskPayout(_id, _token);
    tasks[_id].payouts[_role][_token] = _amount;

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
