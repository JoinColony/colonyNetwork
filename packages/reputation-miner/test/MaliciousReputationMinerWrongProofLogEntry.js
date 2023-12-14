/* global BigInt */

const ethers = require("ethers");
const { soliditySha3 } = require("web3-utils");

const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper");

class MaliciousReputationMinerWrongProofLogEntry extends ReputationMinerTestWrapper {
  // This client will supply the wrong log entry as part of its proof
  constructor(opts, amountToFalsify) {
    super(opts);
    this.amountToFalsify = amountToFalsify.toString();
  }

  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);
    const disputeRound = await repCycle.getDisputeRound(round);
    const disputedEntry = disputeRound[index];
    const firstDisagreeIdx = BigInt(disputedEntry.lowerBound);
    const lastAgreeIdx = firstDisagreeIdx.sub(1);
    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx);
    const lastAgreeKey = MaliciousReputationMinerWrongProofLogEntry.getHexString(lastAgreeIdx, 64);
    const firstDisagreeKey = MaliciousReputationMinerWrongProofLogEntry.getHexString(firstDisagreeIdx, 64);

    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(lastAgreeKey);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(firstDisagreeKey);
    let logEntryNumber = BigInt(0);
    if (lastAgreeIdx.gte(this.nReputationsBeforeLatestLog)) {
      logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.sub(this.nReputationsBeforeLatestLog));
    }
    logEntryNumber = logEntryNumber.add(this.amountToFalsify);

    const tx = await repCycle.respondToChallenge(
      [
        round,
        index,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.branchMask,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.nLeaves,
        MaliciousReputationMinerWrongProofLogEntry.getHexString(agreeStateBranchMask),
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.nLeaves,
        MaliciousReputationMinerWrongProofLogEntry.getHexString(disagreeStateBranchMask),
        logEntryNumber,
        "0",
        this.justificationHashes[lastAgreeKey].originReputationProof.branchMask,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.reputation,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.uid,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.reputation,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.uid,
        this.justificationHashes[lastAgreeKey].originReputationProof.reputation,
        this.justificationHashes[lastAgreeKey].originReputationProof.uid,
        this.justificationHashes[lastAgreeKey].childReputationProof.branchMask,
        this.justificationHashes[lastAgreeKey].childReputationProof.reputation,
        this.justificationHashes[lastAgreeKey].childReputationProof.uid,
        "0",
        this.justificationHashes[lastAgreeKey].adjacentReputationProof.branchMask,
        this.justificationHashes[lastAgreeKey].adjacentReputationProof.reputation,
        this.justificationHashes[lastAgreeKey].adjacentReputationProof.uid,
        "0",
        this.justificationHashes[lastAgreeKey].originAdjacentReputationProof.reputation,
        this.justificationHashes[lastAgreeKey].childAdjacentReputationProof.reputation
      ],
      [
        ...ReputationMinerTestWrapper.breakKeyInToElements(reputationKey).map(x => ethers.zeroPadValue(x, 32)),
        soliditySha3(reputationKey),
        soliditySha3(this.justificationHashes[lastAgreeKey].adjacentReputationProof.key),
        soliditySha3(this.justificationHashes[lastAgreeKey].originAdjacentReputationProof.key),
        soliditySha3(this.justificationHashes[lastAgreeKey].childAdjacentReputationProof.key),
      ],
      this.justificationHashes[firstDisagreeKey].justUpdatedProof.siblings,
      agreeStateSiblings,
      disagreeStateSiblings,
      this.justificationHashes[lastAgreeKey].originReputationProof.siblings,
      this.justificationHashes[lastAgreeKey].childReputationProof.siblings,
      this.justificationHashes[lastAgreeKey].adjacentReputationProof.siblings,
      { gasLimit: 4000000 }
    );

    return tx.wait();
  }
}

module.exports = MaliciousReputationMinerWrongProofLogEntry;
