/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";

import { setupENSRegistrar } from "../helpers/upgradable-contracts";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, giveUserCLNYTokensAndStake } from "../helpers/test-data-generator";
import { forwardTime, getActiveRepCycle, advanceMiningCycleNoContest, getValidEntryNumber, checkErrorRevert } from "../helpers/test-helper";

import { MINING_CYCLE_DURATION, DEFAULT_STAKE, SUBMITTER_ONLY_WINDOW } from "../helpers/constants";

const { expect } = chai;
const ENSRegistry = artifacts.require("ENSRegistry");
const ChainId = artifacts.require("ChainId");

chai.use(bnChai(web3.utils.BN));

contract("Contract Storage", (accounts) => {
  const MINER1 = accounts[5];

  let metaColony;
  let clnyToken;
  let colonyNetwork;
  let chainId;

  before(async () => {
    const cid = await ChainId.new();
    chainId = await cid.getChainId();
    chainId = chainId.toNumber();
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    const ensRegistry = await ENSRegistry.new();
    await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  describe("Should respond differently to ENS queries based on the network deployed", () => {
    it("should be able to get the domain name", async () => {
      await metaColony.registerColonyLabel("meta", "", { from: accounts[0] });
      console.log(chainId);
      if (chainId === 1 || chainId === 2656691) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.eth");
      } else if (chainId === 5 || chainId === 2656695) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.test");
      } else if (chainId === 100 || chainId === 265669100) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.colonyxdai");
      } else {
        await checkErrorRevert(colonyNetwork.lookupRegisteredENSDomain.sendTransaction(metaColony.address), "colony-network-unsupported-network");
      }
    });

    it("Reputation mining rewards should come from different places depending on network", async () => {
      await clnyToken.mint(colonyNetwork.address, 100, { from: accounts[11] });
      // Advance two cycles to clear active and inactive state.
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      await metaColony.setReputationMiningCycleReward(100);
      await forwardTime(MINING_CYCLE_DURATION / 2, this);

      const entryNumber = await getValidEntryNumber(colonyNetwork, MINER1, "0x12345678");
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await repCycle.submitRootHash("0x12345678", 10, "0x00", entryNumber, { from: MINER1 });

      const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
      expect(nUniqueSubmittedHashes).to.eq.BN(1);

      await forwardTime(MINING_CYCLE_DURATION / 2 + SUBMITTER_ONLY_WINDOW + 1, this);

      const networkBalanceBefore = await clnyToken.balanceOf(colonyNetwork.address);
      await repCycle.confirmNewHash(0);

      if (chainId === 1 || chainId === 2656691 || chainId === 5 || chainId === 2656695) {
        // tokens should be newly minted, so balance of network doesn't change.
        const networkBalanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
        expect(networkBalanceBefore).to.eq.BN(networkBalanceAfter);
      } else if (chainId === 100 || chainId === 265669100) {
        // tokens should be paid from a pool in network
        const networkBalanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
        expect(networkBalanceBefore.sub(networkBalanceAfter)).to.eq.BN(100);
      } else {
        await checkErrorRevert(colonyNetwork.lookupRegisteredENSDomain.sendTransaction(metaColony.address), "colony-network-unsupported-network");
      }
    });
  });
});
