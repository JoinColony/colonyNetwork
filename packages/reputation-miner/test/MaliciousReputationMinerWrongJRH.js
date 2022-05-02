const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper");

class MaliciousReputationMinerWrongJRH extends ReputationMinerTestWrapper {
  // Only difference between this and the 'real' client should be that it submits a bad JRH

  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
  }

  // eslint-disable-next-line class-methods-use-this
  async respondToChallenge() {
    // This client sometimes won't be able to respond to challenge - we mess up its JRH with a hash it doesn't know about
  }

  async submitRootHash(entryIndex) {
    const hash = await this.getRootHash();
    const repCycle = await this.getActiveRepCycle();
    // Get how much we've staked, and thefore how many entries we have

    if (!entryIndex) {
      entryIndex = await this.getEntryIndex(); // eslint-disable-line no-param-reassign
    }

    // Mess up the JRH
    const insertTx = await this.justificationTree.insert(
      MaliciousReputationMinerWrongJRH.getHexString(parseInt(this.entryToFalsify, 10), 64),
      `0x${"0".repeat(127)}1`,
      { gasLimit: 4000000 }
    );
    if (!this.useJsTree){
      await insertTx.wait();
    }
    // Get the JRH
    const jrh = await this.justificationTree.getRootHash();
    // Submit that entry
    const gas = await repCycle.estimateGas.submitRootHash(hash, this.nReputations, jrh, entryIndex);
    const tx = await repCycle.submitRootHash(hash, this.nReputations, jrh, entryIndex, { gasLimit: `${gas.toHexString()}` });
    return tx.wait();
  }
}

module.exports = MaliciousReputationMinerWrongJRH;
