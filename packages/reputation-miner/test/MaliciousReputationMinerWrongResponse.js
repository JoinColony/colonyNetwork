import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";
import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMinerWrongResponse extends ReputationMinerTestWrapper {
  // Only difference between this and the 'real' client should be that it adds some extra
  // reputation to one entry being parsed.
  constructor(opts, responseToFalsify, responseValue) {
    super(opts);
    this.responseToFalsify = responseToFalsify;
    this.responseValue = responseValue;
  }

  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const repCycle = await this.getActiveRepCycle();
    const disputeRound = await repCycle.getDisputeRound(round);
    const disputedEntry = disputeRound[index];

    // console.log(disputedEntry);
    let firstDisagreeIdx = ethers.utils.bigNumberify(disputedEntry.lowerBound);
    let lastAgreeIdx = firstDisagreeIdx.sub(1);
    // If this is called before the binary search has finished, these would be -1 and 0, respectively, which will throw errors
    // when we try and pass -ve hex values. Instead, set them to values that will allow us to send a tx that will fail.

    lastAgreeIdx = lastAgreeIdx.lt(0) ? ethers.constants.Zero : lastAgreeIdx;
    firstDisagreeIdx = firstDisagreeIdx.lt(1) ? ethers.constants.One : firstDisagreeIdx;

    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx);
    const lastAgreeKey = ReputationMinerTestWrapper.getHexString(lastAgreeIdx, 64);
    const firstDisagreeKey = ReputationMinerTestWrapper.getHexString(firstDisagreeIdx, 64);

    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(lastAgreeKey);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(firstDisagreeKey);
    let logEntryNumber = ethers.constants.Zero;
    if (lastAgreeIdx.gte(this.nReputationsBeforeLatestLog)) {
      logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.sub(this.nReputationsBeforeLatestLog));
    }
    const lastAgreeJustifications = this.justificationHashes[lastAgreeKey];
    const firstDisagreeJustifications = this.justificationHashes[firstDisagreeKey];

    if (this.justificationHashes[lastAgreeKey].originAdjacentReputationProof.key !== "0x00") {
      // We generated the origin-adjacent reputation proof. We replace the origin proof with the originAdjacentReputationProof
      lastAgreeJustifications.originReputationProof.uid = lastAgreeJustifications.originAdjacentReputationProof.uid;
      lastAgreeJustifications.originReputationProof.branchMask = lastAgreeJustifications.originAdjacentReputationProof.branchMask;
      lastAgreeJustifications.originReputationProof.siblings = lastAgreeJustifications.originAdjacentReputationProof.siblings;
    }

    if (this.justificationHashes[lastAgreeKey].childAdjacentReputationProof.key !== "0x00") {
      // We generated the child-adjacent reputation proof. We replace the child proof with the childAdjacentReputationProof
      lastAgreeJustifications.childReputationProof.uid = lastAgreeJustifications.childAdjacentReputationProof.uid;
      lastAgreeJustifications.childReputationProof.branchMask = lastAgreeJustifications.childAdjacentReputationProof.branchMask;
      lastAgreeJustifications.childReputationProof.siblings = lastAgreeJustifications.childAdjacentReputationProof.siblings;
    }

    const tx = await repCycle.respondToChallenge(
      [
        this.responseToFalsify === 0 ? this.responseValue : round,
        this.responseToFalsify === 1 ? this.responseValue : index,
        this.responseToFalsify === 2 ? this.responseValue : firstDisagreeJustifications.justUpdatedProof.branchMask,
        this.responseToFalsify === 3 ? this.responseValue : lastAgreeJustifications.nextUpdateProof.nNodes,
        this.responseToFalsify === 4 ? this.responseValue : ReputationMinerTestWrapper.getHexString(agreeStateBranchMask),
        this.responseToFalsify === 5 ? this.responseValue : firstDisagreeJustifications.justUpdatedProof.nNodes,
        this.responseToFalsify === 6 ? this.responseValue : ReputationMinerTestWrapper.getHexString(disagreeStateBranchMask),
        this.responseToFalsify === 7 ? this.responseValue : lastAgreeJustifications.newestReputationProof.branchMask,
        this.responseToFalsify === 8 ? this.responseValue : logEntryNumber,
        this.responseToFalsify === 9 ? this.responseValue : "0",
        this.responseToFalsify === 10 ? this.responseValue : lastAgreeJustifications.originReputationProof.branchMask,
        this.responseToFalsify === 11 ? this.responseValue : lastAgreeJustifications.nextUpdateProof.reputation,
        this.responseToFalsify === 12 ? this.responseValue : lastAgreeJustifications.nextUpdateProof.uid,
        this.responseToFalsify === 13 ? this.responseValue : firstDisagreeJustifications.justUpdatedProof.reputation,
        this.responseToFalsify === 14 ? this.responseValue : firstDisagreeJustifications.justUpdatedProof.uid,
        this.responseToFalsify === 15 ? this.responseValue : lastAgreeJustifications.newestReputationProof.reputation,
        this.responseToFalsify === 16 ? this.responseValue : lastAgreeJustifications.newestReputationProof.uid,
        this.responseToFalsify === 17 ? this.responseValue : lastAgreeJustifications.originReputationProof.reputation,
        this.responseToFalsify === 18 ? this.responseValue : lastAgreeJustifications.originReputationProof.uid,
        this.responseToFalsify === 19 ? this.responseValue : lastAgreeJustifications.childReputationProof.branchMask,
        this.responseToFalsify === 20 ? this.responseValue : lastAgreeJustifications.childReputationProof.reputation,
        this.responseToFalsify === 21 ? this.responseValue : lastAgreeJustifications.childReputationProof.uid,
        this.responseToFalsify === 22 ? this.responseValue : "0",
        this.responseToFalsify === 23 ? this.responseValue : lastAgreeJustifications.adjacentReputationProof.branchMask,
        this.responseToFalsify === 24 ? this.responseValue : lastAgreeJustifications.adjacentReputationProof.reputation,
        this.responseToFalsify === 25 ? this.responseValue : lastAgreeJustifications.adjacentReputationProof.uid,
        this.responseToFalsify === 26 ? this.responseValue : "0",
        this.responseToFalsify === 27 ? this.responseValue : lastAgreeJustifications.originAdjacentReputationProof.reputation,
        this.responseToFalsify === 28 ? this.responseValue : lastAgreeJustifications.childAdjacentReputationProof.reputation
      ],
      [
        this.responseToFalsify === 29 ?
          this.responseValue :
          ethers.utils.hexZeroPad(ReputationMinerTestWrapper.breakKeyInToElements(reputationKey)[0], 32),
        this.responseToFalsify === 30 ?
          this.responseValue :
          ethers.utils.hexZeroPad(ReputationMinerTestWrapper.breakKeyInToElements(reputationKey)[1], 32),
        this.responseToFalsify === 31 ?
          this.responseValue :
          ethers.utils.hexZeroPad(ReputationMinerTestWrapper.breakKeyInToElements(reputationKey)[2], 32),
        this.responseToFalsify === 32 ?
          this.responseValue :
            soliditySha3(reputationKey),
        this.responseToFalsify === 33 ?
          this.responseValue :
            soliditySha3(lastAgreeJustifications.newestReputationProof.key),
        this.responseToFalsify === 34 ?
          this.responseValue :
            soliditySha3(lastAgreeJustifications.adjacentReputationProof.key),
        this.responseToFalsify === 35 ?
          this.responseValue :
          soliditySha3(lastAgreeJustifications.originAdjacentReputationProof.key),
        this.responseToFalsify === 36 ?
          this.responseValue :
          soliditySha3(lastAgreeJustifications.childAdjacentReputationProof.key)
      ],
      this.responseToFalsify === 37 ? this.responseValue : firstDisagreeJustifications.justUpdatedProof.siblings,
      this.responseToFalsify === 38 ? this.responseValue : agreeStateSiblings,
      this.responseToFalsify === 39 ? this.responseValue : disagreeStateSiblings,
      this.responseToFalsify === 40 ? this.responseValue : lastAgreeJustifications.newestReputationProof.siblings,
      this.responseToFalsify === 41 ? this.responseValue : lastAgreeJustifications.originReputationProof.siblings,
      this.responseToFalsify === 42 ? this.responseValue : lastAgreeJustifications.childReputationProof.siblings,
      this.responseToFalsify === 43 ? this.responseValue : lastAgreeJustifications.adjacentReputationProof.siblings,
      { gasLimit: 4000000 }
    );
    return tx.wait();
  }

}

export default MaliciousReputationMinerWrongResponse;
