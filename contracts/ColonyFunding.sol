pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./ColonyStorage.sol";


contract ColonyFunding is ColonyStorage, DSMath {
  function getFeeInverse() public pure returns (uint) {
    // Return 1 / the fee to pay to the network.
    // e.g. if the fee is 1% (or 0.01), return 100
    // TODO: refer to ColonyNetwork
    return 100;
  }

  function getRewardInverse() public pure returns (uint) {
    // Return 1 / the reward to pay out from revenue.
    // e.g. if the fee is 1% (or 0.01), return 100
    // TODO: Make settable by colony
    return 100;
  }

  function setTaskPayout(uint _id, uint _role, address _token, uint _amount) public
  self()
  taskExists(_id)
  taskNotAccepted(_id)
  {
    Task storage task = tasks[_id];
    uint currentAmount = task.payouts[_role][_token];
    task.payouts[_role][_token] = _amount;

    uint currentTotalAmount = task.totalPayouts[_token];
    task.totalPayouts[_token] = add(sub(currentTotalAmount, currentAmount), _amount);
    updateTaskPayoutsWeCannotMakeAfterBudgetChange(_id, _token, currentTotalAmount);
  }

  // To get all payouts for a task iterate over roles.length
  function getTaskPayout(uint _id, uint _role, address _token) public view
  returns (uint)
  {
    Task storage task = tasks[_id];
    return task.payouts[_role][_token];
  }

  function claimPayout(uint _id, uint _role, address _token) public
  taskAccepted(_id)
  {
    Task storage task = tasks[_id];
    require(task.roles[_role] == msg.sender);
    uint payout = task.payouts[_role][_token];
    task.payouts[_role][_token] = 0;
    task.totalPayouts[_token] = sub(task.totalPayouts[_token], payout);
    pots[task.potId].balance[_token] = sub(pots[task.potId].balance[_token], payout);
    nonRewardPotsTotal[_token] = sub(nonRewardPotsTotal[_token], payout);
    uint fee = payout / getFeeInverse();
    uint remainder = sub(payout, fee);
    if (_token == 0x0) {
      // Payout ether
      task.roles[_role].transfer(remainder);
      // Fee goes directly to Common Colony
      IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
      address commonColonyAddress = colonyNetworkContract.getColony("Common Colony");
      commonColonyAddress.transfer(fee);
    } else {
      // Payout token
      // TODO: If it's a whitelisted token, it goes straight to the commonColony
      // If it's any other token, goes to the colonyNetwork contract first to be auctioned.
      ERC20Extended payoutToken = ERC20Extended(_token);
      payoutToken.transfer(task.roles[_role], remainder);
      payoutToken.transfer(colonyNetworkAddress, fee);
    }
  }

  function getPotBalance(uint256 _potId, address _token) public view returns (uint256) {
    return pots[_potId].balance[_token];
  }

  function moveFundsBetweenPots(uint _fromPot, uint _toPot, uint _amount, address _token) public
  auth
  {
    // Prevent people moving funds from the pot for paying out token holders
    require(_fromPot > 0);
    require(_toPot <= potCount); // Only allow sending to created pots
    if (pots[_fromPot].taskId > 0) {
      Task storage task = tasks[pots[_fromPot].taskId];
      require(task.accepted == false || task.totalPayouts[_token] == 0);
      // i.e. if this pot is associated with a task, prevent money being taken from the pot if the task
      // has been accepted, unless everyone has been paid out.
    }
    // TODO: At some point, funds have to be unable to be removed from tasks (until everyone's been paid and
    // extra funds can be reclaimed)
    uint fromPotPreviousAmount = pots[_fromPot].balance[_token];
    uint toPotPreviousAmount = pots[_toPot].balance[_token];
    pots[_fromPot].balance[_token] = sub(fromPotPreviousAmount, _amount);
    pots[_toPot].balance[_token] = add(toPotPreviousAmount, _amount);
    uint fromTaskId = pots[_fromPot].taskId;
    uint toTaskId = pots[_toPot].taskId;
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

  function getNonRewardPotsTotal(address a) public view returns (uint) {
    return nonRewardPotsTotal[a];
  }

  function updateTaskPayoutsWeCannotMakeAfterPotChange(uint256 _id, address _token, uint _prev) internal {
    Task storage task = tasks[_id];
    uint totalTokenPayout = task.totalPayouts[_token];
    uint tokenPot = pots[task.potId].balance[_token];
    if (_prev >= totalTokenPayout) {                                   // If the old amount in the pot was enough to pay for the budget
      if (tokenPot < totalTokenPayout) {                               // And the new amount in the pot is not enough to pay for the budget...
        task.payoutsWeCannotMake += 1;                                  // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                            // If this 'else' is running, then the old amount in the pot could not pay for the budget
      if (tokenPot >= totalTokenPayout) {                             // And the new amount in the pot can pay for the budget
        task.payoutsWeCannotMake -= 1;                                  // Then this is a set of payouts we can make that we could not before.
      }
    }
  }

  function updateTaskPayoutsWeCannotMakeAfterBudgetChange(uint256 _id, address _token, uint _prev) internal {
    Task storage task = tasks[_id];
    uint totalTokenPayout = task.totalPayouts[_token];
    uint tokenPot = pots[task.potId].balance[_token];
    if (tokenPot >= _prev) {                                          // If the amount in the pot was enough to pay for the old budget...
      if (tokenPot < totalTokenPayout) {                              // And the amount is not enough to pay for the new budget...
        task.payoutsWeCannotMake += 1;                                 // Then this is a set of payouts we cannot make that we could before.
      }
    } else {                                                           // If this 'else' is running, then the amount in the pot was not enough to pay for the old budget
      if (tokenPot >= totalTokenPayout) {                             // And the amount is enough to pay for the new budget...
        task.payoutsWeCannotMake -= 1;                                 // Then this is a set of payouts we can make that we could not before.
      }
    }
  }
}
