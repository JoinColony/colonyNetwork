/* eslint-disable class-methods-use-this */

import BN from "bn.js";
import PatriciaTreeBase from "./patricia-base";

class PatriciaNoOp extends PatriciaTreeBase {

  insert() {
    return { wait: () => {} };
  }

  getRootHash() {
    return "0x";
  }

  getImpliedRoot() {
    return "0x";
  }

  getProof(): [BN, []] {
    return [new BN(0), []];
  }
}

export default PatriciaNoOp;