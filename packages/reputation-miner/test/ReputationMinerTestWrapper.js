const ReputationMiner = require("../ReputationMiner");

class ReputationMinerTestWrapper extends ReputationMiner {
  async submitRootHash(entryIndex) {
    const tx = await super.submitRootHash(entryIndex);
    return tx.wait();
  }

  async confirmJustificationRootHash() {
    const tx = await super.confirmJustificationRootHash();
    return tx.wait();
  }

  async respondToBinarySearchForChallenge() {
    const tx = await super.respondToBinarySearchForChallenge();
    return tx.wait();
  }

  async confirmBinarySearchResult() {
    const tx = await super.confirmBinarySearchResult();
    return tx.wait();
  }

  async respondToChallenge() {
    const tx = await super.respondToChallenge();
    return tx.wait();
  }

  async confirmNewHash() {
    const tx = await super.confirmNewHash();
    return tx.wait();
  }
}

module.exports = ReputationMinerTestWrapper;
