// These globals represent contracts and are added by Truffle:
/* globals FakeNewRootColony, RootColony, Colony, RootColonyResolver, ColonyFactory, EternalStorage*/

import Promise from 'bluebird';
import _ from 'lodash';
import shortid from 'shortid';

module.exports = {
  ifUsingTestRPC(err) {
    // Make sure this is a throw we expect.
    assert.oneOf(err.message, ['VM Exception while processing transaction: out of gas', 'VM Exception while processing transaction: invalid JUMP']);
    // Okay, so, there is a discrepancy between how testrpc handles
    // OOG errors (throwing an exception all the way up to these tests) and
    // how geth handles them (still making a valid transaction and returning
    // a txid). For the explanation of why, see
    //
    // See https://github.com/ethereumjs/testrpc/issues/39
    //
    // Obviously, we want our tests to pass on both, so this is a
    // bit of a problem. We have to have this special function that we use to catch
    // the error. I've named it so that it reads well in the tests below - i.e.
    // .catch(ifUsingTestRPC)
    // Note that it just swallows the error - open to debate on whether this is
    // the best thing to do, or it should log it even though it's expected, in
    // case we get an error that is unexpected...
    // console.log('Error:',err)
    const block = web3.eth.getBlock('latest', true);
    return block.transactions[0].hash;
  },
  checkAllGasSpent(gasAmount, txid) {
    const receipt = web3.eth.getTransactionReceipt(txid);
    // When a transaction throws, all the gas sent is spent. So let's check that
    // we spent all the gas that we sent.
    assert.equal(gasAmount, receipt.gasUsed, 'didnt fail - didn\'t throw and use all gas');
  },
  getRandomString(_length) {
    const length = _length || 7;
    let randString = '';
    while (randString.length < length) {
      randString += shortid.generate().replace(/_/g, '').toLowerCase();
    }
    return randString.slice(0, length);
  },
  waitAll(promises, callback) {
    return Promise.all(promises)
    .then(function () {
      callback();
    })
    .catch(callback);
  },
  _,
  Promise,
  hexToUtf8(text) {
    return web3.toAscii(text).replace(/\u0000/g, '');
  },
  setDefaultGas() {
    const GAS_PRICE = 0;
    const GAS_TO_SPEND = 4e6;
    RootColony.defaults({ gasPrice: GAS_PRICE, gas: GAS_TO_SPEND });
    FakeNewRootColony.defaults({ gasPrice: GAS_PRICE, gas: GAS_TO_SPEND });
    ColonyFactory.defaults({ gasPrice: GAS_PRICE, gas: GAS_TO_SPEND });
    EternalStorage.defaults({ gasPrice: GAS_PRICE, gas: GAS_TO_SPEND });
    RootColonyResolver.defaults({ gasPrice: GAS_PRICE, gas: GAS_TO_SPEND });
    Colony.defaults({ gasPrice: GAS_PRICE, gas: GAS_TO_SPEND });
  },
};
