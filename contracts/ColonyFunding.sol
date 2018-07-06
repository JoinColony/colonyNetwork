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


contract ColonyFunding is ColonyStorage {
  event RewardPayoutCycleStarted(uint256 indexed id);
  event RewardPayoutCycleEnded(uint256 indexed id);
  event TaskWorkerPayoutChanged(uint256 indexed id, address token, uint256 amount);

  function getFeeInverse() public pure returns (uint256) {
    // TODO: refer to ColonyNetwork
    return 100;
  }

  function getRewardInverse() public pure returns (uint256) {
    // TODO: Make settable by colony
    return 100;
  }

  function setTaskManagerPayout(uint256 _id, address _token, uint256 _amount) public self {
    setTaskPayout(_id, MANAGER, _token, _amount);
  }

  function setTaskEvaluatorPayout(uint256 _id, address _token, uint256 _amount) public self {
    setTaskPayout(_id, EVALUATOR, _token, _amount);
  }

  function setTaskWorkerPayout(uint256 _id, address _token, uint256 _amount) public self {
    setTaskPayout(_id, WORKER, _token, _amount);

    emit TaskWorkerPayoutChanged(_id, _token, _amount);
  }

  // To get all payouts for a task iterate over roles.length
  function getTaskPayout(uint256 _id, uint256 _role, address _token) public view returns (uint256) {
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

  function claimPayout(uint256 _id, uint256 _role, address _token) public
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

    uint fee = payout / getFeeInverse();
    uint remainder = sub(payout, fee);

    if (_token == 0x0) {
      // Payout ether
      task.roles[_role].user.transfer(remainder);
      // Fee goes directly to Meta Colony
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      address metaColonyAddress = colonyNetworkContract.getMetaColony();
      metaColonyAddress.transfer(fee);
    } else {
      // Payout token
      // TODO: If it's a whitelisted token, it goes straight to the metaColony
      // If it's any other token, goes to the colonyNetwork contract first to be auctioned.
      ERC20Extended payoutToken = ERC20Extended(_token);
      payoutToken.transfer(task.roles[_role].user, remainder);
      payoutToken.transfer(colonyNetworkAddress, fee);
    }
  }

  function getPotBalance(uint256 _potId, address _token) public view returns (uint256) {
    return pots[_potId].balance[_token];
  }

  function moveFundsBetweenPots(uint256 _fromPot, uint256 _toPot, uint256 _amount, address _token) public
  auth
  {
    // Prevent people moving funds from the pot for paying out token holders
    require(_fromPot > 0, "colony-funding-cannot-move-funds-from-pot-0");

    // TODO Only allow sending from created pots - perhaps not necessary explicitly, but if not, note as such here.
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
      require(task.cancelled || surplus >= _amount, "colony-funding-task-bad-state");
    }

    pots[_fromPot].balance[_token] = sub(fromPotPreviousAmount, _amount);
    pots[_toPot].balance[_token] = add(toPotPreviousAmount, _amount);
    updateTaskPayoutsWeCannotMakeAfterPotChange(toTaskId, _token, toPotPreviousAmount);
    updateTaskPayoutsWeCannotMakeAfterPotChange(fromTaskId, _token, fromPotPreviousAmount);
  }

  function claimColonyFunds(address _token) public {
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
    if (token == _token) { // Well this line isn't easy to understand
      // Basically, if we're using our own tokens, then we don't siphon off a chunk for rewards
      feeToPay = 0;
    }
    remainder = sub(toClaim, feeToPay);
    nonRewardPotsTotal[_token] = add(nonRewardPotsTotal[_token], remainder);
    pots[1].balance[_token] = add(pots[1].balance[_token], remainder);
    pots[0].balance[_token] = add(pots[0].balance[_token], feeToPay);
  }

  function getNonRewardPotsTotal(address _token) public view returns (uint256) {
    return nonRewardPotsTotal[_token];
  }

  function startNextRewardPayout(address _token) public auth {
    ITokenLocking tokenLocking = ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking());
    uint256 totalLockCount = tokenLocking.lockToken(address(token));

    require(!activeRewardPayouts[_token], "colony-reward-payout-token-active");

    uint256 totalTokens = sub(token.totalSupply(), token.balanceOf(address(this)));
    require(totalTokens > 0, "colony-reward-payout-invalid-total-tokens");

    activeRewardPayouts[_token] = true;

    rewardPayoutCycles[totalLockCount] = RewardPayoutCycle(
      IColonyNetwork(colonyNetworkAddress).getReputationRootHash(),
      totalTokens,
      pots[0].balance[_token],
      _token,
      block.timestamp
    );

    emit RewardPayoutCycleStarted(totalLockCount);
  }

  function claimRewardPayout(uint256 _payoutId, uint256[7] _squareRoots, uint256 _userReputation, uint256 _totalReputation) public {
    RewardPayoutCycle memory payout = rewardPayoutCycles[_payoutId];
    // Checking if payout is active
    require(block.timestamp - payout.blockTimestamp <= 60 days, "colony-reward-payout-not-active");

    //TODO: Prove that userReputation and totalReputation in reputationState (reputation root hash at the start of the payout) are correct

    ITokenLocking tokenLocking = ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking());
    uint256 userTokens;
    (, userTokens) = tokenLocking.getUserLock(address(token), msg.sender);

    require(_totalReputation > 0, "colony-reward-payout-invalid-total-reputation");
    require(userTokens > 0, "colony-reward-payout-invalid-user-tokens");
    require(_userReputation > 0, "colony-reward-payout-invalid-user-reputation");

    // squareRoots[0] - square root of _userReputation
    // squareRoots[1] - square root of userTokens
    // squareRoots[2] - square root of _totalReputation
    // squareRoots[3] - square root of totalTokens
    // squareRoots[4] - square root of numerator
    // squareRoots[5] - square root of denominator
    // squareRoots[6] - square root of payout.amount

    require(mul(_squareRoots[0], _squareRoots[0]) <= _userReputation, "colony-reward-payout-invalid-parametar-user-reputation");
    require(mul(_squareRoots[1], _squareRoots[1]) <= userTokens, "colony-reward-payout-invalid-parametar-user-token");
    require(mul(_squareRoots[2], _squareRoots[2]) <= _totalReputation, "colony-reward-payout-invalid-parametar-total-reputation");
    require(mul(_squareRoots[3], _squareRoots[3]) <= payout.totalTokens, "colony-reward-payout-invalid-parametar-total-tokens");
    require(mul(_squareRoots[6], _squareRoots[6]) <= payout.amount, "colony-reward-payout-invalid-parametar-amount");
    uint256 numerator = mul(_squareRoots[0], _squareRoots[1]);
    uint256 denominator = mul(_squareRoots[2], _squareRoots[3]);

    require(mul(_squareRoots[4], _squareRoots[4]) <= numerator, "colony-reward-payout-invalid-parametar-numerator");
    require(mul(_squareRoots[5], _squareRoots[5]) <= denominator, "colony-reward-payout-invalid-parametar-denominator");

    uint256 reward = (mul(_squareRoots[4], _squareRoots[6]) / (_squareRoots[5] + 1)) ** 2;

    tokenLocking.unlockTokenForUser(address(token), msg.sender, _payoutId);

    pots[0].balance[payout.tokenAddress] = sub(pots[0].balance[payout.tokenAddress], reward);

    ERC20Extended(payout.tokenAddress).transfer(msg.sender, reward);
  }

  function finalizeRewardPayout(uint256 _payoutId) public {
    RewardPayoutCycle memory payout = rewardPayoutCycles[_payoutId];

    require(activeRewardPayouts[payout.tokenAddress], "colony-reward-payout-token-not-active");
    require(block.timestamp - payout.blockTimestamp > 60 days, "colony-reward-payout-active");

    activeRewardPayouts[payout.tokenAddress] = false;

    emit RewardPayoutCycleEnded(_payoutId);
  }

  function getRewardPayoutInfo(uint256 _payoutId) public view returns (bytes32, uint256, uint256, address, uint256) {
    RewardPayoutCycle memory rewardPayoutInfo = rewardPayoutCycles[_payoutId];
    return (rewardPayoutInfo.reputationState, rewardPayoutInfo.totalTokens, rewardPayoutInfo.amount, rewardPayoutInfo.tokenAddress, rewardPayoutInfo.blockTimestamp);
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

  function setTaskPayout(uint256 _id, uint256 _role, address _token, uint256 _amount) private
  taskExists(_id)
  taskNotFinalized(_id)
  {
    uint currentTotalAmount = getTotalTaskPayout(_id, _token);
    tasks[_id].payouts[_role][_token] = _amount;

    // This call functions as a guard to make sure the new total payout doesn't overflow
    // If there is an overflow, the call will revert
    getTotalTaskPayout(_id, _token);

    updateTaskPayoutsWeCannotMakeAfterBudgetChange(_id, _token, currentTotalAmount);
  }
}
