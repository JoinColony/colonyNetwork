const { NonceManager } = require("@ethersproject/experimental");
const { parseTransaction } = require("ethers/lib/utils");

class ExtendedNonceManager extends NonceManager {
  constructor(signer) {
    super(signer);
    this.signedTransactions = {};
    this.nonce = 0;
    this.signer.provider.on("block", async () => {
      Object.keys(this.signedTransactions).map(async (txHash) => {
        const nodeTx = await this.signer.provider.getTransaction(txHash);
        if (!nodeTx) {
          const txCount = await this.signer.getTransactionCount("pending");
          const parsedTransaction = parseTransaction(this.signedTransactions[txHash]);
          if (parsedTransaction.nonce < txCount) {
            // It's not been mined, but it's been replaced by another tx.
            // Resend, with a new nonce
            delete this.signedTransactions[txHash];
            this.sendTransaction({
              from: parsedTransaction.from,
              to: parsedTransaction.to,
              value: parsedTransaction.value,
              data: parsedTransaction.data,
            });
          } else {
            // No reason to think it's been replaced, so rebroadcast.
            this.signer.provider.sendTransaction(this.signedTransactions[txHash]);
            return;
          }
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
    try {
      const populatedTransaction = await this.populateTransaction(transactionRequest);
      const signedTransaction = await this.signTransaction(populatedTransaction);
      const response = super.sendTransaction(transactionRequest);
      const tx = await response;
      this.signedTransactions[tx.hash] = signedTransaction;
      return response;
    } catch (e) {
      if (e.code === "NONCE_EXPIRED") {
        // The nonce has expired, so we need to update it.
        const txCount = await this.signer.getTransactionCount("pending");
        this.setTransactionCount(txCount);
        return this.sendTransaction(transactionRequest);
      }
      console.log(e);
      throw e;
    }
  }
}

module.exports = ExtendedNonceManager;
