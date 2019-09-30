import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";
import PatriciaTreeNoHash from "../patriciaNoHashKey";

const ethers = require("ethers");

class MaliciousReputationMinerWrongJRHRightNNodes extends ReputationMinerTestWrapper {
  // Only difference between this and the 'real' client should be that it submits a bad JRH

  constructor(opts, entriesToFalsify, entriesToSkip) {
    super(opts);
    this.entriesToFalsify = entriesToFalsify.map(x => x.toString());
    this.entriesToSkip = entriesToSkip.map(x=>x.toString());
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

    const jt2 = new PatriciaTreeNoHash();
    for (let i = 0; i < Object.keys(this.justificationHashes).length; i+= 1){
      if (this.entriesToSkip.indexOf(i.toString()) === -1){
        await jt2.insert(
          ethers.utils.hexZeroPad(ethers.utils.hexlify(parseInt(i, 10)), 32),
          this.getJRHEntryValueAsBytes(
            this.justificationHashes[ReputationMinerTestWrapper.getHexString(i,64)].interimHash,
            this.justificationHashes[ReputationMinerTestWrapper.getHexString(i,64)].nNodes
          )
        )
      }
    }

    this.justificationTree = jt2;

    for (let i =0; i< this.entriesToFalsify.length; i += 1){
      await this.justificationTree.insert(
        ethers.utils.hexZeroPad(ethers.utils.hexlify(parseInt(this.entriesToFalsify[i], 10)), 32),
        `0x${"0".repeat(127)}1`
      );
    }
    // Get the JRH
    const jrh = await this.justificationTree.getRootHash();
    // Submit that entry
    const gas = await repCycle.estimate.submitRootHash(hash, this.nReputations, jrh, entryIndex);
    const tx = await repCycle.submitRootHash(hash, this.nReputations, jrh, entryIndex, { gasLimit: `0x${gas.toString(16)}` });
    return tx.wait();
  }
}

export default MaliciousReputationMinerWrongJRHRightNNodes;
