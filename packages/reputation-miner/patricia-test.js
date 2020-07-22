/* globals artifacts */

import path from "path";
import { fromAscii } from "web3-utils";

import TruffleLoader from "./TruffleLoader";
import ReputationMiner from "./ReputationMiner";

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const PatriciaTree = artifacts.require("PatriciaTree");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

contract("Javascript Patricia Tree", accounts => {
  const MAIN_ACCOUNT = accounts[5];
  const OTHER_ACCOUNT = accounts[6];
  const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  let colonyNetwork;
  let jsClient;
  let solClient;
  let realPatriciaTree;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    jsClient = new ReputationMiner({
      loader: contractLoader,
      minerAddress: MAIN_ACCOUNT,
      realProviderPort: REAL_PROVIDER_PORT,
      useJsTree: true
    });
    solClient = new ReputationMiner({
      loader: contractLoader,
      minerAddress: OTHER_ACCOUNT,
      realProviderPort: REAL_PROVIDER_PORT,
      useJsTree: false
    });

    await jsClient.initialise(colonyNetwork.address);
    await solClient.initialise(colonyNetwork.address);

    // Deploy a new tree on our 'real' provider.
    realPatriciaTree = await PatriciaTree.new();
  });

  describe("Javascript Patricia Tree implementation", () => {
    it("should have identical root hashes after one insert", async () => {
      const dog = fromAscii("dog");
      const fido = fromAscii("fido");

      await jsClient.reputationTree.insert(dog, fido);
      await solClient.reputationTree.insert(dog, fido, { gasLimit: 4000000 });
      await realPatriciaTree.insert(dog, fido);

      const jsRoot = await jsClient.reputationTree.getRootHash();
      const solRoot = await solClient.reputationTree.getRootHash();
      const realRoot = await realPatriciaTree.getRootHash();

      assert.equal(jsRoot, solRoot);
      assert.equal(jsRoot, realRoot);
    });

    it("should have identical root hashes after two inserts and one update", async () => {
      const dog = fromAscii("dog");
      const fido = fromAscii("fido");
      const ape = fromAscii("ape");
      const bubbles = fromAscii("bubbles");
      const rover = fromAscii("rover");

      await jsClient.reputationTree.insert(dog, fido);
      await solClient.reputationTree.insert(dog, fido, { gasLimit: 4000000 });
      await realPatriciaTree.insert(dog, fido);

      await jsClient.reputationTree.insert(ape, bubbles);
      await solClient.reputationTree.insert(ape, bubbles, { gasLimit: 4000000 });
      await realPatriciaTree.insert(ape, bubbles);

      await jsClient.reputationTree.insert(dog, rover);
      await solClient.reputationTree.insert(dog, rover, { gasLimit: 4000000 });
      await realPatriciaTree.insert(dog, rover);

      const jsRoot = await jsClient.reputationTree.getRootHash();
      const solRoot = await solClient.reputationTree.getRootHash();
      const realRoot = await realPatriciaTree.getRootHash();

      assert.equal(jsRoot, solRoot);
      assert.equal(jsRoot, realRoot);
    });

    it("should give identical proofs after two inserts and one update", async () => {
      const dog = fromAscii("dog");
      const fido = fromAscii("fido");
      const ape = fromAscii("ape");
      const bubbles = fromAscii("bubbles");
      const rover = fromAscii("rover");

      await jsClient.reputationTree.insert(dog, fido);
      await solClient.reputationTree.insert(dog, fido, { gasLimit: 4000000 });
      await realPatriciaTree.insert(dog, fido);

      await jsClient.reputationTree.insert(ape, bubbles);
      await solClient.reputationTree.insert(ape, bubbles, { gasLimit: 4000000 });
      await realPatriciaTree.insert(ape, bubbles);

      await jsClient.reputationTree.insert(dog, rover);
      await solClient.reputationTree.insert(dog, rover, { gasLimit: 4000000 });
      await realPatriciaTree.insert(dog, rover);

      const [jsMask, jsSiblings] = await jsClient.reputationTree.getProof(dog);
      const [solMask, solSiblings] = await solClient.reputationTree.getProof(dog);
      // This is the difference between what an ethers contract returns (above) and what a
      // truffle contract returns (below)
      const res = await realPatriciaTree.getProof(dog);
      const realMask = res["0"];
      const realSiblings = res["1"];

      assert.equal(jsMask.toString(), solMask.toString());
      assert.equal(realMask.toString(), solMask.toString());
      assert.equal(jsSiblings.length, solSiblings.length);
      for (let i = 0; i < jsSiblings.length; i += 1) {
        assert.equal(jsSiblings[i], solSiblings[i]);
        assert.equal(jsSiblings[i], realSiblings[i]);
      }
    });

    it("should recover identical root hashes from proofs", async () => {
      const dog = fromAscii("dog");
      const fido = fromAscii("fido");
      const ape = fromAscii("ape");
      const bubbles = fromAscii("bubbles");
      const rover = fromAscii("rover");

      await jsClient.reputationTree.insert(dog, fido);
      await solClient.reputationTree.insert(dog, fido, { gasLimit: 4000000 });
      await realPatriciaTree.insert(dog, fido);

      await jsClient.reputationTree.insert(ape, bubbles);
      await solClient.reputationTree.insert(ape, bubbles, { gasLimit: 4000000 });
      await realPatriciaTree.insert(ape, bubbles);

      await jsClient.reputationTree.insert(dog, rover);
      await solClient.reputationTree.insert(dog, rover, { gasLimit: 4000000 });
      await realPatriciaTree.insert(dog, rover);

      const [jsMask, jsSiblings] = await jsClient.reputationTree.getProof(dog);
      const [solMask, solSiblings] = await solClient.reputationTree.getProof(dog);
      // This is the difference between what an ethers contract returns (above) and what a
      // truffle contract returns (below)
      const res = await realPatriciaTree.getProof(dog);
      const realMask = res[0];
      const realSiblings = res[1];

      const realRoot = await realPatriciaTree.getImpliedRoot(dog, fido, realMask, realSiblings);
      const jsRoot = await jsClient.reputationTree.getImpliedRoot(dog, fido, jsMask, jsSiblings);
      const solRoot = await solClient.reputationTree.getImpliedRoot(dog, fido, solMask, solSiblings);
      assert.equal(realRoot.toString(), jsRoot.toString());
      assert.equal(solRoot.toString(), jsRoot.toString());
    });
  });
});
