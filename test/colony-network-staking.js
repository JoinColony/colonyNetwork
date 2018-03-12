/* globals artifacts */
import { forwardTime, checkErrorRevert } from "../helpers/test-helper";
import { giveUserCLNYTokens, setupRatedTask, fundColonyWithTokens } from "../helpers/test-data-generator";
import { ReputationMiningClient } from "../client/main";
import { MaliciousReputationMiningClient } from "../client/malicious";

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const ReputationMiningCycle = artifacts.require("ReputationMiningCycle");

const BN = require("bn.js");

contract("ColonyNetworkStaking", accounts => {
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];

  let commonColony;
  let colonyNetwork;
  let clny;
  let goodClient;
  let badClient;
  let badClient2;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const commonColonyAddress = await colonyNetwork.getColony("Common Colony");
    commonColony = IColony.at(commonColonyAddress);
    clny = await Token.new("Colony Network Token", "CLNY", 18);
    await commonColony.setToken(clny.address);
    await clny.setOwner(commonColony.address);
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    goodClient = new ReputationMiningClient(MAIN_ACCOUNT);
    badClient = new MaliciousReputationMiningClient(OTHER_ACCOUNT, 0, 0xfffffffff); // Mess up the first calculation. There will always be one.
    badClient2 = new MaliciousReputationMiningClient(accounts[2], 0, 0xeeeeeeeee); // Mess up the first calculation. There will always be one.
    await goodClient.initialise(colonyNetwork.address);
    await badClient.initialise(colonyNetwork.address);
    await badClient2.initialise(colonyNetwork.address);

    // Kick off reputation mining.
    // TODO: Tests for the first reputation cycle (when log empty) should be done in another file
    await testDataGenerator.giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));

    await clny.approve(colonyNetwork.address, "1000000000000000000");
    await colonyNetwork.deposit("1000000000000000000");

    const addr = await colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(addr);
    await testHelper.forwardTime(3600, this);
    await repCycle.submitNewHash("0x0", 0, 10);
    await repCycle.confirmNewHash(0);
    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const stakedBalance = await colonyNetwork.getStakedBalance.call(MAIN_ACCOUNT);
    await colonyNetwork.withdraw(stakedBalance.toNumber());
    const userBalance = await clny.balanceOf.call(MAIN_ACCOUNT);
    await clny.transfer(0x0, userBalance, { from: MAIN_ACCOUNT });
  });

  async function accommodateChallengeAndInvalidateHash(test, client1, client2) {
    const reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
    let round2;
    let idx2;
    let toInvalidateIdx;
    const [round1, idx1] = await client1.getMySubmissionRoundAndIndex();
    const submission1before = await repCycle.disputeRounds(round1.toString(), idx1.toString());
    // Submit JRH for submission 1 if needed
    if (submission1before[4] === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      await client1.submitJustificationRootHash();
    }
    if (client2 !== undefined) {
      [round2, idx2] = await client2.getMySubmissionRoundAndIndex();
      assert(round1.eq(round2), "Clients do not have submissions in the same round");
      const submission2before = await repCycle.disputeRounds(round2.toString(), idx2.toString());

      assert(
        idx1
          .sub(idx2)
          .abs()
          .eqn(1),
        "Clients are not facing each other in this round"
      );
      if (submission2before[4] === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        await client2.submitJustificationRootHash();
      }
      // Loop while doing the binary search, checking we were successful at each point
      // Binary search will error when it is complete.
      let noError = true;
      while (noError) {
        try {
          await client1.respondToBinarySearchForChallenge(); // eslint-disable-line no-await-in-loop
        } catch (err) {
          noError = false;
        }
        try {
          await client2.respondToBinarySearchForChallenge(); // eslint-disable-line no-await-in-loop
        } catch (err) {
          noError = false;
        }
      }
      // Respond to the challenge - usually, only one of these should work.
      // If both work, then the starting reputation is 0 and one client is lying
      // about whether the key already exists.
      noError = true;
      try {
        await client1.respondToChallenge();
      } catch (err) {
        // console.log(err);
        // We are expecting an error here or below, but we don't need to do anything about it.
      }
      try {
        await client2.respondToChallenge();
      } catch (err) {
        // console.log(err);
        // We are expecting an error here or above, but we don't need to do anything about it.
      }
      // Work out which submission is to be invalidated.
      const submission1 = await repCycle.disputeRounds(round1.toString(), idx1.toString());
      const challengeStepsCompleted1 = new BN(submission1[3].toString());
      const submission2 = await repCycle.disputeRounds(round2.toString(), idx2.toString());
      const challengeStepsCompleted2 = new BN(submission2[3].toString());
      if (challengeStepsCompleted1.gt(challengeStepsCompleted2)) {
        toInvalidateIdx = idx2;
      } else {
        // Note that if they're equal, they're both going to be invalidated, so we can call
        // either
        toInvalidateIdx = idx1;
      }
      // Forward time, so that whichever has failed to respond by now has timed out.
      await forwardTime(600, test);
    } else {
      // idx1.modn returns a javascript number, which is surprising!
      toInvalidateIdx = idx1.modn(2) === 1 ? idx1.subn(1) : idx1.addn(1);
    }
    await repCycle.invalidateHash(round1.toString(), toInvalidateIdx.toString());
  }

  afterEach(async () => {
    // Finish the current cycle. Can only do this at the start of a new cycle, if anyone has submitted a hash in this current cycle.
    const addr = await colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(addr);
    let nSubmittedHashes = await repCycle.nSubmittedHashes.call();
    nSubmittedHashes = nSubmittedHashes.toNumber();
    if (nSubmittedHashes > 0) {
      let nInvalidatedHashes = await repCycle.nInvalidatedHashes.call();
      nInvalidatedHashes = nInvalidatedHashes.toNumber();
      if (nSubmittedHashes - nInvalidatedHashes === 1) {
        await repCycle.confirmNewHash(nSubmittedHashes === 1 ? 0 : 1); // Not a general solution - only works for one or two submissions.
        // But for now, that's okay.
      } else {
        // We shouldn't get here. If this fires during a test, you haven't finished writing the test.
        console.log("We're mid dispute process, and can't untangle from here"); // eslint-disable-line no-console
        // process.exit(1);
        return;
      }
    }

    // Actually do the withdrawal.
    await Promise.all(
      accounts.map(async address => {
        const stakedBalance = await colonyNetwork.getStakedBalance.call(address);
        if (stakedBalance.toNumber() > 0) {
          await colonyNetwork.withdraw(stakedBalance.toNumber(), { from: address });
        }
        const userBalance = await clny.balanceOf.call(address);
        return clny.transfer(0x0, userBalance, { from: address });
      })
    );
  });

  describe("when initialised", () => {
    it("should allow miners to stake CLNY", async () => {
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 5000, { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit(5000, { from: OTHER_ACCOUNT });
      const userBalance = await clny.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 4000);
      const stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 5000);
    });

    it("should allow miners to withdraw staked CLNY", async () => {
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 5000, { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit(5000, { from: OTHER_ACCOUNT });
      await colonyNetwork.withdraw(5000, { from: OTHER_ACCOUNT });
      const stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to deposit more CLNY than they have", async () => {
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 10000, { from: OTHER_ACCOUNT });
      await checkErrorRevert(colonyNetwork.deposit(10000, { from: OTHER_ACCOUNT }));
      const userBalance = await clny.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 9000);
      const stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to withdraw more CLNY than they staked, even if enough has been staked total", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, 9000);
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 9000, { from: OTHER_ACCOUNT });
      await clny.approve(colonyNetwork.address, 9000, { from: MAIN_ACCOUNT });
      await colonyNetwork.deposit(9000, { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit(9000, { from: MAIN_ACCOUNT });
      await checkErrorRevert(colonyNetwork.withdraw(10000, { from: OTHER_ACCOUNT }));
      const stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 9000);
      const userBalance = await clny.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 0);
    });

    it("should allow a new reputation hash to be submitted", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      const submitterAddress = await repCycle.submittedHashes.call("0x12345678", 10, 0);
      assert.equal(submitterAddress, MAIN_ACCOUNT);
    });

    it("should not allow someone to submit a new reputation hash if they are not staking", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600);
      const repCycle = ReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 0));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(0));
    });

    it("should not allow someone to withdraw their stake if they have submitted a hash this round", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      let stakedBalance = await colonyNetwork.getStakedBalance.call(MAIN_ACCOUNT);
      await checkErrorRevert(colonyNetwork.withdraw(stakedBalance.toNumber(), { from: MAIN_ACCOUNT }));
      stakedBalance = await colonyNetwork.getStakedBalance.call(MAIN_ACCOUNT);
      assert(stakedBalance.equals("1000000000000000000"));
    });

    it("should allow a new reputation hash to be set if only one was submitted", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash.call();
      assert.equal(rootHash, "0x1234567800000000000000000000000000000000000000000000000000000000");
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes.call();
      assert(rootHashNNodes.equals(10));
    });

    it("should allow a new reputation hash to be set if all but one submitted have been elimintated", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, new BN("1000000000000000000"));

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash.call();
      const clientRootHash = await goodClient.getRootHash();
      assert.equal(rootHash, clientRootHash);
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes.call();
      assert.equal(rootHashNNodes.toString(), goodClient.nReputations.toString());
    });

    it("should allow a new reputation hash to be moved to the next stage of competition even if it does not have a partner", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: accounts[2] });
      await colonyNetwork.deposit("1000000000000000000", { from: accounts[2] });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();
      await badClient2.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();
      await badClient2.submitRootHash();
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await accommodateChallengeAndInvalidateHash(this, badClient2); // Invalidate the 'null' that partners the third hash submitted.
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient2);

      await repCycle.confirmNewHash(2);
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash.call();
      const clientRootHash = await goodClient.getRootHash();
      assert.equal(rootHash, clientRootHash);
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes.call();
      assert.equal(rootHashNNodes.toString(), goodClient.nReputations.toString());
    });

    it("should not allow a new reputation hash to be set if more than one was submitted and they have not been elimintated", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await checkErrorRevert(repCycle.confirmNewHash(0));
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr === addr);
      // Eliminate one so that the afterAll works.
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
    });

    it("should not allow the last reputation hash to be eliminated", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, new BN("1000000000000000000"));

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      await forwardTime(3600, this);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, goodClient));
    });

    it("should not allow someone to submit a new reputation hash if they are ineligible", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 10));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(0));
    });

    it("should punish all stakers if they misbehave (and report a bad hash)", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      let balance = await colonyNetwork.getStakedBalance(OTHER_ACCOUNT);
      assert(balance.equals("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: accounts[2] });
      await colonyNetwork.deposit("1000000000000000000", { from: accounts[2] });
      let balance2 = await colonyNetwork.getStakedBalance(accounts[2]);
      assert(balance.equals("1000000000000000000"));

      await forwardTime(3600, this);

      // We want badclient2 to submit the same hash as badclient for this test.
      badClient2 = new MaliciousReputationMiningClient(accounts[2], 0, "0xfffffffff");
      badClient2.initialise(colonyNetwork.address);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();
      await badClient2.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();
      await badClient2.submitRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      balance = await colonyNetwork.getStakedBalance(OTHER_ACCOUNT);
      assert.equal(balance.toString(), "0", "Account was not punished properly");
      balance2 = await colonyNetwork.getStakedBalance(accounts[2]);
      assert.equal(balance2.toString(), "0", "Account was not punished properly");
    });

    it("should reward all stakers if they submitted the agreed new hash", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x12345678", 10, 8, { from: OTHER_ACCOUNT });
      await repCycle.confirmNewHash(0);

      // Check that they have had their staked balance increase
      const balance1Updated = await colonyNetwork.getStakedBalance(MAIN_ACCOUNT);
      assert.equal(balance1Updated.toString(), new BN("2").mul(new BN("10").pow(new BN("18"))).toString(), "Account was not rewarded properly");
      const balance2Updated = await colonyNetwork.getStakedBalance(OTHER_ACCOUNT);
      assert.equal(balance2Updated.toString(), new BN("2").mul(new BN("10").pow(new BN("18"))).toString(), "Account was not rewarded properly");

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(0, true);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "0");

      repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(1, true);
      assert.equal(repLogEntryMiner[0], OTHER_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "4");

      const reputationUpdateLogLength = await colonyNetwork.getReputationUpdateLogLength(true);
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });

    it("should not allow a user to back more than one hash in a single cycle", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await checkErrorRevert(repCycle.submitNewHash("0x87654321", 10, 10));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
    });

    it("should not allow a user to back the same hash with different number of nodes in a single cycle", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);

      await checkErrorRevert(repCycle.submitNewHash("0x12345678", 11, 9));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
    });

    it("should not allow a user to submit the same entry for the same hash twice in a single cycle", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 10));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
    });

    it("should allow a user to back the same hash more than once in a same cycle with different entries, and be rewarded", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x12345678", 10, 9);
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
      await repCycle.confirmNewHash(0);

      // Check that they have had their staked balance increase
      const balance1Updated = await colonyNetwork.getStakedBalance(MAIN_ACCOUNT);
      assert.equal(balance1Updated.toString(), new BN("3").mul(new BN("10").pow(new BN("18"))).toString(), "Account was not rewarded properly");

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(0, true);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "0");

      repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(1, true);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "4");

      const reputationUpdateLogLength = await colonyNetwork.getReputationUpdateLogLength(true);
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });

    it("should only allow 12 entries to back a single hash in each cycle", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 1);
      await repCycle.submitNewHash("0x12345678", 10, 2);
      await repCycle.submitNewHash("0x12345678", 10, 3);
      await repCycle.submitNewHash("0x12345678", 10, 4);
      await repCycle.submitNewHash("0x12345678", 10, 5);
      await repCycle.submitNewHash("0x12345678", 10, 6);
      await repCycle.submitNewHash("0x12345678", 10, 7);
      await repCycle.submitNewHash("0x12345678", 10, 8);
      await repCycle.submitNewHash("0x12345678", 10, 9);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x12345678", 10, 11);
      await repCycle.submitNewHash("0x12345678", 10, 12);
      await checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 13));
    });

    it("should cope with many hashes being submitted and eliminated before a winner is assigned", async function manySubmissionTest() {
      this.timeout(100000000);
      // TODO: This test probably needs to be written more carefully to make sure all possible edge cases are dealt with
      for (let i = 0; i < accounts.length; i += 1) {
        await giveUserCLNYTokens(colonyNetwork, accounts[i], "1000000000000000000"); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }

      await Promise.all(accounts.map(addr => clny.approve(colonyNetwork.address, "1000000000000000000", { from: addr })));
      await Promise.all(accounts.map(addr => colonyNetwork.deposit("1000000000000000000", { from: addr })));

      // We need to complete the current reputation cycle so that all the required log entries are present
      let reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
      let repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x0", 0, 10);
      await repCycle.confirmNewHash(0);
      const clients = await Promise.all(
        accounts.map(async (addr, index) => {
          const client = new MaliciousReputationMiningClient(addr, accounts.length - index, index);
          // Each client will get a different reputation update entry wrong by a different amount, apart from the first one which
          // will submit a correct hash.
          await client.initialise(colonyNetwork.address);
          return client;
        })
      );

      reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(3600, this);
      for (let i = 0; i < clients.length; i += 1) {
        // Doing these individually rather than in a big loop because with many instances of the EVM
        // churning away at once, I *think* it's slower.
        await clients[i].addLogContentsToReputationTree(); // eslint-disable-line no-await-in-loop
        await clients[i].submitRootHash(); // eslint-disable-line no-await-in-loop
        await clients[i].submitJustificationRootHash(); // eslint-disable-line no-await-in-loop
      }

      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      let nRemainingHashes = nSubmittedHashes.toNumber();
      let cycle = 0;
      while (nRemainingHashes > 1) {
        for (let i = 0; i < clients.length; i += 2 * 2 ** cycle) {
          const [client1round] = await clients[i].getMySubmissionRoundAndIndex(); // eslint-disable-line no-await-in-loop
          let client2round = new BN("-1");
          let client2idx = i;
          while (!client1round.eq(client2round)) {
            client2idx += 2 ** cycle;
            if (!clients[client2idx]) {
              break;
            }
            [client2round] = await clients[client2idx].getMySubmissionRoundAndIndex(); // eslint-disable-line no-await-in-loop
          }
          await accommodateChallengeAndInvalidateHash(this, clients[i], clients[client2idx]); // eslint-disable-line no-await-in-loop
          // These could all be done simultaneously, but the one-liner with Promise.all is very hard to read.
          // It involved spread syntax and everything. If someone can come up with an easy-to-read version, I'll
          // be all for it
        }
        cycle += 1;
        const nInvalidatedHashes = await repCycle.nInvalidatedHashes.call(); // eslint-disable-line no-await-in-loop
        nRemainingHashes = nSubmittedHashes.sub(nInvalidatedHashes).toNumber();
      }
      await repCycle.confirmNewHash(cycle);
    });

    it("should prevent a hash from advancing if it might still get an opponent", async function advancingTest() {
      this.timeout(10000000);
      assert(accounts.length >= 8, "Not enough accounts for test to run");
      const accountsForTest = accounts.slice(0, 8);
      for (let i = 0; i < 8; i += 1) {
        await giveUserCLNYTokens(colonyNetwork, accountsForTest[i], "1000000000000000000"); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }
      await Promise.all(accountsForTest.map(addr => clny.approve(colonyNetwork.address, "1000000000000000000", { from: addr })));
      await Promise.all(accountsForTest.map(addr => colonyNetwork.deposit("1000000000000000000", { from: addr })));

      // We need to complete the current reputation cycle so that all the required log entries are present
      let reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
      let repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x0", 0, 10);
      await repCycle.confirmNewHash(0);

      const clients = await Promise.all(
        accountsForTest.map(async (addr, index) => {
          const client = new MaliciousReputationMiningClient(addr, accountsForTest.length - index, index);
          // Each client will get a different reputation update entry wrong by a different amount, apart from the first one which
          // will submit a correct hash.
          await client.initialise(colonyNetwork.address);
          return client;
        })
      );

      reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(3600, this);
      for (let i = 0; i < clients.length; i += 1) {
        // Doing these individually rather than in a big loop because with many instances of the EVM
        // churning away at once, I *think* it's slower.
        await clients[i].addLogContentsToReputationTree(); // eslint-disable-line no-await-in-loop
        await clients[i].submitRootHash(); // eslint-disable-line no-await-in-loop
        await clients[i].submitJustificationRootHash(); // eslint-disable-line no-await-in-loop
      }

      await forwardTime(3600, this);
      await accommodateChallengeAndInvalidateHash(this, clients[0], clients[1]);
      await accommodateChallengeAndInvalidateHash(this, clients[2], clients[3]);
      await accommodateChallengeAndInvalidateHash(this, clients[4], clients[5]);
      await accommodateChallengeAndInvalidateHash(this, clients[0], clients[2]); // This is the first pairing in round 2
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, clients[4]));
      // Now clean up
      await accommodateChallengeAndInvalidateHash(this, clients[6], clients[7]);
      await accommodateChallengeAndInvalidateHash(this, clients[4], clients[6]);
      await accommodateChallengeAndInvalidateHash(this, clients[0], clients[4]);
      await repCycle.confirmNewHash(3);
    });

    it("should not allow a hash to be invalidated multiple times, which would move extra copies of its opponent to the next stage", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(repCycle.invalidateHash(0, 1));
    });

    it("should invalidate a hash and its partner if both have timed out", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: accounts[2] });
      await colonyNetwork.deposit("1000000000000000000", { from: accounts[2] });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();
      await badClient2.addLogContentsToReputationTree();

      await badClient.submitRootHash();
      await badClient2.submitRootHash();
      await goodClient.submitRootHash();

      await forwardTime(600, this);
      await repCycle.invalidateHash(0, 1);
      await accommodateChallengeAndInvalidateHash(this, goodClient);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent invalidation of hashes before they have timed out on a challenge", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await checkErrorRevert(repCycle.invalidateHash(0, 1));
      await checkErrorRevert(repCycle.confirmNewHash(1));
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("should prevent submission of hashes with an invalid entry for the balance of a user", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 1000000000000));
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
    });

    it("should prevent submission of hashes with a valid entry, but invalid hash for the current time", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 1));
    });

    it('should not allow "setReputationRootHash" to be called from an account that is not not reputationMiningCycle', async () => {
      await checkErrorRevert(colonyNetwork.setReputationRootHash("0x000001", 10, [accounts[0], accounts[1]]));
    });

    it('should not allow "punishStakers" to be called from an account that is not not reputationMiningCycle', async () => {
      await checkErrorRevert(colonyNetwork.punishStakers([accounts[0], accounts[1]]));
    });

    it('should not allow "startNextCycle" to be called if a cycle is in progress', async () => {
      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      assert(parseInt(addr, 16) !== 0);
      await checkErrorRevert(colonyNetwork.startNextCycle());
    });

    it("should allow submitted hashes to go through multiple responses to a challenge", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      await goodClient.respondToBinarySearchForChallenge();

      await testHelper.forwardTime(600, this);
      await goodClient.respondToChallenge();
      await repCycle.invalidateHash(0, 1);
      await repCycle.confirmNewHash(1);
    });

    it("should only allow the last hash standing to be confirmed", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      await goodClient.submitJustificationRootHash();
      await badClient.submitJustificationRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await checkErrorRevert(repCycle.confirmNewHash(0));
      await repCycle.confirmNewHash(1);
    });

    it("should fail if one tries to invalidate a hash that does not exist", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: accounts[2] });
      await colonyNetwork.deposit("1000000000000000000", { from: accounts[2] });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);

      await goodClient.addLogContentsToReputationTree();
      await badClient.addLogContentsToReputationTree();
      await badClient2.addLogContentsToReputationTree();

      await goodClient.submitRootHash();
      await badClient.submitRootHash();
      await badClient2.submitRootHash();

      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await accommodateChallengeAndInvalidateHash(this, badClient2);
      await forwardTime(600, this);
      await checkErrorRevert(repCycle.invalidateHash(1, 2));
      // Cleanup after test
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient2);
      await repCycle.confirmNewHash(2);
    });

    it("should keep reputation updates that occur during one update window for the next window", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await fundColonyWithTokens(commonColony, clny, "350000000000000000000");
      const taskId1 = await setupRatedTask({ colonyNetwork, colony: commonColony });
      await commonColony.finalizeTask(taskId1); // Creates an entry in the reputation log for the worker and manager
      const initialRepLogLength = await colonyNetwork.getReputationUpdateLogLength.call(true);
      await repCycle.confirmNewHash(0);
      // This confirmation should freeze the reputation log that we added the above task entries to
      // and move it to the inactive rep log
      const finalRepLogLength = await colonyNetwork.getReputationUpdateLogLength.call(false);
      assert.equal(finalRepLogLength.toNumber(), initialRepLogLength.toNumber());
      // Check the active log now has one entry in it (which will be the rewards for the miner who submitted
      // the accepted hash.
      const activeRepLogLength = await colonyNetwork.getReputationUpdateLogLength.call(true);
      assert.equal(activeRepLogLength.toNumber(), 1);
    });

    it.only("The reputation mining client should insert reputation updates from the log", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      let addr = await colonyNetwork.getReputationMiningCycle.call();
      let repCycle = ReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");
      addr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(addr);
      await forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker (domain and skill), evalutator);
      // That's thirteen in total.
      const nInactiveLogEntries = await colonyNetwork.getReputationUpdateLogLength(false);
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      const client = new ReputationMiningClient();
      await client.initialise(colonyNetwork.address);
      await client.addLogContentsToReputationTree();

      // Check the client's tree has three entries.
      assert.equal(Object.keys(client.reputations).length, 4);
      // These should be:
      // 1. Reputation reward for MAIN_ACCOUNT for submitting the previous reputaiton hash
      //   (currently skill 0, needs to change to indicate a special mining skill)
      let key1 = `0x${new BN(commonColony.address.slice(2), 16).toString(16, 40)}`; // Colony address as bytes
      key1 += `${new BN("0").toString(16, 64)}`; // SkillId as uint256
      key1 += `${new BN(MAIN_ACCOUNT.slice(2), 16).toString(16, 40)}`; // User address as bytes
      assert.equal(
        client.reputations[key1],
        "0x0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000001"
      );
      // 2. Reputation reward for MAIN_ACCOUNT for being the manager for the tasks created by giveUserCLNYTokens
      let key2 = `0x${new BN(commonColony.address.slice(2), 16).toString(16, 40)}`;
      key2 += `${new BN("1").toString(16, 64)}`;
      key2 += `${new BN(MAIN_ACCOUNT.slice(2), 16).toString(16, 40)}`;
      assert.equal(
        client.reputations[key2],
        "0x00000000000000000000000000000000000000000000000010a741a4627800000000000000000000000000000000000000000000000000000000000000000002"
      );
      // 3. Reputation reward for OTHER_ACCOUNT for being the evaluator for the tasks created by giveUserCLNYTokens
      let key3 = `0x${new BN(commonColony.address.slice(2), 16).toString(16, 40)}`;
      key3 += `${new BN("1").toString(16, 64)}`;
      key3 += `${new BN(OTHER_ACCOUNT.slice(2), 16).toString(16, 40)}`;
      assert.equal(
        client.reputations[key3],
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003"
      );
      // 4. Reputation reward for accounts[2] for being the worker for the tasks created by giveUserCLNYTokens
      // NB at the moment, the reputation reward for the worker is 0.
      let key4 = `0x${new BN(commonColony.address.slice(2), 16).toString(16, 40)}`;
      key4 += `${new BN("1").toString(16, 64)}`;
      key4 += `${new BN(accounts[2].slice(2), 16).toString(16, 40)}`;
      assert.equal(
        client.reputations[key4],
        "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004"
      );
    });

    it("Should allow a user to prove their reputation", async () => {
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      let addr = await colonyNetwork.getReputationMiningCycle.call();
      let repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await testHelper.forwardTime(3600, this);
      addr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x123456789", 10, 10);
      await repCycle.confirmNewHash(0);

      const client = new ReputationMiningClient();
      await client.initialise(colonyNetwork.address);
      await client.addLogContentsToReputationTree();
      const newRootHash = await client.getRootHash();

      await testHelper.forwardTime(3600, this);
      addr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash(newRootHash, 10, 10);
      await repCycle.confirmNewHash(0);
      let key = `0x${new BN(commonColony.address.slice(2), 16).toString(16, 40)}`; // Colony address as bytes
      key += `${new BN("1").toString(16, 64)}`; // SkillId as uint256
      key += `${new BN(MAIN_ACCOUNT.slice(2), 16).toString(16, 40)}`; // User address as bytes

      const value = client.reputations[key];
      const proof = await client.getProof(key);
      const [branchMask, siblings] = proof;
      const validProof = await commonColony.verifyProof(`${key}`, `${value}`, branchMask, siblings);
      assert.equal(validProof, true);
    });

    it("In the event of a disagreement, allows a user to submit a JRH with proofs for a submission", async () => {
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      let addr = await colonyNetwork.getReputationMiningCycle.call();
      let repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");
      addr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker, evaluator);
      // That's seven in total.
      const nInactiveLogEntries = await colonyNetwork.getReputationUpdateLogLength(false);
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      await goodClient.addLogContentsToReputationTree();

      await badClient.addLogContentsToReputationTree();

      let righthash = await goodClient.getRootHash();
      let wronghash = await badClient.getRootHash();
      righthash = await goodClient.getRootHash();
      wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");
      await testHelper.forwardTime(3600, this);

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      const nSubmittedHashes = await repCycle.nSubmittedHashes();
      assert.equal(nSubmittedHashes, 2);
      const submission = await repCycle.disputeRounds(0, 0);
      assert.equal(submission[4], "0x0000000000000000000000000000000000000000000000000000000000000000");
      await testHelper.forwardTime(10, this); // This is just to ensure that the timestamps checked below will be different if JRH was submitted.

      await goodClient.submitJustificationRootHash();
      const submissionAfterJRHSubmitted = await repCycle.disputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      assert.equal(submissionAfterJRHSubmitted[4], jrh);

      // Check 'last response' was updated.
      assert.notEqual(submission[2].toString(), submissionAfterJRHSubmitted[2].toString());

      // Cleanup
      await accommodateChallengeAndInvalidateHash(this, goodClient, badClient);
      await repCycle.confirmNewHash(1);
    });

    it("In the event of a disagreement, allows a binary search between opponents to take place to find their first disagreement", async () => {
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      let addr = await colonyNetwork.getReputationMiningCycle.call();
      let repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);

      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, "1000000000000000000");
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, "1000000000000000000");
      await testDataGenerator.giveUserCLNYTokens(colonyNetwork, accounts[2], "1000000000000000000");
      addr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.confirmNewHash(0);
      addr = await colonyNetwork.getReputationMiningCycle.call();
      repCycle = ReputationMiningCycle.at(addr);

      // The update log should contain the person being rewarded for the previous
      // update cycle, and reputation updates for three task completions (manager, worker, evaluator);
      // That's seven in total.
      const nInactiveLogEntries = await colonyNetwork.getReputationUpdateLogLength(false);
      assert.equal(nInactiveLogEntries.toNumber(), 13);

      await goodClient.addLogContentsToReputationTree();

      badClient = new MaliciousReputationMiningClient(OTHER_ACCOUNT, 4, "0xfffffffff");
      await badClient.initialise(colonyNetwork.address);
      await badClient.addLogContentsToReputationTree();

      let righthash = await goodClient.getRootHash();
      let wronghash = await badClient.getRootHash();
      righthash = await goodClient.getRootHash();
      wronghash = await badClient.getRootHash();
      assert(righthash !== wronghash, "Hashes from clients are equal, surprisingly");
      await testHelper.forwardTime(3600, this);

      await goodClient.submitRootHash();
      await badClient.submitRootHash();

      const nSubmittedHashes = await repCycle.nSubmittedHashes();
      assert.equal(nSubmittedHashes, 2);
      const submission = await repCycle.disputeRounds(0, 0);
      assert.equal(submission[4], "0x0000000000000000000000000000000000000000000000000000000000000000");
      await goodClient.submitJustificationRootHash();
      const submissionAfterJRHSubmitted = await repCycle.disputeRounds(0, 0);
      const jrh = await goodClient.justificationTree.getRootHash();
      assert.equal(submissionAfterJRHSubmitted[4], jrh);
      await badClient.submitJustificationRootHash();
      const badSubmissionAfterJRHSubmitted = await repCycle.disputeRounds(0, 1);
      const badJrh = await badClient.justificationTree.getRootHash();
      assert.equal(badSubmissionAfterJRHSubmitted[4], badJrh);

      let goodSubmission = await repCycle.disputeRounds(0, 0);
      let badSubmission = await repCycle.disputeRounds(0, 1);
      assert.equal(goodSubmission[3].toNumber(), 1); // Challenge steps completed
      assert.equal(goodSubmission[7].toNumber(), 0); // Lower bound for binary search
      assert.equal(goodSubmission[8].toNumber(), 14); // Upper bound for binary search
      assert.equal(badSubmission[3].toNumber(), 1);
      assert.equal(badSubmission[7].toNumber(), 0);
      assert.equal(badSubmission[8].toNumber(), 14);
      await goodClient.respondToBinarySearchForChallenge();

      goodSubmission = await repCycle.disputeRounds(0, 0);
      badSubmission = await repCycle.disputeRounds(0, 1);
      assert.equal(goodSubmission[3].toNumber(), 2);
      assert.equal(goodSubmission[7].toNumber(), 0);
      assert.equal(goodSubmission[8].toNumber(), 14);
      assert.equal(badSubmission[3].toNumber(), 1);
      assert.equal(badSubmission[7].toNumber(), 0);
      assert.equal(badSubmission[8].toNumber(), 14);

      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.disputeRounds(0, 0);
      badSubmission = await repCycle.disputeRounds(0, 1);
      assert.equal(goodSubmission[7].toNumber(), 0);
      assert.equal(goodSubmission[8].toNumber(), 7);
      assert.equal(badSubmission[7].toNumber(), 0);
      assert.equal(badSubmission[8].toNumber(), 7);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.disputeRounds(0, 0);
      badSubmission = await repCycle.disputeRounds(0, 1);
      assert.equal(goodSubmission[7].toNumber(), 4);
      assert.equal(goodSubmission[8].toNumber(), 7);
      assert.equal(badSubmission[7].toNumber(), 4);
      assert.equal(badSubmission[8].toNumber(), 7);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.disputeRounds(0, 0);
      badSubmission = await repCycle.disputeRounds(0, 1);
      assert.equal(goodSubmission[7].toNumber(), 4);
      assert.equal(goodSubmission[8].toNumber(), 5);
      assert.equal(badSubmission[7].toNumber(), 4);
      assert.equal(badSubmission[8].toNumber(), 5);

      await goodClient.respondToBinarySearchForChallenge();
      await badClient.respondToBinarySearchForChallenge();
      goodSubmission = await repCycle.disputeRounds(0, 0);
      badSubmission = await repCycle.disputeRounds(0, 1);
      assert.equal(goodSubmission[7].toNumber(), 5);
      assert.equal(goodSubmission[8].toNumber(), 5);
      assert.equal(badSubmission[7].toNumber(), 5);
      assert.equal(badSubmission[8].toNumber(), 5);

      // TODO: Split off in to  another test here, but can't be bothered to refactor right now.
      await goodClient.respondToChallenge();
      await testHelper.checkErrorRevert(badClient.respondToChallenge());

      // Check
      const goodSubmissionAfterResponseToChallenge = await repCycle.disputeRounds(0, 0);
      const badSubmissionAfterResponseToChallenge = await repCycle.disputeRounds(0, 1);
      assert.equal(goodSubmissionAfterResponseToChallenge[3].sub(badSubmissionAfterResponseToChallenge[3]).toNumber(), 2);
      // checks that challengeStepCompleted is two more for the good submission than the bad one.
      // it's two, because we proved the starting reputation was in the starting reputation state, rather than claiming
      // it was a new reputation not in the tree with value 0.

      await testHelper.forwardTime(600, this);
      await repCycle.invalidateHash(0, 1);
    });

    it("The reputation mining clinent should calculate reputation decay correctly");
    it("should abort if a deposit did not complete correctly");
  });
});
