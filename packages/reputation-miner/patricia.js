const PatriciaTreeBase = require("./patricia-base");

class PatriciaTree extends PatriciaTreeBase {
  insert(key, value, _ = undefined) {
    return super.insert(PatriciaTreeBase.sha3(key), value, _);
  }

  // eslint-disable-next-line no-unused-vars
  getProof(key, _ = undefined) {
    return super.getProof(PatriciaTreeBase.sha3(key), _);
  }

  getImpliedRoot(key, value, _branchMask, siblings) {
    return super.getImpliedRoot(PatriciaTreeBase.sha3(key), value, _branchMask, siblings);
  }
}

module.exports = PatriciaTree;
