import PatriciaTreeBase from "./patricia-base";

export default class PatriciaTreeNoHash extends PatriciaTreeBase {
  insert(key, value, _ = undefined) {
    return super.insert(PatriciaTreeBase.sha2bn(key), value, _);
  }

  getProof(key, _ = undefined) {
    return super.getProof(PatriciaTreeBase.sha2bn(key), _);
  }

  getImpliedRoot(key, value, _branchMask, siblings) {
    return super.getImpliedRoot(PatriciaTreeBase.sha2bn(key), value, _branchMask, siblings);
  }
}
