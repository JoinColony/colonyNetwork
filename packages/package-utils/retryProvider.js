const ethers = require("ethers");
const backoff = require("exponential-backoff").backOff;

class RetryProvider extends ethers.providers.StaticJsonRpcProvider {
  constructor(connectionInfo, adapterObject) {
    super(connectionInfo);
    this.adapter = adapterObject;
  }

  static attemptCheck(err, attemptNumber) {
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

exports.RetryProvider = RetryProvider;
