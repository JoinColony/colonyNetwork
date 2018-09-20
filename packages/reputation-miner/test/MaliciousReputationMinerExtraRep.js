import ReputationMiner from "../ReputationMiner";

class MaliciousReputationMinerExtraRep extends ReputationMiner {
  // Only difference between this and the 'real' client should be that it adds some extra
  // reputation to one entry being parsed.
  constructor(opts, entryToFalsify, amountToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
  }

  getAmount(i, _score) {
    let score = _score;
    if (i.toString() === this.entryToFalsify) {
      score = score.add(this.amountToFalsify);
    }
    return score;
  }
}

export default MaliciousReputationMinerExtraRep;
