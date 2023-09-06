/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const {
  IPFS_HASH,
  UINT256_MAX,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  WAD,
  ADDRESS_ZERO,
} = require("../../helpers/constants");
const { getTokenArgs, web3GetBalance, checkErrorRevert, expectNoEvent, expectAllEvents, expectEvent } = require("../../helpers/test-helper");
const { makeTask, setupRandomColony, getMetaTransactionParameters } = require("../../helpers/test-data-generator");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const TransferTest = artifacts.require("TransferTest");
const Token = artifacts.require("Token");

contract("Colony", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
  });

  describe("when initialised", () => {
    it("should have the network and token set", async () => {
      const network = await colony.getColonyNetwork();
      expect(network).to.equal(colonyNetwork.address);

      const colonyToken = await colony.getToken();
      expect(colonyToken).to.equal(token.address);
    });

    it("should accept ether", async () => {
      await colony.send(1);
      const colonyBalance = await web3GetBalance(colony.address);
      expect(colonyBalance).to.eq.BN(1);
    });

    it("should accept ether from a contract using .transfer", async () => {
      const transferTest = await TransferTest.new({ value: 10 });
      await transferTest.fireTransfer(colony.address, 10);
      const colonyBalance = await web3GetBalance(colony.address);
      expect(colonyBalance).to.eq.BN(10);
    });

    it("should not have owner", async () => {
      const owner = await colony.owner();
      expect(owner).to.be.equal(ethers.constants.AddressZero);
    });

    it("should return zero task count", async () => {
      const taskCount = await colony.getTaskCount();
      expect(taskCount).to.be.zero;
    });

    it("should return zero for taskChangeNonce", async () => {
      const taskChangeNonce = await colony.getTaskChangeNonce(1);
      expect(taskChangeNonce).to.be.zero;
    });

    it("should emit correct Mint event when minting tokens", async () => {
      const tokenArgs = getTokenArgs();
      const otherToken = await Token.new(...tokenArgs);
      await otherToken.unlock();

      await expectAllEvents(otherToken.methods["mint(uint256)"](100), ["Mint"]);
    });

    it("should emit correct Mint event when minting tokens through the colony", async () => {
      const tokenArgs = getTokenArgs();
      const otherToken = await Token.new(...tokenArgs);
      await otherToken.unlock();

      await expectEvent(colony.mintTokens(100), "TokensMinted", [accounts[0], colony.address, 100]);
      await expectEvent(colony.mintTokensFor(USER1, 100), "TokensMinted", [accounts[0], USER1, 100]);
    });

    it("should fail if a non-admin tries to mint tokens", async () => {
      await checkErrorRevert(colony.mintTokens(100, { from: accounts[3] }), "ds-auth-unauthorized");
    });

    it("should not allow initialisation with null token or network addresses", async () => {
      await checkErrorRevert(colony.initialiseColony(ethers.constants.AddressZero, ethers.constants.AddressZero), "colony-network-cannot-be-zero");
      await checkErrorRevert(colony.initialiseColony(colonyNetwork.address, ethers.constants.AddressZero), "colony-token-cannot-be-zero");
    });

    it("should not allow reinitialisation", async () => {
      await checkErrorRevert(colony.initialiseColony(colonyNetwork.address, token.address), "colony-already-initialised-network");
    });

    it("should correctly generate a rating secret", async () => {
      const ratingSecret1 = await colony.generateSecret(RATING_1_SALT, MANAGER_RATING);
      const ratingSecret2 = await colony.generateSecret(RATING_2_SALT, WORKER_RATING);
      expect(ratingSecret1).to.eq.BN(RATING_1_SECRET);
      expect(ratingSecret2).to.eq.BN(RATING_2_SECRET);
    });

    it("should initialise the root domain", async () => {
      // There should be one domain (the root domain)
      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(1);

      const domain = await colony.getDomain(domainCount);

      // The first pot should have been created and assigned to the domain
      expect(domain.fundingPotId).to.eq.BN(1);

      // A domain skill should have been created for the Colony
      const rootLocalSkillId = await colonyNetwork.getSkillCount();
      expect(domain.skillId).to.eq.BN(rootLocalSkillId.subn(1));
    });

    it("should let funding pot information be read", async () => {
      const taskId = await makeTask({ colony });
      const taskInfo = await colony.getTask(taskId);
      let potInfo = await colony.getFundingPot(taskInfo.fundingPotId);
      expect(potInfo.associatedType).to.eq.BN(2);
      expect(potInfo.associatedTypeId).to.eq.BN(taskId);
      expect(potInfo.payoutsWeCannotMake).to.be.zero;

      // Read pot info about a pot in a domain
      const domainInfo = await colony.getDomain(1);
      potInfo = await colony.getFundingPot(domainInfo.fundingPotId);
      expect(potInfo.associatedType).to.eq.BN(1);
      expect(potInfo.associatedTypeId).to.eq.BN(1);
    });

    it("should return the correct payout information about the reward funding pot", async () => {
      const rewardPotInfo = await colony.getFundingPot(0);
      expect(rewardPotInfo.associatedType).to.be.zero;
      expect(rewardPotInfo.associatedTypeId).to.be.zero;
      expect(rewardPotInfo.payoutsWeCannotMake).to.be.zero;
    });

    it("should allow the token to be unlocked by a root user only", async () => {
      ({ colony, token } = await setupRandomColony(colonyNetwork, true));
      await token.setOwner(colony.address);
      let locked = await token.locked();
      expect(locked).to.be.equal(true);

      await checkErrorRevert(colony.unlockToken({ from: USER1 }), "ds-auth-unauthorized");

      await expectEvent(colony.unlockToken({ from: accounts[0] }), "TokenUnlocked", []);
      locked = await token.locked();
      expect(locked).to.be.equal(false);
    });
  });

  describe("when adding local skills", () => {
    it("should be able to get the rootLocalSkill", async () => {
      const rootLocalSkill = await colony.getRootLocalSkill();
      // If run as the only test, it's 5. If it's in the test suite as a whole, because there's a
      // 'beforeEach' that creates colonies, it depends how many there have been.
      expect(rootLocalSkill).to.be.gte.BN(5);
    });

    it("should log the LocalSkillAdded event", async () => {
      const tx = await colony.addLocalSkill();

      const skillCount = await colonyNetwork.getSkillCount();
      await expectEvent(tx, "LocalSkillAdded", [accounts[0], skillCount]);
    });

    it("should allow root users to deprecate local skills", async () => {
      await colony.addLocalSkill();
      const skillCount = await colonyNetwork.getSkillCount();

      const tx = await colony.deprecateLocalSkill(skillCount, true);
      await expectEvent(tx, "LocalSkillDeprecated", [accounts[0], skillCount, true]);
    });

    it("should not emit an event if deprecation is a no-op", async () => {
      await colony.addLocalSkill();
      const skillCount = await colonyNetwork.getSkillCount();

      const tx = await colony.deprecateLocalSkill(skillCount, false);
      await expectNoEvent(tx, "LocalSkillDeprecated");
    });
  });

  describe("when adding domains", () => {
    it("should log DomainAdded and FundingPotAdded and DomainMetadata events", async () => {
      let tx = await colony.addDomain(1, UINT256_MAX, 1);
      let domainCount = await colony.getDomainCount();
      await expectEvent(tx, "DomainAdded", [accounts[0], domainCount]);
      let fundingPotCount = await colony.getFundingPotCount();
      await expectEvent(tx, "FundingPotAdded", [fundingPotCount]);
      await expectNoEvent(tx, "DomainMetadata");

      tx = await colony.addDomain(1, UINT256_MAX, 1, IPFS_HASH);
      domainCount = await colony.getDomainCount();
      await expectEvent(tx, "DomainAdded", [accounts[0], domainCount]);
      fundingPotCount = await colony.getFundingPotCount();
      await expectEvent(tx, "FundingPotAdded", [fundingPotCount]);
      await expectEvent(tx, "DomainMetadata", [accounts[0], domainCount, IPFS_HASH]);
    });
  });

  describe("when editing domains", () => {
    it("should log the DomainMetadata event", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const domainCount = await colony.getDomainCount();
      await expectEvent(colony.editDomain(1, 0, 2, IPFS_HASH), "DomainMetadata", [accounts[0], domainCount, IPFS_HASH]);
    });

    it("should not log the DomainMetadata event if empty string passed", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await expectNoEvent(colony.editDomain(1, 0, 2, ""), "DomainMetadata");
    });
  });

  describe("when deprecating domains", () => {
    it("should log the DomainDeprecated event", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await expectEvent(colony.deprecateDomain(1, 0, 2, true), "DomainDeprecated", [USER0, 2, true]);
    });

    it("should not be able to perform prohibited actions in the domain", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.deprecateDomain(1, 0, 2, true);

      await checkErrorRevert(colony.addDomain(1, 0, 2), "colony-domain-deprecated");
      await checkErrorRevert(colony.makeExpenditure(1, 0, 2), "colony-domain-deprecated");
      await checkErrorRevert(colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, 0, 1, 2, 100, token.address), "colony-domain-deprecated");
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [WAD.muln(5), WAD.muln(4), WAD.muln(3), WAD.muln(2)];
    const INITIAL_ADDRESSES = accounts.slice(0, 4);

    it("should assign reputation correctly", async () => {
      const skillCount = await colonyNetwork.getSkillCount();
      const rootDomainSkillId = skillCount.subn(1);

      await colony.mintTokens(WAD.muln(14));
      await colony.claimColonyFunds(token.address);
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const numberOfReputationLogs = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      expect(numberOfReputationLogs).to.eq.BN(INITIAL_ADDRESSES.length);
      const updateLog = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      expect(updateLog.user).to.eq.BN(INITIAL_ADDRESSES[0]);
      expect(updateLog.amount).to.eq.BN(INITIAL_REPUTATIONS[0]);
      expect(updateLog.skillId).to.eq.BN(rootDomainSkillId);
    });

    it("should assign tokens correctly", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-bootstrap-not-enough-tokens");

      await colony.claimColonyFunds(token.address);
      const potBalanceBefore = await colony.getFundingPotBalance(1, token.address);
      expect(potBalanceBefore).to.eq.BN(WAD.muln(14));

      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      expect(balance).to.eq.BN(INITIAL_REPUTATIONS[0]);

      const potBalanceAfter = await colony.getFundingPotBalance(1, token.address);
      expect(potBalanceAfter).to.be.zero;
    });

    it("should be able to bootstrap colony more than once", async () => {
      await colony.mintTokens(WAD.muln(10));
      await colony.claimColonyFunds(token.address);

      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      expect(balance).to.eq.BN(WAD.muln(10));
    });

    it("should throw if length of inputs is not equal", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(colony.bootstrapColony([INITIAL_ADDRESSES[0]], INITIAL_REPUTATIONS), "colony-bootstrap-bad-inputs");
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, [INITIAL_REPUTATIONS[0]]), "colony-bootstrap-bad-inputs");
    });

    it("should not allow negative number", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(colony.bootstrapColony([INITIAL_ADDRESSES[0]], [WAD.muln(5).neg()]), "colony-bootstrap-bad-amount-input");
    });

    it("should throw if there is not enough funds to send", async () => {
      await colony.mintTokens(WAD.muln(10));
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-bootstrap-not-enough-tokens");

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      expect(balance).to.be.zero;
    });

    it("should not allow non-creator to bootstrap reputation", async () => {
      await colony.mintTokens(WAD.muln(14));
      await checkErrorRevert(
        colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS, {
          from: USER1,
        }),
        "ds-auth-unauthorized",
      );
    });

    it("should not allow bootstrapping if tasks have been made", async () => {
      await colony.mintTokens(WAD.muln(14));
      await makeTask({ colony });
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-not-in-bootstrap-mode");
    });

    it("should not allow bootstrapping if payments have been made", async () => {
      await colony.mintTokens(WAD.muln(14));
      await colony.addPayment(1, UINT256_MAX, USER1, token.address, WAD, 1, 0);
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-not-in-bootstrap-mode");
    });

    it("should not allow bootstrapping if expenditures have been made", async () => {
      await colony.mintTokens(WAD.muln(14));
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-not-in-bootstrap-mode");
    });
  });

  describe("when setting the reward inverse", () => {
    it("should have a default reward inverse set to max uint", async () => {
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(UINT256_MAX);
    });

    it("should allow root user to set it", async () => {
      await colony.setRewardInverse(234);
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(234);
    });

    it("should not allow anyone else but a root user to set it", async () => {
      await colony.setRewardInverse(100);
      await checkErrorRevert(colony.setRewardInverse(234, { from: USER1 }), "ds-auth-unauthorized");
      const defaultRewardInverse = await colony.getRewardInverse();
      expect(defaultRewardInverse).to.eq.BN(100);
    });

    it("should not allow the amount to be set to zero", async () => {
      await checkErrorRevert(colony.setRewardInverse(0), "colony-reward-inverse-cannot-be-zero");
    });
  });

  describe("when annotating transactions", () => {
    it("should be able to emit transaction annotations", async () => {
      const tx1 = await colony.addDomain(1, UINT256_MAX, 1);
      const tx2 = await colony.annotateTransaction(tx1.tx, "annotation");
      await expectEvent(tx2, "Annotation", [USER0, tx1.tx, "annotation"]);
    });
  });

  describe("when editing colony data", () => {
    it("should be able to emit the event we expect to contain an entire blob", async () => {
      const tx = await colony.editColony("ipfsContainingBlob");
      await expectEvent(tx, "ColonyMetadata", [USER0, "ipfsContainingBlob"]);
    });

    it("should be able to emit the event we expect to contain a delta", async () => {
      const tx = await colony.editColonyByDelta("ipfsContainingDelta");
      await expectEvent(tx, "ColonyMetadataDelta", [USER0, "ipfsContainingDelta"]);
    });
  });

  describe("when executing metatransactions", () => {
    it("should allow a metatransaction to occur", async () => {
      const txData = await colony.contract.methods.mintTokens(100).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, colony.address);

      const tx = await colony.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

      await expectEvent(tx, "TokensMinted(address,address,uint256)", [USER0, colony.address, 100]);
    });

    it("should not allow a metatransaction to occur if signature bad (as opposed to invalid)", async () => {
      const txData = await colony.contract.methods.mintTokens(100).encodeABI();

      const { r, v } = await getMetaTransactionParameters(txData, USER0, colony.address);

      await checkErrorRevert(
        colony.executeMetaTransaction(USER0, txData, r, ADDRESS_ZERO, v + 1, { from: USER1 }),
        "colony-metatx-invalid-signature",
      );
    });
  });

  describe("when executing a multicall transaction", () => {
    it("a multicall transaction cannot call multicall", async function () {
      const txData1 = await colony.contract.methods.setArchitectureRole(1, UINT256_MAX, USER1, 1, true).encodeABI();
      const txData2 = await colony.contract.methods.multicall([txData1]).encodeABI();

      await checkErrorRevert(colony.multicall([txData1, txData2]), "colony-multicall-cannot-multicall");
    });
  });

  describe("when burning tokens", async () => {
    beforeEach(async () => {
      await colony.mintTokens(WAD);
      await colony.claimColonyFunds(token.address);
    });

    it("should allow root user to burn", async () => {
      const amount = await colony.getFundingPotBalance(1, token.address);
      const tx = await colony.burnTokens(token.address, amount);
      await expectEvent(tx, "TokensBurned", [accounts[0], token.address, amount]);
    });

    it("should not allow anyone else but a root user to burn", async () => {
      const amount = await colony.getFundingPotBalance(1, token.address);
      await checkErrorRevert(colony.burnTokens(token.address, amount, { from: USER1 }), "ds-auth-unauthorized");
    });

    it("cannot burn more tokens than it has", async () => {
      const amount = await colony.getFundingPotBalance(1, token.address);
      await checkErrorRevert(colony.burnTokens(token.address, amount.muln(2)), "colony-not-enough-tokens");
    });

    it("cannot burn more tokens than are in the root funding pot", async () => {
      const amount = await colony.getFundingPotBalance(1, token.address);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, 0, amount.divn(2), token.address);

      await checkErrorRevert(colony.burnTokens(token.address, amount), "colony-not-enough-tokens");
    });
  });
});
