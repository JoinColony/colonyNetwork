import ReputationMiner from "../ReputationMiner";

class ReputationMinerTestWrapper extends ReputationMiner {
  constructor(opts) {
    super(opts);
  }

  async submitRootHash(startIndex) {
    const tx = await super.submitRootHash(startIndex);
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
}

export default ReputationMinerTestWrapper;
