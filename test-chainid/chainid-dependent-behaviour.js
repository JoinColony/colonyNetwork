/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import BN from "bn.js";

import { setupENSRegistrar } from "../helpers/upgradable-contracts";
import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokens,
  giveUserCLNYTokensAndStake,
  unlockCLNYToken,
} from "../helpers/test-data-generator";
import {
  forwardTime,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  getValidEntryNumber,
  checkErrorRevert,
  expectEvent,
  expectNoEvent,
  getTokenArgs,
} from "../helpers/test-helper";
import { MINING_CYCLE_DURATION, DEFAULT_STAKE, SUBMITTER_ONLY_WINDOW, MIN_STAKE, MINING_CYCLE_TIMEOUT } from "../helpers/constants";

const { expect } = chai;
const ENSRegistry = artifacts.require("ENSRegistry");
const MultiChain = artifacts.require("MultiChain");
const DutchAuction = artifacts.require("DutchAuction");
const Token = artifacts.require("Token");

chai.use(bnChai(web3.utils.BN));

const MAINNET = 1;
const FORKED_MAINNET = 2656691;
const GOERLI = 5;
const FORKED_GOERLI = 2656695;
const XDAI = 100;
const FORKED_XDAI = 265669100;

contract("Contract Storage", (accounts) => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];
  const MINER3 = accounts[7];

  let metaColony;
  let clnyToken;
  let colonyNetwork;
  let chainId;

  before(async () => {
    const multiChain = await MultiChain.new();
    chainId = await multiChain.getChainId();
    chainId = chainId.toNumber();
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    const ensRegistry = await ENSRegistry.new();
    await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER3, DEFAULT_STAKE);

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

      const MINER1HASH = "0x01";
      const MINER2HASH = "0x02";
      const MINER3HASH = "0x03";

      const entryNumber1 = await getValidEntryNumber(colonyNetwork, MINER1, MINER1HASH);
      const entryNumber2 = await getValidEntryNumber(colonyNetwork, MINER2, MINER2HASH);
      const entryNumber3 = await getValidEntryNumber(colonyNetwork, MINER3, MINER3HASH);
      const repCycle = await getActiveRepCycle(colonyNetwork);

      await repCycle.submitRootHash(MINER1HASH, 10, "0x00", entryNumber1, { from: MINER1 });
      await repCycle.submitRootHash(MINER2HASH, 10, "0x00", entryNumber2, { from: MINER2 });
      await repCycle.submitRootHash(MINER3HASH, 10, "0x00", entryNumber3, { from: MINER3 });

      const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
      expect(nUniqueSubmittedHashes).to.eq.BN(3);

      const rewardSize = await repCycle.getDisputeRewardSize();

      await forwardTime(MINING_CYCLE_DURATION / 2 + SUBMITTER_ONLY_WINDOW + MINING_CYCLE_TIMEOUT + 1, this);

      await repCycle.invalidateHash(0, 0);
      await repCycle.invalidateHash(0, 3);

      await forwardTime(SUBMITTER_ONLY_WINDOW + 1, this);
      const networkBalanceBefore = await clnyToken.balanceOf(colonyNetwork.address);
      const tx = await repCycle.confirmNewHash(1);

      if (chainId === XDAI || chainId === FORKED_XDAI) {
        // tokens should be paid from the network balance
        const networkBalanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
        expect(networkBalanceBefore.sub(networkBalanceAfter)).to.eq.BN(100);
      } else {
        // tokens should be newly minted, so balance of network doesn't change.
        const networkBalanceAfter = await clnyToken.balanceOf(colonyNetwork.address);
        expect(networkBalanceBefore).to.eq.BN(networkBalanceAfter);
      }

      // Two people are getting MIN_STAKE slashed, from which two rewards are paid out.
      // We expect the remaineder to be burned
      const expectedBurned = MIN_STAKE.muln(2).sub(rewardSize.muln(2));
      // Unneeded rewards should be dealt with differently as well.

      if (chainId === XDAI || chainId === FORKED_XDAI) {
        // tokens should be transferred to metacolony
        await expectEvent(tx, "Transfer(address indexed,address indexed,uint256)", [colonyNetwork.address, metaColony.address, expectedBurned]);
      } else {
        // tokens should be burned.
        await expectEvent(tx, "Burn(address indexed,uint256)", [colonyNetwork.address, expectedBurned]);
      }
    });

    it("should not make 0-value transfers to 'burn' unneeded rewards on xdai", async () => {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, MIN_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      await repCycle.getNSubmissionsForHash("0x12345678", 10, "0x00");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 1, { from: MINER1 });

      await forwardTime(SUBMITTER_ONLY_WINDOW + 1, this);
      const tx = await repCycle.confirmNewHash(0);
      await expectNoEvent(tx, "Transfer(address indexed,address indexed,uint256)", [colonyNetwork.address, metaColony.address, 0]);
      await expectNoEvent(tx, "Burn(address indexed,uint256)", [colonyNetwork.address, 0]);
    });

    it("CLNY raised from auctions is dealt with appropriately", async () => {
      const quantity = new BN(10).pow(new BN(18)).muln(3);
      const clnyNeededForMaxPriceAuctionSellout = new BN(10).pow(new BN(36)).muln(3); // eslint-disable-line prettier/prettier
      const args = getTokenArgs();

      const token = await Token.new(...args);
      await token.unlock();
      await unlockCLNYToken(metaColony);
      await token.mint(colonyNetwork.address, quantity);
      const { logs } = await colonyNetwork.startTokenAuction(token.address);
      const auctionAddress = logs[0].args.auction;
      const tokenAuction = await DutchAuction.at(auctionAddress);

      await giveUserCLNYTokens(colonyNetwork, accounts[1], clnyNeededForMaxPriceAuctionSellout);
      await clnyToken.approve(tokenAuction.address, clnyNeededForMaxPriceAuctionSellout, { from: accounts[1] });
      await tokenAuction.bid(clnyNeededForMaxPriceAuctionSellout, { from: accounts[1] });

      const balanceBefore = await clnyToken.balanceOf(tokenAuction.address);
      const supplyBefore = await clnyToken.totalSupply();
      const receivedTotal = await tokenAuction.receivedTotal();
      expect(receivedTotal).to.not.be.zero;
      const tx = await tokenAuction.finalize();

      const balanceAfter = await clnyToken.balanceOf(tokenAuction.address);
      expect(balanceAfter).to.be.zero;
      const supplyAfter = await clnyToken.totalSupply();
      if (chainId === XDAI || chainId === FORKED_XDAI) {
        // tokens should be transferred to metacolony
        expect(supplyBefore).to.eq.BN(supplyAfter);
        await expectEvent(tx, "Transfer(address indexed,address indexed,uint256)", [tokenAuction.address, metaColony.address, receivedTotal]);
      } else {
        // tokens should be burned.
        expect(supplyBefore.sub(supplyAfter)).to.eq.BN(balanceBefore);
        await expectEvent(tx, "Burn(address indexed,uint256)", [tokenAuction.address, receivedTotal]);
      }
    });
  });
});
