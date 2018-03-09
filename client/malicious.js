import ReputationMiningClient from "./main";

export default class MaliciousReputationMiningClient extends ReputationMiningClient {
  // Only difference between this and the 'real' client should be that it adds some extra
  // reputation to the fourth entry being parsed.
  constructor(minerAddress, entryToFalsify, amountToFalsify) {
    super(minerAddress);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
  }

  getScore(i, logEntry) {
    let score = logEntry[1];
    if (i.toString() === this.entryToFalsify) {
      score = score.add(this.amountToFalsify);
    }
    return score;
  }
}
