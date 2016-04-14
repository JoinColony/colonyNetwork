library ColonyPaymentProvider
{
  function SettleTaskFees(uint256 taskValueEth, address taskCompletor, address rootColony)
  {
    // Pay the task Ether and Shares value -5% to task completor
    var payout = (taskValueEth * 95)/100;
    var fee = taskValueEth - payout;
    taskCompletor.send(payout);
    // Pay root colony 5% fee
    rootColony.send(fee);
  }
}
