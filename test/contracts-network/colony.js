/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import {
  IPFS_HASH,
  UINT256_MAX,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  WAD,
} from "../../helpers/constants";
import { getTokenArgs, web3GetBalance, checkErrorRevert, encodeTxData, expectNoEvent, expectAllEvents, expectEvent } from "../../helpers/test-helper";
import { makeTask, setupRandomColony } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const CoinMachine = artifacts.require("CoinMachine");
const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const ITokenLocking = artifacts.require("ITokenLocking");
const TransferTest = artifacts.require("TransferTest");
const Token = artifacts.require("Token");

contract("Colony", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;

  const USER0 = accounts[0];

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

      await expectEvent(colony.mintTokens(100), "TokensMinted", [colony.address, 100]);
      await expectEvent(colony.mintTokensFor(accounts[0], 100), "TokensMinted", [accounts[0], 100]);
    });

    it("should fail if a non-admin tries to mint tokens", async () => {
      await checkErrorRevert(colony.mintTokens(100, { from: accounts[3] }), "ds-auth-unauthorized");
    });

    it("should not allow reinitialisation", async () => {
      await checkErrorRevert(
        colony.initialiseColony(ethers.constants.AddressZero, ethers.constants.AddressZero),
        "colony-already-initialised-network"
      );
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

      // A root skill should have been created for the Colony
      const rootLocalSkillId = await colonyNetwork.getSkillCount();
      expect(domain.skillId).to.eq.BN(rootLocalSkillId);
    });

    it("should be able to make arbitrary transactions", async () => {
      const action = await encodeTxData(token, "mint", [WAD]);
      const balancePre = await token.balanceOf(colony.address);

      await colony.makeArbitraryTransaction(token.address, action);

      const balancePost = await token.balanceOf(colony.address);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD);
    });

    it("should not be able to make arbitrary transactions if not root", async () => {
      const action = await encodeTxData(token, "mint", [WAD]);

      await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action, { from: accounts[1] }), "ds-auth-unauthorized");
    });

    it("should not be able to make arbitrary transactions to a user address", async () => {
      await checkErrorRevert(colony.makeArbitraryTransaction(accounts[0], "0x0"), "colony-to-must-be-contract");
    });

    it("should not be able to make arbitrary transactions to network or token locking", async () => {
      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const tokenLocking = await ITokenLocking.at(tokenLockingAddress);

      const action1 = await encodeTxData(colonyNetwork, "addSkill", [0]);
      const action2 = await encodeTxData(tokenLocking, "lockToken", [token.address]);

      await checkErrorRevert(colony.makeArbitraryTransaction(colonyNetwork.address, action1), "colony-cannot-target-network");
      await checkErrorRevert(colony.makeArbitraryTransaction(tokenLocking.address, action2), "colony-cannot-target-token-locking");
    });

    it("should not be able to make arbitrary transactions to transfer tokens", async () => {
      const action1 = await encodeTxData(token, "approve", [USER0, WAD]);
      const action2 = await encodeTxData(token, "transfer", [USER0, WAD]);

      await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action1), "colony-cannot-call-erc20-approve");
      await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action2), "colony-cannot-call-erc20-transfer");
    });

    it("should not be able to make arbitrary transactions to the colony's own extensions", async () => {
      const COIN_MACHINE = soliditySha3("CoinMachine");
      await colony.installExtension(COIN_MACHINE, 1);

      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
      const coinMachine = await CoinMachine.at(coinMachineAddress);
      await coinMachine.initialise(ethers.constants.AddressZero, 60 * 60, 10, WAD.muln(100), WAD.muln(200), UINT256_MAX, WAD);

      const action = await encodeTxData(coinMachine, "buyTokens", [WAD]);

      await checkErrorRevert(colony.makeArbitraryTransaction(coinMachine.address, action), "colony-cannot-target-extensions");

      // But other colonies can
      const { colony: otherColony } = await setupRandomColony(colonyNetwork);
      await otherColony.makeArbitraryTransaction(coinMachine.address, action);
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
  });

  describe("when adding domains", () => {
    it("should log DomainAdded and FundingPotAdded and DomainMetadata events", async () => {
      let tx = await colony.addDomain(1, UINT256_MAX, 1);
      let domainCount = await colony.getDomainCount();
      await expectEvent(tx, "DomainAdded", [domainCount]);
      let fundingPotCount = await colony.getFundingPotCount();
      await expectEvent(tx, "FundingPotAdded", [fundingPotCount]);
      await expectNoEvent(tx, "DomainMetadata");

      tx = await colony.addDomain(1, UINT256_MAX, 1, IPFS_HASH);
      domainCount = await colony.getDomainCount();
      await expectEvent(tx, "DomainAdded", [domainCount]);
      fundingPotCount = await colony.getFundingPotCount();
      await expectEvent(tx, "FundingPotAdded", [fundingPotCount]);
      await expectEvent(tx, "DomainMetadata", [domainCount, IPFS_HASH]);
    });
  });

  describe("when editing domains", () => {
    it("should log the DomainMetadata event", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      const domainCount = await colony.getDomainCount();
      await expectEvent(colony.editDomain(1, 0, 2, IPFS_HASH), "DomainMetadata", [domainCount, IPFS_HASH]);
    });

    it("should not log the DomainMetadata event if empty string passed", async () => {
      await colony.addDomain(1, UINT256_MAX, 1);
      await expectNoEvent(colony.editDomain(1, 0, 2, ""), "DomainMetadata");
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [WAD.muln(5), WAD.muln(4), WAD.muln(3), WAD.muln(2)];
    const INITIAL_ADDRESSES = accounts.slice(0, 4);

    it("should assign reputation correctly", async () => {
      const skillCount = await colonyNetwork.getSkillCount();

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
      expect(updateLog.skillId).to.eq.BN(skillCount);
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
          from: accounts[1],
        }),
        "ds-auth-unauthorized"
      );
    });

    it("should not allow bootstrapping if colony is not in bootstrap state", async () => {
      await colony.mintTokens(WAD.muln(14));
      await makeTask({ colony });
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
      await checkErrorRevert(colony.setRewardInverse(234, { from: accounts[1] }), "ds-auth-unauthorized");
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
      await expectEvent(tx2, "Annotation", [tx1.tx, USER0, "annotation"]);
    });
  });
});
