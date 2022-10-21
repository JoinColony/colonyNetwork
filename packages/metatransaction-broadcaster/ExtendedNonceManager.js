const { NonceManager } = require("@ethersproject/experimental");

class ExtendedNonceManager extends NonceManager {
  constructor(signer) {
    super(signer);
    this.signedTransactions = {};
    this.signer.provider.on("block", async () => {
      Object.keys(this.signedTransactions).map(async (txHash) => {
        const nodeTx = await this.signer.provider.getTransaction(txHash);
        if (!nodeTx) {
          this.signer.provider.sendTransaction(this.signedTransactions[txHash]);
          return;
        }
        if (nodeTx.blockNumber) {
          // It's been mined, so forget it.
          delete this.signedTransactions[txHash];
        }
        // Otherwise it's known, but not mined yet. No action required.
      });
    });
  }

  async sendTransaction(transactionRequest) {
    // What nonce are we going to attach to this?
    // Definitely not any we've sent and are pending
    const pendingNonces = Object.keys(this.signedTransactions).map((txhash) => this.signedTransactions[txhash].nonce);
    // At least whatever the endpoint says
    let nonce = await this.signer.getTransactionCount();
    // Note the order we did the above two lines in - if a tx is mined between these two lines,
    // and got removed by the `on block` handler above, by doing it in this order we won't be tripped up
    // And we'll skip any nonces we've already used
    while (pendingNonces.includes(nonce)) {
      nonce += 1;
    }
    transactionRequest.nonce = nonce; // eslint-disable-line no-param-reassign

    const response = super.sendTransaction(transactionRequest);
    const tx = await response;
    this.signedTransactions[tx.hash] = transactionRequest;
    return response;
  }
}

module.exports = ExtendedNonceManager;
