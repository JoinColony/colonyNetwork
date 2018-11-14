import ReputationMiner from "../ReputationMiner";

const ethers = require("ethers");

class MaliciousReputationMinerWrongJRH extends ReputationMiner {
  // Only difference between this and the 'real' client should be that it submits a bad JRH

  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
  }

  // eslint-disable-next-line class-methods-use-this
  async respondToChallenge() {
    // This client sometimes won't be able to respond to challenge - we mess up its JRH with a hash it doesn't know about
  }

  async submitRootHash(startIndex = 1) {
    const hash = await this.getRootHash();
    const repCycle = await this.getActiveRepCycle();
    // Get how much we've staked, and thefore how many entries we have
    let entryIndex;
    const [, balance] = await this.tokenLocking.getUserLock(this.clnyAddress, this.minerAddress);
    const reputationMiningWindowOpenTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();
    const minStake = ethers.utils.bigNumberify(10).pow(18).mul(2000); // eslint-disable-line prettier/prettier
    for (let i = ethers.utils.bigNumberify(startIndex); i.lte(balance.div(minStake)); i = i.add(1)) {
      // Iterate over entries until we find one that passes
      const entryHash = await repCycle.getEntryHash(this.minerAddress, i, hash); // eslint-disable-line no-await-in-loop

      const miningCycleDuration = 60 * 60 * 24;
      const constant = ethers.utils
        .bigNumberify(2)
        .pow(256)
        .sub(1)
        .div(miningCycleDuration);

      const block = await this.realProvider.getBlock("latest"); // eslint-disable-line no-await-in-loop
      const { timestamp } = block;

      const target = ethers.utils
        .bigNumberify(timestamp)
        .sub(reputationMiningWindowOpenTimestamp)
        .mul(constant);
      if (ethers.utils.bigNumberify(entryHash).lt(target)) {
        entryIndex = i;
        break;
      }
    }
    if (!entryIndex) {
      return new Error("No valid entry for submission found");
    }
    // Mess up the JRH

    await this.justificationTree.insert(
      ethers.utils.hexZeroPad(ethers.utils.hexlify(parseInt(this.entryToFalsify, 10)), 32),
      `0x${"0".repeat(127)}1`
    );
    // Get the JRH
    const jrh = await this.justificationTree.getRootHash();
    // Submit that entry
    const gas = await repCycle.estimate.submitRootHash(hash, this.nReputations, jrh, entryIndex);

    return repCycle.submitRootHash(hash, this.nReputations, jrh, entryIndex, { gasLimit: `0x${gas.toString(16)}` });
  }
}

export default MaliciousReputationMinerWrongJRH;
