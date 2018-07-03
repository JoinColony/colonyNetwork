/* globals artifacts */

import path from "path";
import web3Utils from "web3-utils";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";
import ReputationMiner from "./ReputationMiner";

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

contract("Javascript Patricia Tree", accounts => {
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const REAL_PROVIDER_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

  let colonyNetwork;
  let jsClient;
  let solClient;

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
  });

  describe("Javascript Patricia Tree implementation", () => {
    it("should have identical root hashes after one insert", async () => {
      const dog = web3Utils.fromAscii("dog");
      const fido = web3Utils.fromAscii("fido");

      await jsClient.reputationTree.insert(dog, fido);
      await solClient.reputationTree.insert(dog, fido);

      const jsRoot = await jsClient.reputationTree.getRootHash();
      const solRoot = await solClient.reputationTree.getRootHash();
      assert.equal(jsRoot, solRoot);
    });

    it("should have identical root hashes after two inserts and one update", async () => {
      const dog = web3Utils.fromAscii("dog");
      const fido = web3Utils.fromAscii("fido");
      const ape = web3Utils.fromAscii("ape");
      const bubbles = web3Utils.fromAscii("bubbles");
      const rover = web3Utils.fromAscii("rover");

      await jsClient.reputationTree.insert(dog, fido);
      await solClient.reputationTree.insert(dog, fido);

      await jsClient.reputationTree.insert(ape, bubbles);
      await solClient.reputationTree.insert(ape, bubbles);

      await jsClient.reputationTree.insert(dog, rover);
      await solClient.reputationTree.insert(dog, rover);

      const jsRoot = await jsClient.reputationTree.getRootHash();
      const solRoot = await solClient.reputationTree.getRootHash();
      assert.equal(jsRoot, solRoot);
    });

    it("should give identical proofs after two inserts and one update", async () => {
      const dog = web3Utils.fromAscii("dog");
      const fido = web3Utils.fromAscii("fido");
      const ape = web3Utils.fromAscii("ape");
      const bubbles = web3Utils.fromAscii("bubbles");
      const rover = web3Utils.fromAscii("rover");

      await jsClient.reputationTree.insert(dog, fido);
      await solClient.reputationTree.insert(dog, fido);

      await jsClient.reputationTree.insert(ape, bubbles);
      await solClient.reputationTree.insert(ape, bubbles);

      await jsClient.reputationTree.insert(dog, rover);
      await solClient.reputationTree.insert(dog, rover);

      const [jsMask, jsSiblings] = await jsClient.reputationTree.getProof(dog);
      const [solMask, solSiblings] = await solClient.reputationTree.getProof(dog);

      assert.equal(jsMask.toString(), solMask.toString());
      assert.equal(jsSiblings.length, solSiblings.length);
      for (let i = 0; i < jsSiblings.length; i += 1) {
        assert.equal(jsSiblings[i], solSiblings[i]);
      }
    });
  });
});
