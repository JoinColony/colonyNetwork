const BN = require("bn.js");
const web3Utils = require("web3-utils");
const ethers = require("ethers");

// //////////////
// Internal utilities
// ////////////////////////
function makeLabel(data, length) {
  return {
    data, // 256-bit path as BigNumber
    length // Number of bits in use
  };
}

function makeEdge(nodeHash, label) {
  return {
    nodeHash, // Hash of node value (this is confusing), used as key in tree.nodes
    label // Label object containing path to node
  };
}

function makeNode(left = {}, right = {}) {
  return { children: [left, right] }; // Left and right Edges
}

function sha2bn(hash) {
  return new BN(hash.slice(2), 16);
}

function bn2hex64(bn) {
  const bnStr = bn.toString(16);
  return `0x${"0".repeat(64 - bnStr.length)}${bnStr}`;
}

function sha3(value) {
  const hash = sha2bn(web3Utils.soliditySha3(value));
  return hash;
}

function edgeEncodingHash(edge) {
  const hash = sha2bn(web3Utils.soliditySha3(bn2hex64(edge.nodeHash), bn2hex64(new BN(edge.label.length)), bn2hex64(edge.label.data)));
  return hash;
}

function nodeEncodingHash(node) {
  const hash = sha2bn(web3Utils.soliditySha3(edgeEncodingHash(node.children[0]), edgeEncodingHash(node.children[1])));
  return hash;
}

function splitAt(label, pos) {
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

function commonPrefix(a, b) {
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

function splitCommonPrefix(a, b) {
  return splitAt(a, commonPrefix(a, b));
}

function chopFirstBit(label) {
  if (!(label.length > 0)) throw "AssertFail"; // eslint-disable-line no-throw-literal
  const head = label.data.shrn(255).toNumber();
  const tail = makeLabel(label.data.shln(1).maskn(256), label.length - 1);
  return [head, tail];
}

function removePrefix(label, prefix) {
  if (!(prefix <= label.length)) throw "AssertFail"; // eslint-disable-line no-throw-literal
  return makeLabel(label.data.shln(prefix).maskn(256), label.length - prefix);
}

// //////
// Patricia Tree
// //////////////////
exports.PatriciaTree = function PatriciaTree() {
  // Label: { data, length } (data is the path, length says how many bits are used)
  // Edge: { nodeHash, label }
  // Node: [leftEdge, rightEdge] (no actual node)

  this.tree = {
    root: new BN(0, 16),
    rootEdge: {},
    nodes: new Map()
  };

  // ////////////
  // Public functions
  // //////////////////////

  // Unused _ arg to conform to interace which accepts gas execution options

  // eslint-disable-next-line no-unused-vars
  this.getRootHash = function getRootHash(_ = undefined) {
    return bn2hex64(this.tree.root);
  };

  // eslint-disable-next-line no-unused-vars
  this.insert = function insert(key, value, _ = undefined) {
    const label = makeLabel(sha2bn(key), 256);
    const valueHash = sha3(value);
    let edge = {};
    if (this.tree.root.toString(16) === "0") {
      edge.label = label;
      edge.nodeHash = valueHash;
    } else {
      edge = this.insertAtEdge(this.tree.rootEdge, label, valueHash);
    }
    this.tree.root = edgeEncodingHash(edge);
    this.tree.rootEdge = edge;
  };

  // eslint-disable-next-line no-unused-vars
  this.getProof = function getProof(key, _ = undefined) {
    if (!(this.tree.root.toString(16) !== "0")) throw "AssertFail"; // eslint-disable-line no-throw-literal
    const siblings = [];

    let label = makeLabel(sha2bn(key), 256);
    let edge = this.tree.rootEdge;
    let numSiblings = 0;
    let length = 0;
    let branchMask = new BN(0, 16);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [prefix, suffix] = splitCommonPrefix(label, edge.label);

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
      const [head, tail] = chopFirstBit(suffix);

      const sibling = node.children[1 - head];
      siblings[numSiblings++] = edgeEncodingHash(sibling); // eslint-disable-line no-plusplus

      edge = node.children[head];
      label = tail;
    }
    branchMask = ethers.utils.bigNumberify(branchMask.toString());
    return [branchMask, siblings.map(s => bn2hex64(s))];
  };

  this.getImpliedRoot = function getImpliedRoot(key, value, _branchMask, siblings, fullProof = true) {
    let branchMask = new BN(_branchMask.toString());
    let k = makeLabel(sha2bn(key), 256);
    const valueHash = sha3(value);
    const e = {};
    e.nodeHash = valueHash;
    const edgeHashes = [];

    for (let i = 0; branchMask.toString() !== "0"; i += 1) {
      const bitSet = branchMask.zeroBits();
      branchMask = branchMask.and(new BN(1).shln(bitSet).notn(256));
      [k, e.label] = splitAt(k, 255 - bitSet);
      const [bit, newLabel] = chopFirstBit(e.label);
      e.label = newLabel;
      edgeHashes[bit] = edgeEncodingHash(e);
      edgeHashes[1 - bit] = sha2bn(siblings[siblings.length - i - 1]);
      e.nodeHash = sha2bn(web3Utils.soliditySha3(bn2hex64(edgeHashes[0]), bn2hex64(edgeHashes[1])));
    }
    if (fullProof) {
      e.label = k;
    }
    return bn2hex64(edgeEncodingHash(e));
  };

  // ////////////
  // Private functions
  // /////////////////////
  this.insertAtEdge = function insertAtEdge(edge, label, valueHash) {
    if (!(label.length >= edge.label.length)) throw "AssertFail"; // eslint-disable-line no-throw-literal
    const [prefix, suffix] = splitCommonPrefix(label, edge.label);
    let newNodeHash;
    if (suffix.length === 0) {
      // Full match with the key, update operation
      newNodeHash = valueHash;
    } else if (prefix.length >= edge.label.length) {
      // Partial match, just follow the path
      // NOTE: but how could a common prefix be longer than either label?
      if (!(suffix.length >= 1)) throw "AssertFail"; // eslint-disable-line no-throw-literal
      const node = this.tree.nodes[edge.nodeHash.toString(16)];
      const [head, tail] = chopFirstBit(suffix);
      node.children[head] = this.insertAtEdge(node.children[head], tail, valueHash);
      delete this.tree.nodes[edge.nodeHash.toString(16)];
      newNodeHash = this.insertNode(node);
    } else {
      // Mismatch, so let us create a new branch node.
      const [head, tail] = chopFirstBit(suffix);
      const branchNode = makeNode();
      branchNode.children[head] = makeEdge(valueHash, tail);
      branchNode.children[1 - head] = makeEdge(edge.nodeHash, removePrefix(edge.label, prefix.length + 1));
      newNodeHash = this.insertNode(branchNode);
    }
    return makeEdge(newNodeHash, prefix);
  };

  this.insertNode = function insertNode(node) {
    const nodeHash = nodeEncodingHash(node);
    this.tree.nodes[nodeHash.toString(16)] = node;
    return nodeHash;
  };
};
