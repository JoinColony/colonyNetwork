import { BN } from "bn.js";
import { soliditySha3 } from "web3-utils";
import { ethers } from "ethers";

// //////
// Patricia Tree
// //////////////////
export default class PatriciaTreeBase {
  // Label: { data, length } (data is the path, length says how many bits are used)
  // Edge: { nodeHash, label }
  // Node: [leftEdge, rightEdge] (no actual node)
  constructor() {
    this.tree = {
      root: new BN(0, 16),
      rootEdge: {},
      nodes: new Map()
    };
  }

  // ////////////
  // Public functions
  // //////////////////////

  // Unused _ arg to conform to interace which accepts gas execution options

  // eslint-disable-next-line no-unused-vars
  getRootHash(_ = undefined) {
    return PatriciaTreeBase.bn2hex64(this.tree.root);
  }

  // eslint-disable-next-line no-unused-vars
  insert(key, value, _ = undefined) {
    const label = PatriciaTreeBase.makeLabel(key, 256);
    const valueHash = PatriciaTreeBase.sha3(value);
    let edge = {};
    if (this.tree.root.toString(16) === "0") {
      edge.label = label;
      edge.nodeHash = valueHash;
    } else {
      edge = this.insertAtEdge(this.tree.rootEdge, label, valueHash);
    }
    this.tree.root = PatriciaTreeBase.edgeEncodingHash(edge);
    this.tree.rootEdge = edge;
  }

  // eslint-disable-next-line no-unused-vars
  getProof(key, _ = undefined) {
    if (!(this.tree.root.toString(16) !== "0")) throw "AssertFail"; // eslint-disable-line no-throw-literal
    const siblings = [];

    let label = PatriciaTreeBase.makeLabel(key, 256);
    let edge = this.tree.rootEdge;
    let numSiblings = 0;
    let length = 0;
    let branchMask = new BN(0, 16);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [prefix, suffix] = PatriciaTreeBase.splitCommonPrefix(label, edge.label);

      // I.e. never an unseen branch
      if (!(prefix.length === edge.label.length)) throw "AssertFail"; // eslint-disable-line no-throw-literal
      if (suffix.length === 0) {
        break; // Found it
      }

      length += prefix.length;
      // NOTE: Solidity is branchMask | uint(1) << 255 - length;
      branchMask = branchMask.or(new BN(1, 16).shln(255 - length));
      length += 1;

      const node = this.tree.nodes[edge.nodeHash.toString(16)];
      const [head, tail] = PatriciaTreeBase.chopFirstBit(suffix);

      const sibling = node.children[1 - head];
      siblings[numSiblings++] = PatriciaTreeBase.edgeEncodingHash(sibling); // eslint-disable-line no-plusplus

      edge = node.children[head];
      label = tail;
    }
    branchMask = ethers.utils.bigNumberify(branchMask.toString());
    return [branchMask, siblings.map(s => PatriciaTreeBase.bn2hex64(s))];
  }

  // This function could be static, but I am deliberately making it not so that the ganache-based patricia trees in
  // the mining client can continue to be a drop-in replacement for the javascript ones.
  // eslint-disable-next-line class-methods-use-this
  getImpliedRoot(key, value, _branchMask, siblings) {
    let branchMask = new BN(_branchMask.toString());
    let k = PatriciaTreeBase.makeLabel(key, 256);
    const valueHash = PatriciaTreeBase.sha3(value);
    const e = {};
    e.nodeHash = valueHash;
    const edgeHashes = [];

    for (let i = 0; i < siblings.length; i += 1) {
      const bitSet = branchMask.zeroBits();
      branchMask = branchMask.and(new BN(1).shln(bitSet).notn(256));
      [k, e.label] = PatriciaTreeBase.splitAt(k, 255 - bitSet);
      const [bit, newLabel] = PatriciaTreeBase.chopFirstBit(e.label);
      e.label = newLabel;
      edgeHashes[bit] = PatriciaTreeBase.edgeEncodingHash(e);
      edgeHashes[1 - bit] = PatriciaTreeBase.sha2bn(siblings[siblings.length - i - 1]);
      e.nodeHash = PatriciaTreeBase.sha2bn(
        soliditySha3(PatriciaTreeBase.bn2hex64(edgeHashes[0]), PatriciaTreeBase.bn2hex64(edgeHashes[1]))
      );
    }
    if (branchMask.zeroBits().toString() === "0") {
      e.label = k;
    } else {
      const bitSet = branchMask.zeroBits();
      [k, e.label] = PatriciaTreeBase.splitAt(k, 255 - bitSet);
      const [, newLabel] = PatriciaTreeBase.chopFirstBit(e.label);
      e.label = newLabel;
    }
    return PatriciaTreeBase.bn2hex64(PatriciaTreeBase.edgeEncodingHash(e));
  }

  // ////////////
  // Private functions
  // /////////////////////
  insertAtEdge(edge, label, valueHash) {
    if (!(label.length >= edge.label.length)) throw "AssertFail"; // eslint-disable-line no-throw-literal
    const [prefix, suffix] = PatriciaTreeBase.splitCommonPrefix(label, edge.label);
    let newNodeHash;
    if (suffix.length === 0) {
      // Full match with the key, update operation
      newNodeHash = valueHash;
    } else if (prefix.length >= edge.label.length) {
      // Partial match, just follow the path
      // NOTE: but how could a common prefix be longer than either label?
      if (!(suffix.length >= 1)) throw "AssertFail"; // eslint-disable-line no-throw-literal
      const node = this.tree.nodes[edge.nodeHash.toString(16)];
      const [head, tail] = PatriciaTreeBase.chopFirstBit(suffix);
      node.children[head] = this.insertAtEdge(node.children[head], tail, valueHash);
      delete this.tree.nodes[edge.nodeHash.toString(16)];
      newNodeHash = this.insertNode(node);
    } else {
      // Mismatch, so let us create a new branch node.
      const [head, tail] = PatriciaTreeBase.chopFirstBit(suffix);
      const branchNode = PatriciaTreeBase.makeNode();
      branchNode.children[head] = PatriciaTreeBase.makeEdge(valueHash, tail);
      branchNode.children[1 - head] = PatriciaTreeBase.makeEdge(edge.nodeHash, PatriciaTreeBase.removePrefix(edge.label, prefix.length + 1));
      newNodeHash = this.insertNode(branchNode);
    }
    return PatriciaTreeBase.makeEdge(newNodeHash, prefix);
  }

  insertNode(node) {
    const nodeHash = PatriciaTreeBase.nodeEncodingHash(node);
    this.tree.nodes[nodeHash.toString(16)] = node;
    return nodeHash;
  }

  // //////////////
  // Static utilities
  // ////////////////////////
  static makeLabel(data, length) {
    return {
      data, // 256-bit path as BigNumber
      length // Number of bits in use
    };
  }

  static makeEdge(nodeHash, label) {
    return {
      nodeHash, // Hash of node value (this is confusing), used as key in tree.nodes
      label // Label object containing path to node
    };
  }

  static makeNode(left = {}, right = {}) {
    return { children: [left, right] }; // Left and right Edges
  }

  static sha2bn(hash) {
    return new BN(hash.slice(2), 16);
  }

  static bn2hex64(bn) {
    const bnStr = bn.toString(16);
    return `0x${"0".repeat(64 - bnStr.length)}${bnStr}`;
  }

  static sha3(value) {
    const hash = PatriciaTreeBase.sha2bn(soliditySha3(value));
    return hash;
  }

  static edgeEncodingHash(edge) {
    const hash = PatriciaTreeBase.sha2bn(
      soliditySha3(
        PatriciaTreeBase.bn2hex64(edge.nodeHash),
        PatriciaTreeBase.bn2hex64(new BN(edge.label.length)),
        PatriciaTreeBase.bn2hex64(edge.label.data)
      )
    );
    return hash;
  }

  static nodeEncodingHash(node) {
    const hash = PatriciaTreeBase.sha2bn(
      soliditySha3(PatriciaTreeBase.edgeEncodingHash(node.children[0]), PatriciaTreeBase.edgeEncodingHash(node.children[1]))
    );
    return hash;
  }

  static splitAt(label, pos) {
    if (!(pos <= label.length && pos <= 256)) throw "AssertFail"; // eslint-disable-line no-throw-literal
    const prefix = {};
    const suffix = {};
    prefix.length = pos;
    if (pos === 0) {
      prefix.data = new BN(0, 16);
    } else {
      prefix.data = label.data.and(new BN(0, 16).notn(256).shln(256 - pos));
      // NOTE: Solidity is bytes32(uint(self.data) & ~uint(1) << 255 - pos);
    }
    suffix.length = label.length - pos;
    suffix.data = label.data.shln(pos).maskn(256); // Maskn to limit word to 256 bits
    return [prefix, suffix];
  }

  static commonPrefix(a, b) {
    const length = a.length < b.length ? a.length : b.length;
    if (length === 0) {
      return 0;
    }
    // uint diff = uint(a.data ^ b.data) & ~uint(0) << 256 - length; // TODO Mask should not be needed.
    const diff = a.data.xor(b.data);
    if (diff.toString(16) === "0") {
      return length;
    }
    // Find highest bit set
    let ret;
    for (let i = 255; i >= 0; i -= 1) {
      if (diff.testn(i)) {
        ret = 255 - i;
        break;
      }
    }
    return Math.min(length, ret);
  }

  static splitCommonPrefix(a, b) {
    return PatriciaTreeBase.splitAt(a, PatriciaTreeBase.commonPrefix(a, b));
  }

  static chopFirstBit(label) {
    if (!(label.length > 0)) throw "AssertFail"; // eslint-disable-line no-throw-literal
    const head = label.data.shrn(255).toNumber();
    const tail = PatriciaTreeBase.makeLabel(label.data.shln(1).maskn(256), label.length - 1);
    return [head, tail];
  }

  static removePrefix(label, prefix) {
    if (!(prefix <= label.length)) throw "AssertFail"; // eslint-disable-line no-throw-literal
    return PatriciaTreeBase.makeLabel(label.data.shln(prefix).maskn(256), label.length - prefix);
  }
}
