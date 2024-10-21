/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const { IPFS_HASH, UINT256_MAX, WAD, ADDRESS_ZERO, SPECIFICATION_HASH, HASHZERO } = require("../../helpers/constants");
const {
  getTokenArgs,
  web3GetBalance,
  checkErrorRevert,
  expectNoEvent,
  expectAllEvents,
  expectEvent,
  upgradeColonyOnceThenToLatest,
} = require("../../helpers/test-helper");
const {
  setupRandomColony,
  getMetaTransactionParameters,
  makeExpenditure,
  fundColonyWithTokens,
  setupColony,
} = require("../../helpers/test-data-generator");
const { downgradeColony, deployColonyVersionGLWSS4, deployColonyVersionHMWSS } = require("../../scripts/deployOldUpgradeableVersion");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const TransferTest = artifacts.require("TransferTest");
const Token = artifacts.require("Token");

const TokenAuthority = artifacts.require("contracts/common/TokenAuthority.sol:TokenAuthority");

contract("Colony", (accounts) => {
  let colony;
  let token;
  let localSkillId;
  let colonyNetwork;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    const cnAddress = (await EtherRouter.deployed()).address;

    const etherRouter = await EtherRouter.at(cnAddress);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token, localSkillId } = await setupRandomColony(colonyNetwork));
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

    it("should return zero expenditure count", async () => {
      const expenditureCount = await colony.getExpenditureCount();
      expect(expenditureCount).to.be.zero;
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

    it("should initialise the root domain", async () => {
      // There should be one domain (the root domain)
      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(1);

      const domain = await colony.getDomain(domainCount);

      // The first pot should have been created and assigned to the domain
      expect(domain.fundingPotId).to.eq.BN(1);

      // A domain skill should have been created for the Colony
      const skillCount = await colonyNetwork.getSkillCount();
      expect(domain.skillId).to.be.gte.BN(1);
      expect(domain.skillId).to.be.lte.BN(skillCount);
    });

    it("should let funding pot information be read", async () => {
      const expenditureId = await makeExpenditure({ colony });
      const expenditure = await colony.getExpenditure(expenditureId);
      let potInfo = await colony.getFundingPot(expenditure.fundingPotId);
      expect(potInfo.associatedType).to.eq.BN(4);
      expect(potInfo.associatedTypeId).to.eq.BN(expenditureId);
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

      await checkErrorRevert(colony.deprecateLocalSkill(skillCount, true, { from: USER1 }), "ds-auth-unauthorized");

      const tx = await colony.deprecateLocalSkill(skillCount, true);
      await expectEvent(tx, "LocalSkillDeprecated", [accounts[0], skillCount, true]);
    });

    it("should not be able to deprecate a skill on the network", async () => {
      await deployColonyVersionHMWSS(colonyNetwork);
      await downgradeColony(colonyNetwork, colony, "hmwss");

      const version = await colony.version();
      expect(version).to.eq.BN(14);

      await checkErrorRevert(colony.deprecateLocalSkill(0, true), "colony-network-deprecate-skill-disabled");
    });

    it("should not emit events when repeatedly deprecating a local skill", async () => {
      await colony.addLocalSkill();
      const skillCount = await colonyNetwork.getSkillCount();

      // First deprecation
      let tx = await colony.deprecateLocalSkill(skillCount, true);
      await expectEvent(tx, "LocalSkillDeprecated", [accounts[0], skillCount, true]);

      // Re-deprecate (no event)
      tx = await colony.deprecateLocalSkill(skillCount, true);
      await expectNoEvent(tx, "LocalSkillDeprecated");

      // Un-deprecate
      tx = await colony.deprecateLocalSkill(skillCount, false);
      await expectEvent(tx, "LocalSkillDeprecated", [accounts[0], skillCount, false]);
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

    it("should only allow authorized users to deprecate domains", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const domainId = await colony.getDomainCount();

      // Non-authorized user should not be able to deprecate
      await checkErrorRevert(colony.deprecateDomain(1, 0, domainId, true, { from: USER1 }), "ds-auth-unauthorized");

      // Root user should be able to deprecate
      await expectEvent(colony.deprecateDomain(1, 0, domainId, true, { from: USER0 }), "DomainDeprecated", [USER0, domainId, true]);
    });

    it("should not re-emit events when repeatedly deprecating a domain", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const domainId = await colony.getDomainCount();

      // Deprecate the domain for the first time
      const tx1 = await colony.deprecateDomain(1, 0, domainId, true);
      await expectEvent(tx1, "DomainDeprecated", [USER0, domainId, true]);

      // Attempt to deprecate the domain again
      const tx2 = await colony.deprecateDomain(1, 0, domainId, true);
      await expectNoEvent(tx2, "DomainDeprecated");

      // Undeprecate the domain
      const tx3 = await colony.deprecateDomain(1, 0, domainId, false);
      await expectEvent(tx3, "DomainDeprecated", [USER0, domainId, false]);

      // Deprecate the domain once more
      const tx4 = await colony.deprecateDomain(1, 0, domainId, true);
      await expectEvent(tx4, "DomainDeprecated", [USER0, domainId, true]);
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [WAD.muln(5), WAD.muln(4), WAD.muln(3), WAD.muln(2)];
    const INITIAL_ADDRESSES = accounts.slice(0, 4);

    it("should assign reputation correctly", async () => {
      const domain = await colony.getDomain(1);

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
      expect(updateLog.skillId).to.eq.BN(domain.skillId);
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

    it("should not allow a user to replay another's metatransaction even if nonce the same", async () => {
      const txData = await colony.contract.methods.mintTokens(100).encodeABI();

      const user0Nonce = await colony.getMetatransactionNonce(USER0);
      const user1Nonce = await colony.getMetatransactionNonce(USER1);

      expect(user0Nonce).to.be.eq.BN(user1Nonce);

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, colony.address);

      await colony.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

      await checkErrorRevert(colony.executeMetaTransaction(USER1, txData, r, s, v, { from: USER1 }), "metatransaction-signer-signature-mismatch");
    });

    it("not vulnerable to metatransactions / multicall vulnerability", async () => {
      // https://blog.solidityscan.com/unveiling-the-erc-2771context-and-multicall-vulnerability-f96ffa5b499f
      // Create an expenditure as a user
      await colony.makeExpenditure(1, UINT256_MAX, 1);

      // Should not be able to multicall and cancel it as another user, pretending to be the first user
      const expenditureId = await colony.getExpenditureCount();
      let txData1 = await colony.contract.methods.cancelExpenditure(expenditureId).encodeABI();

      const METATRANSACTION_FLAG = ethers.utils.id("METATRANSACTION");

      txData1 += METATRANSACTION_FLAG.slice(2) + USER0.slice(2);

      const txData2 = await colony.contract.methods.multicall([txData1]).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData2, USER1, colony.address);

      // User 1 can't cancel the expenditure directly
      await checkErrorRevert(colony.cancelExpenditure(expenditureId, { from: USER1 }), "colony-expenditure-not-owner");

      // And can't via metatransaction using specially constructed malicious txdata
      await checkErrorRevert(colony.executeMetaTransaction(USER1, txData2, r, s, v, { from: USER1 }), "colony-metatx-function-call-unsuccessful");
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

  describe("when viewing deprecated Tasks and Payments", () => {
    let OldInterface;
    let oldColony;
    before(async () => {
      ({ OldInterface } = await deployColonyVersionGLWSS4(colonyNetwork));
      await deployColonyVersionHMWSS(colonyNetwork);
    });

    beforeEach(async () => {
      colony = await setupColony(colonyNetwork, token.address, 13);

      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const tokenAuthority = await TokenAuthority.new(token.address, colony.address, [tokenLockingAddress]);
      await token.setAuthority(tokenAuthority.address);

      oldColony = await OldInterface.at(colony.address);
      await colony.addLocalSkill();
      localSkillId = await colonyNetwork.getSkillCount();
    });

    it("should be able to query for a task", async () => {
      await oldColony.makeTask(1, UINT256_MAX, SPECIFICATION_HASH, 1, localSkillId, 0, { from: USER0 });
      await upgradeColonyOnceThenToLatest(oldColony);
      const taskId = await colony.getTaskCount();
      const task = await colony.getTask(taskId);

      expect(task.specificationHash).to.equal(SPECIFICATION_HASH);
      expect(task.domainId).to.eq.BN(1);

      const taskChangeNonce = await colony.getTaskChangeNonce(taskId);
      const taskWorkRatingSecretsInfo = await colony.getTaskWorkRatingSecretsInfo(taskId);
      const taskWorkRatingSecret = await colony.getTaskWorkRatingSecret(taskId, 0);
      const taskRole = await colony.getTaskRole(taskId, 0);

      expect(taskChangeNonce).to.eq.BN(0);
      expect(taskWorkRatingSecretsInfo[0]).to.eq.BN(0);
      expect(taskWorkRatingSecretsInfo[1]).to.eq.BN(0);
      expect(taskWorkRatingSecret).to.equal(HASHZERO);
      expect(taskRole.user).to.equal(USER0);
    });

    it("should be able to query for a payment", async () => {
      await oldColony.addPayment(1, UINT256_MAX, USER1, token.address, WAD, 1, localSkillId, { from: USER0 });
      await upgradeColonyOnceThenToLatest(oldColony);

      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);

      expect(payment.recipient).to.equal(USER1);
      expect(payment.domainId).to.eq.BN(1);
    });

    it("should be able to transfer funds allocated to a task back to the domain", async () => {
      await fundColonyWithTokens(colony, token, WAD);

      await oldColony.makeTask(1, UINT256_MAX, SPECIFICATION_HASH, 1, localSkillId, 0, { from: USER0 });
      const taskId = await colony.getTaskCount();
      const { fundingPotId, status } = await colony.getTask(taskId);

      expect(status).to.eq.BN(0); // Active

      // Move funds into task funding pot
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, fundingPotId, WAD, token.address);
      await upgradeColonyOnceThenToLatest(oldColony);
      // Move funds back
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, fundingPotId, 1, WAD, token.address);
    });

    it("should be able to transfer funds allocated to a payment back to the domain", async () => {
      await fundColonyWithTokens(colony, token, WAD);

      await oldColony.addPayment(1, UINT256_MAX, USER1, token.address, WAD, 1, localSkillId, { from: USER0 });
      const paymentId = await colony.getPaymentCount();
      const { fundingPotId, finalized } = await colony.getPayment(paymentId);

      expect(finalized).to.be.false;

      // Move funds into task funding pot
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, fundingPotId, WAD, token.address);
      await upgradeColonyOnceThenToLatest(oldColony);
      // Move funds back
      await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, fundingPotId, 1, WAD, token.address);
    });
  });

  describe("when setting the token reputation scaling factor", async () => {
    it("can read the reputation rate for a token", async () => {
      const rate = await colony.getTokenReputationRate(token.address);
      expect(rate).to.eq.BN(WAD);
    });

    it("can set the reputation rate up to ten tokens total", async () => {
      let i = ethers.BigNumber.from(1);
      while (i < 10) {
        await colony.setTokenReputationRate(
          ethers.utils.hexZeroPad(i.sub(1).toHexString(), 20),
          ethers.utils.hexZeroPad(i.toHexString(), 20),
          WAD.subn(i.toNumber()),
        );
        i = i.add(1);
      }
      // But not an 11th
      await checkErrorRevert(
        colony.setTokenReputationRate(
          ethers.utils.hexZeroPad(i.sub(1).toHexString(), 20),
          ethers.utils.hexZeroPad(i.toHexString(), 20),
          WAD.subn(i.toNumber()),
        ),
        "colony-max-tokens-already-set",
      );
    });

    it("ordering of tokens is enforced when adding to the list", async () => {
      const i = ethers.BigNumber.from(10);
      await checkErrorRevert(
        colony.setTokenReputationRate(
          ethers.utils.hexZeroPad(i.toHexString(), 20),
          ethers.utils.hexZeroPad(i.sub(1).toHexString(), 20),
          WAD.subn(i.toNumber()),
        ),
        "colony-invalid-token-ordering",
      );
    });

    it("can remove tokens from the list", async () => {
      let i = ethers.BigNumber.from(1);
      while (i < 10) {
        await colony.setTokenReputationRate(
          ethers.utils.hexZeroPad(i.sub(1).toHexString(), 20),
          ethers.utils.hexZeroPad(i.toHexString(), 20),
          WAD.subn(i.toNumber()),
        );
        i = i.add(1);
      }

      let res = await colony.getNextTokenWithReputationRate(ethers.utils.hexZeroPad("0x02", 20));
      expect(res).to.equal(ethers.utils.hexZeroPad("0x03", 20));

      await colony.setTokenReputationRate(ethers.utils.hexZeroPad("0x01", 20), ethers.utils.hexZeroPad("0x02", 20), 0);

      res = await colony.getNextTokenWithReputationRate(ethers.utils.hexZeroPad("0x02", 20));
      expect(res).to.equal(ethers.utils.hexZeroPad("0x00", 20));
    });

    it("can't remove tokens from the list if we don't provide the right previous token", async () => {
      let i = ethers.BigNumber.from(1);
      while (i < 10) {
        await colony.setTokenReputationRate(
          ethers.utils.hexZeroPad(i.sub(1).toHexString(), 20),
          ethers.utils.hexZeroPad(i.toHexString(), 20),
          WAD.subn(i.toNumber()),
        );
        i = i.add(1);
      }

      await checkErrorRevert(
        colony.setTokenReputationRate(ethers.utils.hexZeroPad(i.sub(4).toHexString(), 20), ethers.utils.hexZeroPad(i.toHexString(), 20), 0),
        "colony-token-weighting-not-right-location",
      );
    });

    it("can't remove tokens from the list if there are none to remove", async () => {
      await colony.setTokenReputationRate(ethers.utils.hexZeroPad("0x00", 20), token.address, 0);
      await checkErrorRevert(colony.setTokenReputationRate(ethers.utils.hexZeroPad("0x00", 20), token.address, 0), "colony-no-token-weightings-set");
    });

    it("can update the weight of tokens on the list", async () => {
      let i = ethers.BigNumber.from(1);
      while (i < 10) {
        await colony.setTokenReputationRate(
          ethers.utils.hexZeroPad(i.sub(1).toHexString(), 20),
          ethers.utils.hexZeroPad(i.toHexString(), 20),
          WAD.subn(i.toNumber()),
        );
        i = i.add(1);
      }

      let res = await colony.getTokenReputationRate(ethers.utils.hexZeroPad("0x02", 20));
      expect(res).to.be.eq.BN(WAD.subn(2));

      await colony.setTokenReputationRate(ethers.utils.hexZeroPad("0x01", 20), ethers.utils.hexZeroPad("0x02", 20), 100);

      res = await colony.getTokenReputationRate(ethers.utils.hexZeroPad("0x02", 20));
      expect(res).to.be.eq.BN(100);
    });
  });
});
