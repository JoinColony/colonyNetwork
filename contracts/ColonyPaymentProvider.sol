library ColonyPaymentProvider
{
  function SettleTaskFees(uint256 taskValueEth, address taskCompletor, address rootColony)
  {
    // Pay the task Ether and Shares value -5% to task completor
    taskCompletor.send(taskValueEth * (95)/100);
    // Pay root colony 5% fee
    rootColony.send((taskValueEth * 5)/100);
  }

  modifier hasEnoughBalance(address _from, uint256 _value)
  {
    if(_value == 0) throw;
  }
}
