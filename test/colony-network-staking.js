/* globals artifacts */
import testHelper from "../helpers/test-helper";
import testDataGenerator from "../helpers/test-data-generator";

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const ReputationMiningCycle = artifacts.require("ReputationMiningCycle");

const BN = require("bn.js");

contract("ColonyNetwork", accounts => {
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];

  let commonColony;
  let colonyNetwork;
  let clny;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    // await upgradableContracts.setupColonyVersionResolver(colony, colonyFunding, colonyTask, colonyTransactionReviewer, resolver, colonyNetwork);

    const commonColonyAddress = await colonyNetwork.getColony("Common Colony");
    commonColony = IColony.at(commonColonyAddress);
    // console.log('CC address ', commonColonyAddress);
    const clnyAddress = await commonColony.getToken.call();
    // console.log('CLNY address ', clnyAddress);
    clny = Token.at(clnyAddress);
  });

  before(async () => {
    await colonyNetwork.startNextCycle();
  });

  async function giveUserCLNYTokens(address, _amount) {
    const amount = new BN(_amount);
    const mainStartingBalance = await clny.balanceOf.call(MAIN_ACCOUNT);
    const targetStartingBalance = await clny.balanceOf.call(address);
    await commonColony.mintTokens(amount * 3);
    await commonColony.claimColonyFunds(clny.address);
    const taskId = await testDataGenerator.setupRatedTask(
      colonyNetwork,
      commonColony,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      amount.mul(new BN("2")),
      new BN("0"),
      new BN("0")
    );
    await commonColony.finalizeTask(taskId);
    await commonColony.claimPayout(taskId, 0, clny.address);

    let mainBalance = await clny.balanceOf.call(MAIN_ACCOUNT);
    await clny.transfer(
      0x0,
      mainBalance
        .sub(amount)
        .sub(mainStartingBalance)
        .toString()
    );
    await clny.transfer(address, amount.toString());
    mainBalance = await clny.balanceOf.call(MAIN_ACCOUNT);
    if (address !== MAIN_ACCOUNT) {
      await clny.transfer(0x0, mainBalance.sub(mainStartingBalance).toString());
    }
    const userBalance = await clny.balanceOf.call(address);
    assert.equal(targetStartingBalance.add(amount).toString(), userBalance.toString());
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
    let stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
    if (stakedBalance.toNumber() > 0) {
      await colonyNetwork.withdraw(stakedBalance.toNumber(), { from: OTHER_ACCOUNT });
    }
    stakedBalance = await colonyNetwork.getStakedBalance.call(MAIN_ACCOUNT);
    if (stakedBalance.toNumber() > 0) {
      await colonyNetwork.withdraw(stakedBalance.toNumber(), { from: MAIN_ACCOUNT });
    }
    let userBalance = await clny.balanceOf.call(OTHER_ACCOUNT);
    await clny.transfer(0x0, userBalance, { from: OTHER_ACCOUNT });
    userBalance = await clny.balanceOf.call(MAIN_ACCOUNT);
    await clny.transfer(0x0, userBalance, { from: MAIN_ACCOUNT });
  });

  describe("when initialised", () => {
    it("should allow miners to stake CLNY", async () => {
      await giveUserCLNYTokens(OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 5000, { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit(5000, { from: OTHER_ACCOUNT });
      const userBalance = await clny.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 4000);
      const stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 5000);
    });

    it("should allow miners to withdraw staked CLNY", async () => {
      await giveUserCLNYTokens(OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 5000, { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit(5000, { from: OTHER_ACCOUNT });
      let stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      await colonyNetwork.withdraw(stakedBalance.toNumber(), { from: OTHER_ACCOUNT });
      stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to deposit more CLNY than they have", async () => {
      await giveUserCLNYTokens(OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 10000, { from: OTHER_ACCOUNT });
      await testHelper.checkErrorRevert(colonyNetwork.deposit(10000, { from: OTHER_ACCOUNT }));
      const userBalance = await clny.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 9000);
      const stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 0);
    });

    it("should not allow miners to withdraw more CLNY than they staked, even if enough has been staked total", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, 9000);
      await giveUserCLNYTokens(OTHER_ACCOUNT, 9000);
      await clny.approve(colonyNetwork.address, 9000, { from: OTHER_ACCOUNT });
      await clny.approve(colonyNetwork.address, 9000, { from: MAIN_ACCOUNT });
      await colonyNetwork.deposit(9000, { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit(9000, { from: MAIN_ACCOUNT });
      await testHelper.checkErrorRevert(colonyNetwork.withdraw(10000, { from: OTHER_ACCOUNT }));
      const stakedBalance = await colonyNetwork.getStakedBalance.call(OTHER_ACCOUNT);
      assert.equal(stakedBalance.toNumber(), 9000);
      const userBalance = await clny.balanceOf.call(OTHER_ACCOUNT);
      assert.equal(userBalance.toNumber(), 0);
    });

    // it('should allow a new cycle to start if there is none currently', async function(){
    //   let addr = await colonyNetwork.getReputationMiningCycle.call();
    //   assert(addr==0x0);
    //   await colonyNetwork.startNextCycle();
    //   addr = await colonyNetwork.getReputationMiningCycle.call();
    //   assert(addr!=0x0);
    // })

    it("should allow a new reputation hash to be submitted", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      const submitterAddress = await repCycle.submittedHashes.call("0x12345678", 10, 0);
      assert.equal(submitterAddress, MAIN_ACCOUNT);
    });

    it("should not allow someone to submit a new reputation hash if they are not staking", async () => {
      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600);
      const repCycle = ReputationMiningCycle.at(addr);
      await testHelper.checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 0));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(0));
    });

    it("should not allow someone to withdraw their stake if they have submitted a hash this round", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      let stakedBalance = await colonyNetwork.getStakedBalance.call(MAIN_ACCOUNT);
      await testHelper.checkErrorRevert(colonyNetwork.withdraw(stakedBalance.toNumber(), { from: MAIN_ACCOUNT }));
      stakedBalance = await colonyNetwork.getStakedBalance.call(MAIN_ACCOUNT);
      assert(stakedBalance.equals("1000000000000000000"));
    });

    it("should allow a new reputation hash to be set if only one was submitted", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
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
      await giveUserCLNYTokens(MAIN_ACCOUNT, new BN("1000000000000000000"));
      await giveUserCLNYTokens(OTHER_ACCOUNT, new BN("1000000000000000000"));

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await repCycle.invalidateHash(0, 1);
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
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(accounts[2], "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: accounts[2] });
      await colonyNetwork.deposit("1000000000000000000", { from: accounts[2] });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 11, 10, { from: OTHER_ACCOUNT });
      await repCycle.submitNewHash("0x99999999", 12, 10, { from: accounts[2] });
      await repCycle.invalidateHash(0, 1);
      await repCycle.invalidateHash(0, 3); // Invalidate the 'null' that partners the third hash submitted
      await repCycle.invalidateHash(1, 0);
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
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(OTHER_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });
      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await testHelper.checkErrorRevert(repCycle.confirmNewHash(0));
      const newAddr = await colonyNetwork.getReputationMiningCycle.call();
      assert(newAddr !== 0x0);
      assert(addr !== 0x0);
      assert(newAddr === addr);
      // Eliminate one so that the afterAll works.
      await repCycle.invalidateHash(0, 0);
    });

    it("should not allow the last reputation hash to be eliminated", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, new BN("1000000000000000000"));
      await giveUserCLNYTokens(OTHER_ACCOUNT, new BN("1000000000000000000"));

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await repCycle.invalidateHash(0, 1);
      await testHelper.checkErrorRevert(repCycle.invalidateHash(1, 0));
    });

    it("should not allow someone to submit a new reputation hash if they are ineligible", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, new BN("1000000000000000000"));
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await testHelper.checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 10));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(0));
    });

    it("should punish all stakers if they misbehave (and report a bad hash)", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(accounts[2], "1000000000000000000");

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
      await testHelper.forwardTime(3600, this);
      const repCycle = ReputationMiningCycle.at(addr);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: OTHER_ACCOUNT });
      await repCycle.submitNewHash("0x87654321", 10, 10, { from: accounts[2] });
      await repCycle.invalidateHash(0, 1);
      balance = await colonyNetwork.getStakedBalance(OTHER_ACCOUNT);
      assert.equal(balance.toString(), "0", "Account was not punished properly");
      balance2 = await colonyNetwork.getStakedBalance(accounts[2]);
      assert.equal(balance2.toString(), "0", "Account was not punished properly");
    });

    it("should reward all stakers if they submitted the agreed new hash", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(OTHER_ACCOUNT, "1000000000000000000");
      await giveUserCLNYTokens(accounts[2], "1000000000000000000");

      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000", { from: OTHER_ACCOUNT });
      await colonyNetwork.deposit("1000000000000000000", { from: OTHER_ACCOUNT });

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
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
      let repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "0");

      repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(repLogEntryMiner[0], OTHER_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "4");

      const reputationUpdateLogLength = await colonyNetwork.getReputationUpdateLogLength();
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });

    it("should not allow a user to back more than one hash in a single cycle", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await testHelper.checkErrorRevert(repCycle.submitNewHash("0x87654321", 10, 10));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
    });

    it("should not allow a user to back the same hash with different number of nodes in a single cycle", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);

      await testHelper.checkErrorRevert(repCycle.submitNewHash("0x12345678", 11, 9));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
    });

    it("should not allow a user to submit the same entry for the same hash twice in a single cycle", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await testHelper.checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 10));
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
    });

    it("should allow a user to back the same hash more than once in a same cycle with different entries, and be rewarded", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(addr);
      await testHelper.forwardTime(3600, this);
      await repCycle.submitNewHash("0x12345678", 10, 10);
      await repCycle.submitNewHash("0x12345678", 10, 9);
      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      assert(nSubmittedHashes.equals(1));
      await repCycle.confirmNewHash(0);

      // Check that they have had their staked balance increase
      const balance1Updated = await colonyNetwork.getStakedBalance(MAIN_ACCOUNT);
      assert.equal(balance1Updated.toString(), new BN("3").mul(new BN("10").pow(new BN("18"))).toString(), "Account was not rewarded properly");

      // Check that they will be getting the reputation owed to them.
      let repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "0");

      repLogEntryMiner = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(repLogEntryMiner[0], MAIN_ACCOUNT);
      assert.equal(repLogEntryMiner[1].toString(), new BN("1").mul(new BN("10").pow(new BN("18"))).toString());
      assert.equal(repLogEntryMiner[2].toString(), "0");
      assert.equal(repLogEntryMiner[3], commonColony.address);
      assert.equal(repLogEntryMiner[4].toString(), "4");
      assert.equal(repLogEntryMiner[5].toString(), "4");

      const reputationUpdateLogLength = await colonyNetwork.getReputationUpdateLogLength();
      assert.equal(reputationUpdateLogLength.toString(), 2);
    });

    it("should only allow 12 entries to back a single hash in each cycle", async () => {
      await giveUserCLNYTokens(MAIN_ACCOUNT, "1000000000000000000");
      await clny.approve(colonyNetwork.address, "1000000000000000000");
      await colonyNetwork.deposit("1000000000000000000");

      const addr = await colonyNetwork.getReputationMiningCycle.call();
      await testHelper.forwardTime(3600, this);
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
      await testHelper.checkErrorRevert(repCycle.submitNewHash("0x12345678", 10, 13));
    });

    it("should cope with many hashes being submitted and eliminated before a winner is assigned", async () => {
      // TODO: This test probably needs to be written more carefully to make sure all possible edge cases are dealt with
      for (let i = 0; i < accounts.length; i += 1) {
        await giveUserCLNYTokens(accounts[i], "1000000000000000000"); // eslint-disable-line no-await-in-loop
        // These have to be done sequentially because this function uses the total number of tasks as a proxy for getting the
        // right taskId, so if they're all created at once it messes up.
      }
      await Promise.all(accounts.map(addr => clny.approve(colonyNetwork.address, "1000000000000000000", { from: addr })));
      await Promise.all(accounts.map(addr => colonyNetwork.deposit("1000000000000000000", { from: addr })));

      const reputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle.call();
      const repCycle = ReputationMiningCycle.at(reputationMiningCycleAddress);
      await testHelper.forwardTime(3600, this);
      await Promise.all(accounts.map(addr => repCycle.submitNewHash(addr, 10, 1, { from: addr })));
      // We're submitting hashes equal to their addresses for ease, though they will get zero padded.

      const nSubmittedHashes = await repCycle.nSubmittedHashes.call();
      let nRemainingHashes = nSubmittedHashes.toNumber();
      let cycle = 0;
      while (nRemainingHashes > 1) {
        for (let i = 0; i < nRemainingHashes; i += 1) {
          if (i % 2 === 0) {
            await repCycle.invalidateHash(cycle, i + 1); // eslint-disable-line no-await-in-loop
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
  });
});
