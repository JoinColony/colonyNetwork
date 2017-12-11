// These globals represent contracts and are added by Truffle:
/* globals ColonyNetwork, Colony */

import shortid from 'shortid';
const GAS_TO_SPEND = 3500000;

module.exports = {
  web3GetNetwork() {
    return new Promise((resolve, reject) => {
      web3.version.getNetwork((err, res) => {
        if (err !== null) return reject(err)
        return resolve(res)
      })
    })
  },
  web3GetClient() {
    return new Promise((resolve, reject) => {
      web3.version.getNode((err, res) => {
        if (err !== null) return reject(err)
        return resolve(res)
      })
    })
  },
  web3GetBalance(account) {
    return new Promise((resolve, reject) => {
      web3.eth.getBalance(account, (err, res) => {
        if (err !== null) return reject(err)
        return resolve(res)
      })
    })
  },
  web3GetTransactionReceipt(txid) {
    return new Promise((resolve, reject) => {
      web3.eth.getTransactionReceipt(txid, (err, res) => {
        if (err !== null) return reject(err)
        return resolve(res);
      })
    })
  },
  ifUsingTestRPC(err) {
    // Make sure this the error we expect.
    if (err.message.indexOf('out of gas') == -1
  && err.message.indexOf('invalid JUMP') == -1
  && err.message.indexOf('invalid opcode') == -1) {
    throw err;
  }
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

    return new Promise((resolve, reject) => {
      web3.eth.getBlock('latest', true, (err, res) => {
        if (err !== null) return reject(err)
        return resolve(res.transactions[0].hash);
      })
    })
  },
  assertRevert(err) {
    if (err.message.indexOf('revert') == -1) {
      throw err;
    }

    return new Promise((resolve, reject) => {
      web3.eth.getBlock('latest', true, (err, res) => {
        if (err !== null) return reject(err)
        return resolve(res.transactions[0].hash);
      })
    })
  },
  async checkAllGasSpent(gasAmount, tx) {
    const txid = !tx.tx ? tx : tx.tx;
    const receipt = await this.web3GetTransactionReceipt(txid);

    // When a transaction throws, all the gas sent is spent. So let's check that
    // we spent all the gas that we sent.
    assert.closeTo(gasAmount, receipt.gasUsed, 73000, 'didnt fail - didn\'t throw and use all gas');
  },
  checkErrorNonPayableFunction(tx) {
    assert.equal(tx, 'Error: Cannot send value to non-payable function');
  },
  getRandomString(_length) {
    const length = _length || 7;
    let randString = '';
    while (randString.length < length) {
      randString += shortid.generate().replace(/_/g, '').toLowerCase();
    }
    return randString.slice(0, length);
  },
  hexToUtf8(text) {
    return web3.toAscii(text).replace(/\u0000/g, '');
  },
  currentBlockTime()
  { 
    return web3.eth.getBlock("latest").timestamp;
  },
  forwardTime(seconds) {
    console.log('Forwarding time with ' + seconds + 's ...');
    web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: 0});
    web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
  }
};
