const { NonceManager } = require("@ethersproject/experimental");

class ExtendedNonceManager extends NonceManager {
  async sendTransaction(transactionRequest) {
    try {
      const txCount = await this.signer.getTransactionCount("latest");
      this.setTransactionCount(txCount);
      const response = super.sendTransaction(transactionRequest);
      const tx = await response;
      await tx.wait();
      return response;
    } catch (e) {
      if (e.code === "NONCE_EXPIRED" || e.code === "TRANSACTION_REPLACED") {
        // The nonce has expired, so try again
        return this.sendTransaction(transactionRequest);
      }
      throw e;
    }
  }
}

module.exports = ExtendedNonceManager;
