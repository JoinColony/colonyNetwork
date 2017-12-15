import shortid from 'shortid';

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
  web3GetTransaction(txid) {
    return new Promise((resolve, reject) => {
      web3.eth.getTransaction(txid, (err, res) => {
        if (err !== null) return reject(err)
        return resolve(res);
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
  web3GetFirstTransactionHashFromLastBlock() {
    return new Promise((resolve, reject) => {
      web3.eth.getBlock('latest', true, (err, res) => {
        if (err !== null) return reject(err)
        return resolve(res.transactions[0].hash);
      })
    })
  },
  async checkErrorRevert(promise) {
    return this.checkError(promise, false);
  },
  async checkErrorAssert(promise) {
    return this.checkError(promise, true);
  },
  async checkError(promise, isAssert) {
    // There is a discrepancy between how testrpc handles errors 
    // (throwing an exception all the way up to these tests) and how geth/parity handle them 
    // (still making a valid transaction and returning a txid). For the explanation of why
    // See https://github.com/ethereumjs/testrpc/issues/39
    //
    // Obviously, we want our tests to pass on all, so this is a bit of a problem. 
    // We have to have this special function that we use to catch the error. 
    // For testrpc we additionally check the error returned is from a `require` failure.
    let txHash;
    try {
      let tx = await promise;
      txHash = tx.tx;
    } catch (err) {
      // Make sure this is a revert (returned from EtherRouter)
      if (err.message.indexOf('VM Exception while processing transaction: revert') == -1) {
        throw err;
      }

      txHash = await this.web3GetFirstTransactionHashFromLastBlock(); 
    }

    const receipt = await this.web3GetTransactionReceipt(txHash);
    // Check the receipt `status` to ensure transaction failed.
    assert.equal(receipt.status, 0);

    if (isAssert) {
      const network = await this.web3GetNetwork();
      const transaction = await this.web3GetTransaction(txHash);
      if (network != "coverage") {
        // When a transaction throws, all the gas sent is spent. So let's check that we spent all the gas that we sent.
        // When using EtherRouter not all sent gas is spent, it is 73000 gas less than the total.
        assert.closeTo(transaction.gas, receipt.gasUsed, 73000, 'didnt fail - didn\'t throw and use all gas');
      }
    }
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
  async forwardTime(seconds, test) {
    const client = await this.web3GetClient();
    if (client.indexOf('TestRPC') === -1) {
      test.skip();
    } else {
      //console.log('Forwarding time with ' + seconds + 's ...');
      web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: 0});
      web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});      
    }
  }
};
