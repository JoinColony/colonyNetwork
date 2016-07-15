library ColonyPaymentProvider
{
  function SettleTaskFees(uint256 taskValueEth, address taskCompletor, address rootColony)
  {
    // Pay the task Ether value -5% to task completor and 5% to rootColony
    var payout = (taskValueEth * 95)/100;
    var fee = taskValueEth - payout;
    // Check if send fails revert the transaction
    if (!taskCompletor.send(payout)){
      throw;
    }
    if(!rootColony.send(fee)){
      throw;
    }
  }
}
