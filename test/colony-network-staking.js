/* globals artifacts */
import { forwardTime, checkErrorRevert } from "../helpers/test-helper";
import { giveUserCLNYTokens, setupRatedTask, fundColonyWithTokens } from "../helpers/test-data-generator";

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

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const commonColonyAddress = await colonyNetwork.getColony("Common Colony");
    commonColony = IColony.at(commonColonyAddress);
    const clnyAddress = await commonColony.getToken.call();
    clny = Token.at(clnyAddress);
    await colonyNetwork.startNextCycle();
  });

  async function accommodateChallengeAndInvalidateHash(test, round, idx, respondToChallenge = true) {
    // Have our opponent respond to the challenge asked for
    const reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
    if (respondToChallenge) {
      const oppIdx = idx % 2 === 1 ? idx - 1 : idx + 1;
      await repCycle.respondToChallenge(round, oppIdx);
      await forwardTime(600, test);
    }
    return repCycle.invalidateHash(round, idx);
  }

  afterEach(async () => {
    // Withdraw all stakes. Can only do this at the start of a new cycle, if anyone has submitted a hash in this current cycle.
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
      await forwardTime(3600, this);
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
      await forwardTime(3600);
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
      await repCycle.confirmNewHash(1);
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash.call();
      assert.equal(rootHash, "0x1234567800000000000000000000000000000000000000000000000000000000");
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes.call();
      assert(rootHashNNodes.equals(10));
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 11, 10, { from: OTHER_ACCOUNT });
      await repCycle.submitNewHash("0x99999999", 12, 10, { from: accounts[2] });
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
      await accommodateChallengeAndInvalidateHash(this, 0, 3, false); // Invalidate the 'null' that partners the third hash submitted
      // No response to a challenge required.
      await accommodateChallengeAndInvalidateHash(this, 1, 0);
      await repCycle.confirmNewHash(2);
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr !== addr);
      const rootHash = await colonyNetwork.getReputationRootHash.call();
      assert.equal(rootHash, "0x9999999900000000000000000000000000000000000000000000000000000000");
      const rootHashNNodes = await colonyNetwork.getReputationRootHashNNodes.call();
      assert(rootHashNNodes.equals(12));
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await checkErrorRevert(repCycle.confirmNewHash(0));
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr === addr);
      // Eliminate one so that the afterAll works.
      await accommodateChallengeAndInvalidateHash(this, 0, 0);
    });

    it("should not allow the last reputation hash to be eliminated", async () => {
      await giveUserCLNYTokens(colonyNetwork, MAIN_ACCOUNT, new BN("1000000000000000000"));
      await giveUserCLNYTokens(colonyNetwork, OTHER_ACCOUNT, new BN("1000000000000000000"));

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, 1, 1, false));
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

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: accounts[2] });
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
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

    it("should cope with many hashes being submitted and eliminated before a winner is assigned", async () => {
      // TODO: This test probably needs to be written more carefully to make sure all possible edge cases are dealt with
      for (let i = 0; i < accounts.length; i += 1) {
        await giveUserCLNYTokens(colonyNetwork, accounts[i], "1000000000000000000"); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }
      await Promise.all(accounts.map(addr => clny.approve(colonyNetwork.address, "1000000000000000000", { from: addr })));
      await Promise.all(accounts.map(addr => colonyNetwork.deposit("1000000000000000000", { from: addr })));

      const reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(3600, this);
      await Promise.all(accounts.map(addr => repCycle.submitNewHash(addr, 10, 1, { from: addr })));
      // We're submitting hashes equal to their addresses for ease, though they will get zero padded.

      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      let nRemainingHashes = nSubmittedHashes.toNumber();
      let cycle = 0;
      while (nRemainingHashes > 1) {
        for (let i = 0; i < nRemainingHashes; i += 1) {
          if (i % 2 === 0) {
            // If we're the odd-one-out in a round, we get a bye, and our opponent doesn't need to respond
            // to a challenge.
            const responseToChallengeNeeded = i + 1 !== nRemainingHashes;
            await accommodateChallengeAndInvalidateHash(this, cycle, i + 1, responseToChallengeNeeded); // eslint-disable-line no-await-in-loop
            // These could all be done simultaneously, but the one-liner with Promise.all is very hard to read.
            // It involved spread syntax and everything. If someone can come up with an easy-to-read version, I'll
            // be all for it
          }
        }
        cycle += 1;
        const nInvalidatedHashes = await repCycle.nInvalidatedHashes.call(); // eslint-disable-line no-await-in-loop
        nRemainingHashes = nSubmittedHashes.sub(nInvalidatedHashes).toNumber();
      }
      await repCycle.confirmNewHash(cycle);
    });

    it("should prevent a hash from advancing if it might still get an opponent", async () => {
      assert(accounts.length >= 8, "Not enough accounts for test to run");
      const accountsForTest = accounts.slice(0, 8);
      for (let i = 0; i < 8; i += 1) {
        await giveUserCLNYTokens(colonyNetwork, accountsForTest[i], "1000000000000000000"); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }
      await Promise.all(accountsForTest.map(addr => clny.approve(colonyNetwork.address, "1000000000000000000", { from: addr })));
      await Promise.all(accountsForTest.map(addr => colonyNetwork.deposit("1000000000000000000", { from: addr })));

      const reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
      await forwardTime(3600, this);
      await Promise.all(accountsForTest.map(addr => repCycle.submitNewHash(addr, 10, 1, { from: addr })));
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
      await accommodateChallengeAndInvalidateHash(this, 0, 3);
      await accommodateChallengeAndInvalidateHash(this, 0, 5);
      await accommodateChallengeAndInvalidateHash(this, 1, 1);
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, 1, 3, false));
      // Now clean up
      await accommodateChallengeAndInvalidateHash(this, 0, 7);
      await accommodateChallengeAndInvalidateHash(this, 1, 3);
      await accommodateChallengeAndInvalidateHash(this, 2, 1);
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, 0, 1));
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await repCycle.submitNewHash("0x99999999", 10, 10, { from: accounts[2] });
      await forwardTime(600, this);
      await accommodateChallengeAndInvalidateHash(this, 0, 1, false);
      await accommodateChallengeAndInvalidateHash(this, 0, 3, false);
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await checkErrorRevert(repCycle.invalidateHash(0, 1));
      await checkErrorRevert(repCycle.confirmNewHash(1));
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await repCycle.respondToChallenge(0, 1);
      await repCycle.respondToChallenge(0, 0);
      await repCycle.respondToChallenge(0, 0);
      await repCycle.respondToChallenge(0, 1);
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await accommodateChallengeAndInvalidateHash(this, 0, 0);
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
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 11, 10, { from: OTHER_ACCOUNT });
      await repCycle.submitNewHash("0x99999999", 12, 10, { from: accounts[2] });
      await accommodateChallengeAndInvalidateHash(this, 0, 1);
      await accommodateChallengeAndInvalidateHash(this, 0, 3, false); // Invalidate the 'null' that partners the third hash submitted
      // No response to a challenge required.
      await checkErrorRevert(accommodateChallengeAndInvalidateHash(this, 1, 2, false));
      // Cleanup after test
      await accommodateChallengeAndInvalidateHash(this, 1, 0);
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

    it("should abort if a deposit did not complete correctly");
  });
});
