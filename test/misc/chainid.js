/* globals artifacts */
const chai = require("chai");
const bnChai = require("bn-chai");
const BN = require("bn.js");
const ethers = require("ethers");

const { setupENSRegistrar } = require("../../helpers/upgradable-contracts");
const {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokens,
  giveUserCLNYTokensAndStake,
  unlockCLNYToken,
} = require("../../helpers/test-data-generator");
const {
  forwardTime,
  getActiveRepCycle,
  advanceMiningCycleNoContest,
  checkErrorRevert,
  expectEvent,
  expectNoEvent,
  getTokenArgs,
  isMainnet,
  isXdai,
  getChainId,
} = require("../../helpers/test-helper");
const { MINING_CYCLE_DURATION, MIN_STAKE, CHALLENGE_RESPONSE_WINDOW_DURATION, WAD, DEFAULT_STAKE } = require("../../helpers/constants");

const { expect } = chai;
const ENSRegistry = artifacts.require("ENSRegistry");
const DutchAuction = artifacts.require("DutchAuction");
const Token = artifacts.require("Token");

chai.use(bnChai(web3.utils.BN));

const GOERLI = 5;
const FORKED_GOERLI = 2656695;

contract("Contract Storage", (accounts) => {
  const MINER1 = accounts[5];
  const MINER2 = accounts[6];
  const MINER3 = accounts[7];

  let metaColony;
  let clnyToken;
  let colonyNetwork;
  let chainId;

  before(async () => {
    chainId = await getChainId();
    console.log(`chainId: ${chainId}`); // eslint-disable-line no-console
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    const ensRegistry = await ENSRegistry.new();
    await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER3, DEFAULT_STAKE);

    await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);
  });

  describe("Should behave appropriately with old per-chain behaviours", () => {
    it("should be able to get the domain name", async () => {
      await metaColony.registerColonyLabel("meta", "", { from: accounts[0] });
      if (await isMainnet()) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.eth");
      } else if (chainId === GOERLI || chainId === FORKED_GOERLI) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.test");
      } else if (await isXdai()) {
        const name = await colonyNetwork.lookupRegisteredENSDomain(metaColony.address);
        expect(name).to.equal("meta.colony.joincolony.colonyxdai");
      } else {
        await checkErrorRevert(colonyNetwork.lookupRegisteredENSDomain.sendTransaction(metaColony.address), "colony-network-unsupported-network");
      }
    });

    it("should not make 0-value transfers to 'burn' unneeded mining rewards on xdai", async function () {
      await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, MIN_STAKE);
      await advanceMiningCycleNoContest({ colonyNetwork, test: this });

      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);

      await repCycle.getNSubmissionsForHash("0x12345678", 10, "0x00");
      await repCycle.submitRootHash("0x12345678", 10, "0x00", 1, { from: MINER1 });

      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      const tx = await repCycle.confirmNewHash(0, { from: MINER1 });
      await expectNoEvent(tx, "Transfer(address indexed,address indexed,uint256)", [colonyNetwork.address, metaColony.address, 0]);
      await expectNoEvent(tx, "Burn(address indexed,uint256)", [colonyNetwork.address, 0]);
    });

    it("should handle tokens appropriately if auction is initialised for the CLNY token", async () => {
      await giveUserCLNYTokens(colonyNetwork, colonyNetwork.address, WAD);
      const supplyBefore = await clnyToken.totalSupply();
      const balanceBefore = await clnyToken.balanceOf(colonyNetwork.address);
      const tx = await colonyNetwork.startTokenAuction(clnyToken.address);

      const supplyAfter = await clnyToken.totalSupply();
      const balanceAfter = await clnyToken.balanceOf(colonyNetwork.address);

      if (await isMainnet()) {
        // tokens should be burned.
        expect(supplyBefore.sub(supplyAfter)).to.eq.BN(balanceBefore);
        await expectEvent(tx, "Burn(address indexed,uint256)", [colonyNetwork.address, WAD]);
        expect(balanceAfter).to.be.zero;
        expect(supplyBefore.sub(balanceBefore)).to.eq.BN(supplyAfter);
      } else {
        // tokens should be transferred to metacolony
        expect(supplyBefore).to.eq.BN(supplyAfter);
        await expectEvent(tx, "Transfer(address indexed,address indexed,uint256)", [colonyNetwork.address, metaColony.address, WAD]);
      }
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
      if (await isMainnet()) {
        // tokens should be burned.
        expect(supplyBefore.sub(supplyAfter)).to.eq.BN(balanceBefore);
        await expectEvent(tx, "Burn(address indexed,uint256)", [tokenAuction.address, receivedTotal]);
      } else {
        // tokens should be transferred to metacolony
        expect(supplyBefore).to.eq.BN(supplyAfter);
        await expectEvent(tx, "Transfer(address indexed,address indexed,uint256)", [tokenAuction.address, metaColony.address, receivedTotal]);
      }
    });
  });
});
