/* globals artifacts */
import chai from "chai";

import { checkErrorRevert, web3GetChainId } from "../helpers/test-helper";
import { setupENSRegistrar } from "../helpers/upgradable-contracts";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken } from "../helpers/test-data-generator";

const { expect } = chai;
const ENSRegistry = artifacts.require("ENSRegistry");

contract("Contract Storage", (accounts) => {
  let metaColony;
  let colonyNetwork;

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    const ensRegistry = await ENSRegistry.new();
    await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  describe("Should respond differently based on the network deployed", () => {
    it("should be able to get the domain name", async () => {
      await metaColony.registerColonyLabel("meta", "", { from: accounts[0] });
      const chainid = await web3GetChainId();
      console.log(chainid);
      if (chainid === 1 || chainid === 2656691) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.eth");
      } else if (chainid === 5 || chainid === 2656691) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.test");
      } else if (chainid === 100 || chainid === 265669100) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.colonyxdai");
      } else {
        await checkErrorRevert(colonyNetwork.lookupRegisteredENSDomain.sendTransaction(metaColony.address), "colony-network-unsupported-network");
      }
    });
  });
});
