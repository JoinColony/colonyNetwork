const ethers = require("ethers");
const backoff = require("exponential-backoff").backOff;

class RetryProvider extends ethers.providers.StaticJsonRpcProvider {
  constructor(connectionInfo, adapterObject) {
    super(connectionInfo);
    this.adapter = adapterObject;
  }

  static attemptCheck(err, attemptNumber) {
    const allowedErrorCodes = ["CALL_EXCEPTION", "UNPREDICTABLE_GAS_LIMIT"];
    if (allowedErrorCodes.includes(err.code)) {
      console.log(`Got a ${err.code}, no retrying`);
      return false;
    }

    // I _think_ this means we're using solidity-coverage vs stock hardhat, but haven't dug in to it
    if (err.error && err.error.data && err.error.data.length > 10 && err.error.data.substring(0, 10) === "0x08c379a0") {
      console.log("Got a revert with reason, no retrying");
      return false;
    }

    console.log("Retrying RPC request #", attemptNumber);
    if (attemptNumber === 5) {
      return false;
    }
    return true;
  }

  getNetwork() {
    return backoff(() => super.getNetwork(), { retry: RetryProvider.attemptCheck });
  }

  // This should return a Promise (and may throw erros)
  // method is the method name (e.g. getBalance) and params is an
  // object with normalized values passed in, depending on the method
  perform(method, params) {
    return backoff(() => super.perform(method, params), { retry: RetryProvider.attemptCheck, startingDelay: 1000 });
  }
}

module.exports = RetryProvider;
