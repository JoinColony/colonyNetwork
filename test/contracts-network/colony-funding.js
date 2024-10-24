/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const {
  UINT256_MAX,
  WAD,
  MANAGER_PAYOUT,
  EVALUATOR_PAYOUT,
  WORKER_PAYOUT,
  INITIAL_FUNDING,
  SLOT0,
  SLOT1,
  SLOT2,
  ROOT_ROLE,
  ADDRESS_ZERO,
} = require("../../helpers/constants");

const {
  fundColonyWithTokens,
  setupRandomColony,
  makeExpenditure,
  setupFundedExpenditure,
  setupClaimedExpenditure,
} = require("../../helpers/test-data-generator");
const { getTokenArgs, checkErrorRevert, web3GetBalance, removeSubdomainLimit, expectEvent, rolesToBytes32 } = require("../../helpers/test-helper");
const { setupDomainTokenReceiverResolver } = require("../../helpers/upgradable-contracts");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");
const Resolver = artifacts.require("Resolver");
const DomainTokenReceiver = artifacts.require("DomainTokenReceiver");
const ToggleableToken = artifacts.require("ToggleableToken");

contract("Colony Funding", (accounts) => {
  const MANAGER = accounts[0];
  const WORKER = accounts[2];

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;
  let metaColony;

  before(async () => {
    const cnAddress = (await EtherRouter.deployed()).address;
    const etherRouter = await EtherRouter.at(cnAddress);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);

    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
    await otherToken.unlock();
  });

  describe("when receiving tokens", () => {
    it("should not put the tokens straight in to the pot", async () => {
      await otherToken.mint(colony.address, 100);
      let colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      let colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.be.zero;
      expect(colonyRewardPotBalance).to.be.zero;
      await colony.claimColonyFunds(otherToken.address);
      colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      colonyTokenBalance = await otherToken.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(colonyRewardPotBalance).to.eq.BN(1);
    });

    it("should syphon off own tokens in to the reward pot", async () => {
      await fundColonyWithTokens(colony, token, 100);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, token.address);
      const colonyPotBalance = await colony.getFundingPotBalance(1, token.address);
      const colonyTokenBalance = await token.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(colonyRewardPotBalance).to.eq.BN(1);
    });

    it("should let tokens be moved between funding pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      const expenditureId = await makeExpenditure({ colony });
      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 51, otherToken.address);
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(48);
      expect(pot2Balance).to.eq.BN(51);
    });

    it("when moving tokens between pots, should respect permission inheritance", async () => {
      await removeSubdomainLimit(colonyNetwork); // Temporary for tests until we allow subdomain depth > 1
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, 0, 2);
      const domain1 = await colony.getDomain(1);
      const domain2 = await colony.getDomain(2);
      const domain3 = await colony.getDomain(3);

      // Move funds from 1 to 2
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, 0, domain1.fundingPotId, domain2.fundingPotId, 50, otherToken.address);

      // From 2 to 3 using same permission (i.e. 'acting in' domain 1)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, 0, 1, domain2.fundingPotId, domain3.fundingPotId, 10, otherToken.address);

      // From 2 to 3 leveraging permissions slightly differently (i.e. 'acting in' domain 2)
      await colony.moveFundsBetweenPots(1, 0, 2, UINT256_MAX, 0, domain2.fundingPotId, domain3.fundingPotId, 10, otherToken.address);
    });

    it("should not let tokens be moved between the same pot", async () => {
      await fundColonyWithTokens(colony, otherToken, 1);
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, 1, 1, otherToken.address),
        "colony-funding-cannot-move-funds-between-the-same-pot",
      );
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(1);
    });

    it("should not let tokens be moved from the pot for payouts to token holders", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      const expenditureId = await makeExpenditure({ colony });
      const expenditure = await colony.getExpenditure(expenditureId);

      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 0, expenditure.fundingPotId, 1, otherToken.address),
        "colony-funding-cannot-move-funds-from-rewards-pot",
      );
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(pot2Balance).to.be.zero;
      expect(colonyRewardPotBalance).to.eq.BN(1);
    });

    it("should not let tokens be moved by non-admins", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      const expenditureId = await makeExpenditure({ colony });
      const expenditure = await colony.getExpenditure(expenditureId);

      const moveFundsBetweenPots = colony.methods["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"];
      await checkErrorRevert(
        moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 51, otherToken.address, { from: WORKER }),
        "ds-auth-unauthorized",
      );

      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(99);
      expect(pot2Balance).to.be.zero;
    });

    it("should not allow more tokens to leave a pot than the pot has (even if the colony has that many)", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, 1, 2, 40, otherToken.address);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 0, 1, 2, 3, 50, otherToken.address), "Panic: Arithmetic overflow");

      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      const pot1Balance = await colony.getFundingPotBalance(1, otherToken.address);
      const pot2Balance = await colony.getFundingPotBalance(2, otherToken.address);
      const pot3Balance = await colony.getFundingPotBalance(3, otherToken.address);
      expect(colonyTokenBalance).to.eq.BN(100);
      expect(pot1Balance).to.eq.BN(59);
      expect(pot2Balance).to.eq.BN(40);
      expect(pot3Balance).to.be.zero;
    });

    it("should correctly track if we are able to make token payouts", async () => {
      // There are eighteen scenarios to test here.
      // FundingPot was below payout, now equal (1 + 2)
      // FundingPot was below payout, now above (3 + 4)
      // FundingPot was equal to payout, now above (5 + 6)
      // FundingPot was equal to payout, now below (7 + 8)
      // FundingPot was above payout, now below (9 + 10)
      // FundingPot was above payout, now equal (11 + 12)
      // FundingPot was below payout, still below (13 + 14)
      // FundingPot was above payout, still above (15 + 16)
      // FundingPot was equal to payout, still equal (17 + 18)
      //
      // And, for each of these, we have to check that the update is correctly tracked when
      // the pot changes (odd numbers), and when the payout changes (even numbers)
      //
      // NB We do not need to be this exhaustive when using ether, because this test is testing
      // that updatePayoutsWeCannotMakeAfterPotChange and updatePayoutsWeCannotMakeAfterBudgetChange
      // are correct, which are used in both cases.
      //
      // NB Also that since we can no longer reduce the pot to below the budget,
      // scenarios 7, 9, 13 should revert.
      await fundColonyWithTokens(colony, otherToken, 100);
      const expenditureId = await makeExpenditure({ colony });
      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.setExpenditureRecipients(expenditureId, [SLOT0, SLOT1], [MANAGER, WORKER]);

      // FundingPot 0, Payout 0
      // FundingPot was equal to payout, transition to pot being equal by changing payout (18)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [0]);
      let fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 0, Payout 0
      // FundingPot was equal to payout, transition to pot being equal by changing pot (17)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 0, otherToken.address);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 0, Payout 0
      // FundingPot was equal to payout, transition to pot being lower by increasing payout (8)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [40]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // FundingPot Balance: 0, Payout: 40
      // FundingPot was below payout, transition to being equal by increasing pot (1)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 40, otherToken.address);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot Balance: 40, Payout 40
      // FundingPot was equal to payout, transition to being above by increasing pot (5)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 40, otherToken.address);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot Balance: 80, Payout 40
      // FundingPot was above payout, transition to being equal by increasing payout (12)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [80]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 80, Payout 80
      // FundingPot was equal to payout, transition to being above by decreasing payout (6)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [40]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 80, Payout 40
      // FundingPot was above payout, transition to being equal by decreasing pot (11)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 40, otherToken.address);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 40, Payout 40
      // FundingPot was equal to payout, transition to pot being below payout by changing pot (7)
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 20, otherToken.address),
        "colony-funding-expenditure-bad-state",
      );

      // Remove 20 from pot
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [20]);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 20, otherToken.address);
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [40]);

      // FundingPot 20, Payout 40
      // FundingPot was below payout, change to being above by changing pot (3)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 60, otherToken.address);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 80, Payout 40
      // FundingPot was above payout, change to being below by changing pot (9)
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 60, otherToken.address),
        "colony-funding-expenditure-bad-state",
      );

      // Remove 60 from pot
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [20]);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 60, otherToken.address);
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [40]);

      // FundingPot 20, Payout 40
      // FundingPot was below payout, change to being above by changing payout (4)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [10]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 20, Payout 10
      // FundingPot was above, change to being above by changing payout (16)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [5]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 20, Payout 5
      // FundingPot was above, change to being above by changing pot (15)
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 10, otherToken.address);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 10, Payout 5
      // FundingPot was above payout, change to being below by changing payout (10)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [40]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // FundingPot 10, Payout 40
      // FundingPot was below payout, change to being below by changing payout (14)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [30]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // FundingPot 10, Payout 30
      // FundingPot was below payout, change to being below by changing pot (13)
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 5, otherToken.address),
        "colony-funding-expenditure-bad-state",
      );

      // Remove 5 from pot
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [5]);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 5, otherToken.address);
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [30]);

      // FundingPot 5, Payout 30
      // FundingPot was below payout, change to being equal by changing payout (2)
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], otherToken.address, [5]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // FundingPot 5, Payout 5
    });

    it("should pay fees on revenue correctly", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await fundColonyWithTokens(colony, otherToken, 200);
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, otherToken.address);
      const colonyTokenBalance = await otherToken.balanceOf(colony.address);
      expect(colonyTokenBalance).to.eq.BN(300);
      expect(colonyRewardPotBalance).to.eq.BN(3);
      expect(colonyPotBalance).to.eq.BN(297);
    });

    it("should return correct number of funding pots", async () => {
      const expenditureCountBefore = await colony.getExpenditureCount();
      expect(expenditureCountBefore).to.be.zero;
      const potCountBefore = await colony.getFundingPotCount();
      // Expect there to be a single funding pot for the root Domain created.
      // Note that the reward pot with id 0 is NOT included in the Colony Funding funding pots count
      expect(potCountBefore).to.eq.BN(1);

      await colony.addDomain(1, UINT256_MAX, 1);
      const potCountAfterAddingDomain = await colony.getFundingPotCount();
      expect(potCountAfterAddingDomain).to.eq.BN(2);

      for (let i = 0; i < 5; i += 1) {
        await makeExpenditure({ colony });
      }

      const expenditureCountAfter = await colony.getExpenditureCount();
      expect(expenditureCountAfter).to.be.eq.BN(5);
      const potCountAfter = await colony.getFundingPotCount();
      expect(potCountAfter).to.eq.BN(7);
    });

    it("should not allow contributions to nonexistent funding pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, UINT256_MAX, 3, 1, 5, 40, otherToken.address), "colony-funding-nonexistent-pot");
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(99);
    });

    it("should not allow attempts to move funds from nonexistent funding pots", async () => {
      await fundColonyWithTokens(colony, otherToken, 100);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 3, UINT256_MAX, 5, 1, 40, otherToken.address), "colony-funding-nonexistent-pot");
      const colonyPotBalance = await colony.getFundingPotBalance(1, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(99);
    });

    it("should not allow funds to be removed from an expenditure with payouts to go", async () => {
      await fundColonyWithTokens(colony, otherToken, INITIAL_FUNDING);
      const expenditureId = await setupFundedExpenditure({ colonyNetwork, colony, tokenAddress: otherToken.address });
      await colony.finalizeExpenditure(expenditureId);
      const expenditure = await colony.getExpenditure(expenditureId);

      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 40, otherToken.address),
        "colony-funding-expenditure-bad-state",
      );

      const colonyPotBalance = await colony.getFundingPotBalance(2, otherToken.address);
      expect(colonyPotBalance).to.eq.BN(MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT));
    });

    it("should automatically return surplus funds to the domain", async () => {
      await fundColonyWithTokens(colony, otherToken, WAD.muln(500));
      const expenditureId = await setupFundedExpenditure({ colonyNetwork, colony, tokenAddress: otherToken.address });
      await colony.finalizeExpenditure(expenditureId);
      const expenditure = await colony.getExpenditure(expenditureId);

      // Add an extra WAD of funding
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, WAD, otherToken.address);

      await colony.claimExpenditurePayout(expenditureId, SLOT0, otherToken.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT1, otherToken.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT2, otherToken.address);

      // WAD is gone
      const expenditurePotBalance = await colony.getFundingPotBalance(expenditure.fundingPotId, otherToken.address);
      expect(expenditurePotBalance).to.be.zero;
    });

    it("should correctly send whitelisted tokens to the Metacolony", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const currentFee = await colonyNetwork.getFeeInverse();
      await metaColony.setNetworkFeeInverse(1); // 100% to fees

      const expenditureId = await setupFundedExpenditure({ colonyNetwork, colony });
      await colony.finalizeExpenditure(expenditureId);

      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(MANAGER_PAYOUT);

      await metaColony.setPayoutWhitelist(token.address, true);

      const metaColonyBalanceBefore = await token.balanceOf(metaColony.address);
      await colony.claimExpenditurePayout(expenditureId, SLOT2, token.address);
      const metaColonyBalanceAfter = await token.balanceOf(metaColony.address);
      expect(metaColonyBalanceAfter.sub(metaColonyBalanceBefore)).to.eq.BN(WORKER_PAYOUT);

      await metaColony.setNetworkFeeInverse(currentFee); // Restore fees
    });
  });

  describe("when receiving ether", () => {
    it("should not put the ether straight in to the pot", async () => {
      await colony.send(100);
      let colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      let colonyEtherBalance = await web3GetBalance(colony.address);
      let colonyRewardBalance = await colony.getFundingPotBalance(0, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.be.zero;

      await colony.claimColonyFunds(ethers.constants.AddressZero);
      colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      colonyEtherBalance = await web3GetBalance(colony.address);
      colonyRewardBalance = await colony.getFundingPotBalance(0, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(colonyRewardBalance).to.eq.BN(1);
      expect(colonyPotBalance).to.eq.BN(99);
    });

    it("should let ether be moved between funding pots", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      const expenditureId = await makeExpenditure({ colony });
      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 51, ethers.constants.AddressZero);
      const colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const pot2Balance = await colony.getFundingPotBalance(2, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(colonyPotBalance).to.eq.BN(48);
      expect(pot2Balance).to.eq.BN(51);
    });

    it("should not allow more ether to leave a pot than the pot has (even if the colony has that many)", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);

      await colony.moveFundsBetweenPots(1, UINT256_MAX, 0, 1, 2, 40, ethers.constants.AddressZero);
      await checkErrorRevert(colony.moveFundsBetweenPots(1, 0, 1, 2, 3, 50, ethers.constants.AddressZero), "Panic: Arithmetic overflow");

      const colonyEtherBalance = await web3GetBalance(colony.address);
      const pot1Balance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      const pot2Balance = await colony.getFundingPotBalance(2, ethers.constants.AddressZero);
      const pot3Balance = await colony.getFundingPotBalance(3, ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(100);
      expect(pot1Balance).to.eq.BN(59);
      expect(pot2Balance).to.eq.BN(40);
      expect(pot3Balance).to.be.zero;
    });

    it("should correctly track if we are able to make ether payouts", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      const expenditureId = await makeExpenditure({ colony });
      const expenditure = await colony.getExpenditure(expenditureId);

      await colony.setExpenditureRecipients(expenditureId, [SLOT0, SLOT1], [MANAGER, WORKER]);

      // Set manager payout above pot value 40 > 0
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], ethers.constants.AddressZero, [40]);
      let fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // Fund the pot equal to manager payout 40 = 40
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 40, ethers.constants.AddressZero);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // Cannot bring pot balance below current payout
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 30, ethers.constants.AddressZero),
        "colony-funding-expenditure-bad-state",
      );

      // Set manager payout above pot value 50 > 40
      await colony.setExpenditurePayouts(expenditureId, [SLOT0], ethers.constants.AddressZero, [50]);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.eq.BN(1);

      // Fund the pot equal to manager payout, plus 10, 50 < 60
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, expenditure.fundingPotId, 20, ethers.constants.AddressZero);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;

      // Cannot bring pot balance below current payout
      await checkErrorRevert(
        colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 30, ethers.constants.AddressZero),
        "colony-funding-expenditure-bad-state",
      );

      // Can remove surplus 50 = 50
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, expenditure.fundingPotId, 1, 10, ethers.constants.AddressZero);
      fundingPot = await colony.getFundingPot(expenditure.fundingPotId);
      expect(fundingPot.payoutsWeCannotMake).to.be.zero;
    });

    it("should pay fees on revenue correctly", async () => {
      await colony.send(100);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      await colony.send(200);
      await colony.claimColonyFunds(ethers.constants.AddressZero);
      const colonyPotBalance = await colony.getFundingPotBalance(1, ethers.constants.AddressZero);
      const colonyRewardPotBalance = await colony.getFundingPotBalance(0, ethers.constants.AddressZero);
      const colonyEtherBalance = await web3GetBalance(colony.address);
      const nonRewardPotsTotal = await colony.getNonRewardPotsTotal(ethers.constants.AddressZero);
      expect(colonyEtherBalance).to.eq.BN(300);
      expect(colonyPotBalance).to.eq.BN(297);
      expect(colonyRewardPotBalance).to.eq.BN(3);
      expect(nonRewardPotsTotal).to.eq.BN(297);
    });

    it("should allow native coins to be directly sent to a domain", async () => {
      // Get address for domain 2
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);

      // Send 100 wei
      await web3.eth.sendTransaction({ from: MANAGER, to: receiverAddress, value: 100, gas: 1000000 });

      const domain = await colony.getDomain(2);
      const domainPotBalanceBefore = await colony.getFundingPotBalance(domain.fundingPotId, ethers.constants.AddressZero);
      const nonRewardPotsTotalBefore = await colony.getNonRewardPotsTotal(ethers.constants.AddressZero);

      // Claim the funds

      const tx = await colony.claimDomainFunds(ethers.constants.AddressZero, 2);
      await expectEvent(tx, "DomainFundsClaimed", [MANAGER, ethers.constants.AddressZero, 2, 1, 99]);

      const domainPotBalanceAfter = await colony.getFundingPotBalance(domain.fundingPotId, ethers.constants.AddressZero);
      const nonRewardPotsTotalAfter = await colony.getNonRewardPotsTotal(ethers.constants.AddressZero);

      // Check the balance of the domain
      expect(domainPotBalanceAfter.sub(domainPotBalanceBefore)).to.eq.BN(99);
      expect(nonRewardPotsTotalAfter.sub(nonRewardPotsTotalBefore)).to.eq.BN(99);
    });

    it("should allow a token to be directly sent to a domain", async () => {
      // Get address for domain 2
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);

      // Send 100 wei
      await otherToken.mint(receiverAddress, 100);

      const domain = await colony.getDomain(2);
      const domainPotBalanceBefore = await colony.getFundingPotBalance(domain.fundingPotId, otherToken.address);
      const nonRewardPotsTotalBefore = await colony.getNonRewardPotsTotal(otherToken.address);

      // Claim the funds
      const tx = await colony.claimDomainFunds(otherToken.address, 2);
      await expectEvent(tx, "DomainFundsClaimed", [MANAGER, otherToken.address, 2, 1, 99]);

      const domainPotBalanceAfter = await colony.getFundingPotBalance(domain.fundingPotId, otherToken.address);
      const nonRewardPotsTotalAfter = await colony.getNonRewardPotsTotal(otherToken.address);

      // Check the balance of the domain
      expect(domainPotBalanceAfter.sub(domainPotBalanceBefore)).to.eq.BN(99);
      expect(nonRewardPotsTotalAfter.sub(nonRewardPotsTotalBefore)).to.eq.BN(99);
    });

    it("when receiving native (reputation-earning) token, if no approval present for domain, all are received by root domain", async () => {
      // Get address for domain 2
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);
      await colony.mintTokens(WAD.muln(100));
      await colony.claimColonyFunds(token.address);
      const domain1 = await colony.getDomain(1);

      // Pay the tokens to the domain
      await setupClaimedExpenditure({
        colonyNetwork,
        colony,
        domainId: 1,
        manager: MANAGER,
        managerPayout: 1000,
        evaluatorPayout: 0,
        workerPayout: 0,
      });

      // Send 100 to the domain
      await token.transfer(receiverAddress, 100);

      // Now test what happens when we claim them

      const domain = await colony.getDomain(2);
      const domainPotBalanceBefore = await colony.getFundingPotBalance(domain.fundingPotId, token.address);
      const nonRewardPotsTotalBefore = await colony.getNonRewardPotsTotal(token.address);
      const rootDomainPotBalanceBefore = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);

      // Claim the funds
      await colony.claimDomainFunds(token.address, 2);

      const domainPotBalanceAfter = await colony.getFundingPotBalance(domain.fundingPotId, token.address);
      const nonRewardPotsTotalAfter = await colony.getNonRewardPotsTotal(token.address);
      const rootDomainPotBalanceAfter = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);

      // Check the balance of the domain
      expect(domainPotBalanceAfter.sub(domainPotBalanceBefore)).to.eq.BN(0);
      expect(nonRewardPotsTotalAfter.sub(nonRewardPotsTotalBefore)).to.eq.BN(99);
      expect(rootDomainPotBalanceAfter.sub(rootDomainPotBalanceBefore)).to.eq.BN(99);
    });

    it(`when receiving native (reputation-earning) token, if partial approval present for domain,
      tokens are split between intended domain and root`, async () => {
      // Get address for domain 2
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);
      await colony.mintTokens(WAD.muln(100));
      await colony.claimColonyFunds(token.address);
      const domain1 = await colony.getDomain(1);

      // Pay the tokens to the domain
      await setupClaimedExpenditure({
        colonyNetwork,
        colony,
        domainId: 1,
        manager: MANAGER,
        tokenAddress: token.address,
        managerPayout: 1000,
        evaluatorPayout: 0,
        workerPayout: 0,
      });

      // Send 100 to the domain
      await token.transfer(receiverAddress, 100);

      // Approve 70 for the domain
      await colony.editAllowedDomainTokenReceipt(2, token.address, 70, true);
      let allowedReceipt = await colony.getAllowedDomainTokenReceipt(2, token.address);
      expect(allowedReceipt).to.eq.BN(70);

      // Now test what happens when we claim them

      const domain = await colony.getDomain(2);
      const domainPotBalanceBefore = await colony.getFundingPotBalance(domain.fundingPotId, token.address);
      const nonRewardPotsTotalBefore = await colony.getNonRewardPotsTotal(token.address);
      const rootDomainPotBalanceBefore = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);

      // Claim the funds
      await colony.claimDomainFunds(token.address, 2);

      const domainPotBalanceAfter = await colony.getFundingPotBalance(domain.fundingPotId, token.address);
      const nonRewardPotsTotalAfter = await colony.getNonRewardPotsTotal(token.address);
      const rootDomainPotBalanceAfter = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);

      // Check the balance of the domain
      expect(domainPotBalanceAfter.sub(domainPotBalanceBefore)).to.eq.BN(70);
      expect(nonRewardPotsTotalAfter.sub(nonRewardPotsTotalBefore)).to.eq.BN(99);
      expect(rootDomainPotBalanceAfter.sub(rootDomainPotBalanceBefore)).to.eq.BN(29);

      allowedReceipt = await colony.getAllowedDomainTokenReceipt(2, token.address);
      expect(allowedReceipt).to.eq.BN(0);
    });

    it(`root permission is required to call editAllowedDomainTokenReceipt`, async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await checkErrorRevert(colony.editAllowedDomainTokenReceipt(2, token.address, 70, true, { from: WORKER }), "ds-auth-unauthorized");
      const rootRole = rolesToBytes32([ROOT_ROLE]);

      await colony.setUserRoles(1, UINT256_MAX, WORKER, 1, rootRole);
      await colony.editAllowedDomainTokenReceipt(2, token.address, 70, true, { from: WORKER });
    });

    it(`cannot editAllowedDomainTokenReceipt for a domain that does not exist`, async () => {
      await checkErrorRevert(colony.editAllowedDomainTokenReceipt(2, token.address, 70, true), "colony-funding-domain-does-not-exist");
    });

    it(`cannot editAllowedDomainTokenReceipt for a token that does not earn reputation`, async () => {
      await checkErrorRevert(colony.editAllowedDomainTokenReceipt(1, ADDRESS_ZERO, 70, true), "colony-funding-token-does-not-earn-reputation");
    });

    it(`can add and remove allowed domain token receipts as expected`, async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.editAllowedDomainTokenReceipt(2, token.address, 70, true);
      let allowedReceipt = await colony.getAllowedDomainTokenReceipt(2, token.address);
      expect(allowedReceipt).to.eq.BN(70);

      await colony.editAllowedDomainTokenReceipt(2, token.address, 20, false);
      allowedReceipt = await colony.getAllowedDomainTokenReceipt(2, token.address);
      expect(allowedReceipt).to.eq.BN(50);
    });

    it(`cannot editAllowedDomainTokenReceipt for the root domain`, async () => {
      await checkErrorRevert(colony.editAllowedDomainTokenReceipt(1, token.address, 70, true), "colony-funding-root-domain");
    });

    it(`when receiving native (reputation-earning) token, if full approval present for domain,
      tokens are received by domain`, async () => {
      // Get address for domain 2
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);
      await colony.mintTokens(WAD.muln(100));
      await colony.claimColonyFunds(token.address);
      const domain1 = await colony.getDomain(1);

      // Pay the tokens to the domain
      await setupClaimedExpenditure({
        colonyNetwork,
        colony,
        domainId: 1,
        manager: MANAGER,
        tokenAddress: token.address,
        managerPayout: 1000,
        evaluatorPayout: 0,
        workerPayout: 0,
      });

      // Send 100 to the domain
      await token.transfer(receiverAddress, 100);

      // Approve 250 for the domain
      await colony.editAllowedDomainTokenReceipt(2, token.address, 250, true);
      let allowedReceipt = await colony.getAllowedDomainTokenReceipt(2, token.address);
      expect(allowedReceipt).to.eq.BN(250);

      // Now test what happens when we claim them

      const domain = await colony.getDomain(2);
      const domainPotBalanceBefore = await colony.getFundingPotBalance(domain.fundingPotId, token.address);
      const nonRewardPotsTotalBefore = await colony.getNonRewardPotsTotal(token.address);
      const rootDomainPotBalanceBefore = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);

      // Claim the funds
      await colony.claimDomainFunds(token.address, 2);

      const domainPotBalanceAfter = await colony.getFundingPotBalance(domain.fundingPotId, token.address);
      const nonRewardPotsTotalAfter = await colony.getNonRewardPotsTotal(token.address);
      const rootDomainPotBalanceAfter = await colony.getFundingPotBalance(domain1.fundingPotId, token.address);

      // Check the balance of the domain
      expect(domainPotBalanceAfter.sub(domainPotBalanceBefore)).to.eq.BN(99);
      expect(nonRewardPotsTotalAfter.sub(nonRewardPotsTotalBefore)).to.eq.BN(99);
      expect(rootDomainPotBalanceAfter.sub(rootDomainPotBalanceBefore)).to.eq.BN(0);

      allowedReceipt = await colony.getAllowedDomainTokenReceipt(2, token.address);
      expect(allowedReceipt).to.eq.BN(151);
    });

    it("should not be able to claim funds for a domain that does not exist", async () => {
      await checkErrorRevert(colony.claimDomainFunds(ethers.constants.AddressZero, 2), "colony-funding-domain-does-not-exist");
    });

    it("only a colony can call idempotentDeployDomainTokenReceiver on Network", async () => {
      await checkErrorRevert(colonyNetwork.idempotentDeployDomainTokenReceiver(2), "colony-caller-must-be-colony");
    });

    it("If the receiver resolver is updated, then the resolver is updated at the next claim", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);
      // Send 100 wei
      await otherToken.mint(receiverAddress, 100);
      await colony.claimDomainFunds(otherToken.address, 2);

      const receiverAsEtherRouter = await EtherRouter.at(receiverAddress);
      const resolver = await receiverAsEtherRouter.resolver();

      // Update the resolver
      const newResolver = await Resolver.new();
      const domainTokenReceiver = await DomainTokenReceiver.new();

      await setupDomainTokenReceiverResolver(colonyNetwork, domainTokenReceiver, newResolver);

      await otherToken.mint(receiverAddress, 50);
      await colony.claimDomainFunds(otherToken.address, 2);

      const resolverAfter = await receiverAsEtherRouter.resolver();
      expect(resolverAfter).to.not.equal(resolver);
      expect(resolverAfter).to.equal(newResolver.address);
    });

    it("should not be able to claim funds for a domain that does not exist", async () => {
      await checkErrorRevert(colony.claimDomainFunds(ethers.constants.AddressZero, 2), "colony-funding-domain-does-not-exist");
    });

    it("only a colony can call checkDomainTokenReceiverDeployed on Network", async () => {
      await checkErrorRevert(colonyNetwork.checkDomainTokenReceiverDeployed(2), "colony-caller-must-be-colony");
    });

    it("only the owner (which should be colonyNetwork) can call setColonyAddress on DomainTokenReceiver", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.claimDomainFunds(ethers.constants.AddressZero, 2);

      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);
      const receiverAsEtherRouter = await EtherRouter.at(receiverAddress);
      const receiver = await DomainTokenReceiver.at(receiverAddress);
      const owner = await receiverAsEtherRouter.owner();
      expect(owner).to.equal(colonyNetwork.address);

      await checkErrorRevert(receiver.setColonyAddress(colony.address), "ds-auth-unauthorized");
      await receiver.setColonyAddress.estimateGas(colony.address, { from: colonyNetwork.address });
    });

    it("If transfer fails from receiver, then the funds are not claimed", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);

      const toggleableToken = await ToggleableToken.new(200);
      await toggleableToken.mint(receiverAddress, 100);

      await toggleableToken.toggleLock();

      // Try to claim the funds
      await checkErrorRevert(colony.claimDomainFunds(toggleableToken.address, 2), "domain-token-receiver-transfer-failed");
    });

    it("If the receiver resolver is updated, then the resolver is updated at the next claim", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const receiverAddress = await colonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);
      // Send 100 wei
      await otherToken.mint(receiverAddress, 100);
      await colony.claimDomainFunds(otherToken.address, 2);

      const receiverAsEtherRouter = await EtherRouter.at(receiverAddress);
      const resolver = await receiverAsEtherRouter.resolver();

      // Update the resolver
      const newResolver = await Resolver.new();
      const domainTokenReceiver = await DomainTokenReceiver.new();

      await setupDomainTokenReceiverResolver(colonyNetwork, domainTokenReceiver, newResolver);

      await otherToken.mint(receiverAddress, 50);
      await colony.claimDomainFunds(otherToken.address, 2);

      const resolverAfter = await receiverAsEtherRouter.resolver();
      expect(resolverAfter).to.not.equal(resolver);
      expect(resolverAfter).to.equal(newResolver.address);
    });
  });
});
