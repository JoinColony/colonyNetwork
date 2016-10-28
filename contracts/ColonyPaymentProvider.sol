pragma solidity ^0.4.0;


library ColonyPaymentProvider
{
  function settleTaskFees(uint256 taskValueEth, address taskCompletor, address rootColony)
  {
    // Pay the task Ether value -5% to task completor and 5% to rootColony
    var payout = (taskValueEth * 95) / 100;
    var fee = taskValueEth - payout;
    // If any of the two send transactions fail, throw
    if (!taskCompletor.send(payout) || !rootColony.send(fee)){
      throw;
    }
  }
}
