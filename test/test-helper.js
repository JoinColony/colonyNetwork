/* globals web3, assert, module */

module.exports = {
  ifUsingTestRPC : function () {
    //Okay, so, there is a discrepancy between how testrpc handles
    //OOG errors (throwing an exception all the way up to these tests) and
    //how geth handles them (still making a valid transaction and returning
    //a txid). For the explanation of why, see
    //
    //See https://github.com/ethereumjs/testrpc/issues/39
    //
    //Obviously, we want our tests to pass on both, so this is a
    //bit of a problem. We have to have this special function that we use to catch
    //the error. I've named it so that it reads well in the tests below - i.e.
    //.catch(ifUsingTestRPC)
    //Note that it just swallows the error - open to debate on whether this is
    //the best thing to do, or it should log it even though it's expected, in
    //case we get an error that is unexpected...
    // console.log('Error:',err)
    return;
  },
  checkAllGasSpent : function(gasAmount, gasPrice, account, prevBalance){
    var newBalance = web3.eth.getBalance(account);
    //When a transaction throws, all the gas sent is spent. So let's check that
    //we spent all the gas that we sent.
    assert.equal(prevBalance.minus(newBalance).toNumber(), gasAmount*gasPrice, 'didnt fail - didn\'t throw and use all gas');
  }
};
