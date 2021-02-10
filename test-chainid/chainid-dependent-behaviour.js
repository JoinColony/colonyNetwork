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

const MAINNET = 1;
const FORKED_MAINNET = 2656691;
const GOERLI = 5;
const FORKED_GOERLI = 2656695;
const XDAI = 100;
const FORKED_XDAI = 265669100;

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

  describe("Should behave differently based on the network deployed to", () => {
    it("should be able to get the domain name", async () => {
      await metaColony.registerColonyLabel("meta", "", { from: accounts[0] });
      if (chainId === MAINNET || chainId === FORKED_MAINNET) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.eth");
      } else if (chainId === GOERLI || chainId === FORKED_GOERLI) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.test");
      } else if (chainId === XDAI || chainId === FORKED_XDAI) {
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

      if (chainId === XDAI || chainId === FORKED_XDAI) {
        // tokens should be paid from the network balance
        const networkBalanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
        expect(networkBalanceBefore.sub(networkBalanceAfter)).to.eq.BN(100);
      } else {
        // tokens should be newly minted, so balance of network doesn't change.
        const networkBalanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
        expect(networkBalanceBefore).to.eq.BN(networkBalanceAfter);
      }
    });
  });
});
