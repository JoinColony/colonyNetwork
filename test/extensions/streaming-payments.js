/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, WAD, SECONDS_PER_DAY, ADDRESS_ZERO, ADDRESS_FULL } = require("../../helpers/constants");
const { checkErrorRevert, expectEvent, makeTxAtTimestamp, getBlockTime, forwardTime, web3GetStorageAt } = require("../../helpers/test-helper");
const { setupRandomColony, fundColonyWithTokens } = require("../../helpers/test-data-generator");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const StreamingPayments = artifacts.require("StreamingPayments");

const STREAMING_PAYMENTS = soliditySha3("StreamingPayments");

contract("Streaming Payments", (accounts) => {
  let colonyNetwork;
  let colony;
  let token;
  let streamingPayments;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    const cnAddress = (await EtherRouter.deployed()).address;

    const etherRouter = await EtherRouter.at(cnAddress);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metacolony = await IMetaColony.at(metaColonyAddress);
    await metacolony.setNetworkFeeInverse(UINT256_MAX);

    const extension = await StreamingPayments.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(STREAMING_PAYMENTS, version);

    const streamingPaymentsAddress = await colonyNetwork.getExtensionInstallation(STREAMING_PAYMENTS, colony.address);
    streamingPayments = await StreamingPayments.at(streamingPaymentsAddress);

    await colony.setFundingRole(1, UINT256_MAX, streamingPayments.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, streamingPayments.address, 1, true);

    await colony.setFundingRole(1, UINT256_MAX, USER0, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, USER0, 1, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      streamingPayments = await StreamingPayments.new();
      await streamingPayments.install(colony.address);

      await checkErrorRevert(streamingPayments.install(colony.address), "extension-already-installed");

      const identifier = await streamingPayments.identifier();
      expect(identifier).to.equal(STREAMING_PAYMENTS);

      const capabilityRoles = await streamingPayments.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await streamingPayments.deprecate(true);
      await streamingPayments.uninstall();

      const colonyAddress = await streamingPayments.getColony();
      expect(colonyAddress).to.equal(ADDRESS_FULL);
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(STREAMING_PAYMENTS, version, { from: USER0 });

      const streamingPaymentsAddress = await colonyNetwork.getExtensionInstallation(STREAMING_PAYMENTS, colony.address);
      let resolverAddress = await web3GetStorageAt(streamingPaymentsAddress, 2);
      expect(resolverAddress).to.not.equal(ethers.constants.HashZero);

      await checkErrorRevert(colony.installExtension(STREAMING_PAYMENTS, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(STREAMING_PAYMENTS, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(STREAMING_PAYMENTS, { from: USER0 });

      resolverAddress = await web3GetStorageAt(streamingPaymentsAddress, 2);
      expect(resolverAddress).to.equal(ethers.constants.HashZero);
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(streamingPayments.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(streamingPayments.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(streamingPayments.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(streamingPayments.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });
  });

  describe("using the extension", async () => {
    it("can create a streaming payment", async () => {
      let streamingPaymentCount;

      streamingPaymentCount = await streamingPayments.getNumStreamingPayments();
      expect(streamingPaymentCount).to.be.zero;

      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);

      streamingPaymentCount = await streamingPayments.getNumStreamingPayments();
      expect(streamingPaymentCount).to.eq.BN(1);
    });

    it("cannot create a streaming payment without relevant permissions", async () => {
      await checkErrorRevert(
        streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD, { from: USER1 }),
        "streaming-payments-funding-not-authorized",
      );

      await colony.setFundingRole(1, UINT256_MAX, USER1, 1, true);

      await checkErrorRevert(
        streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD, { from: USER1 }),
        "streaming-payments-admin-not-authorized",
      );

      await colony.setFundingRole(1, UINT256_MAX, USER1, 1, false);
    });

    it("cannot create a streaming payment with an interval of 0", async () => {
      await checkErrorRevert(
        streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, 0, USER1, token.address, WAD),
        "streaming-payments-bad-interval",
      );
    });

    it("cannot create a streaming payment which ends before it starts", async () => {
      const startTime = 10;
      const endTime = 9;

      await checkErrorRevert(
        streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, startTime, endTime, SECONDS_PER_DAY, USER1, token.address, WAD),
        "streaming-payments-bad-end-time",
      );
    });

    it("cannot create a streaming payment if the extension is deprecated", async () => {
      await colony.deprecateExtension(STREAMING_PAYMENTS, true);

      await checkErrorRevert(
        streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD),
        "colony-extension-deprecated",
      );
    });

    it("can update the start time", async () => {
      const blockTime = await getBlockTime();
      const startTime = blockTime + SECONDS_PER_DAY;
      const newStartTime = blockTime + SECONDS_PER_DAY * 2;

      // Set start time one day into the future
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, startTime, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let streamingPayment;
      streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.startTime).to.eq.BN(startTime);

      // Now make it two days into the future
      const tx = await streamingPayments.setStartTime(1, UINT256_MAX, streamingPaymentId, newStartTime);
      streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.startTime).to.eq.BN(newStartTime);

      await expectEvent(tx, "StartTimeSet", [accounts[0], streamingPaymentId, newStartTime]);
    });

    it("cannot update the start time after the start time has passed", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await forwardTime(SECONDS_PER_DAY, this);

      await checkErrorRevert(streamingPayments.setStartTime(1, UINT256_MAX, streamingPaymentId, 0), "streaming-payments-already-started");
    });

    it("cannot update the start time to after the end time", async () => {
      const blockTime = await getBlockTime();
      const startTime = blockTime + SECONDS_PER_DAY;
      const endTime = startTime + SECONDS_PER_DAY;
      const newStartTime = endTime + SECONDS_PER_DAY;

      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, startTime, endTime, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await checkErrorRevert(
        streamingPayments.setStartTime(1, UINT256_MAX, streamingPaymentId, newStartTime),
        "streaming-payments-invalid-start-time",
      );
    });

    it("cannot update the start time without relevant permissions", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await forwardTime(SECONDS_PER_DAY, this);

      await checkErrorRevert(
        streamingPayments.setStartTime(1, UINT256_MAX, streamingPaymentId, 0, { from: USER1 }),
        "streaming-payments-admin-not-authorized",
      );
    });

    it("can update the end time", async () => {
      const blockTime = await getBlockTime();
      const endTime = blockTime + SECONDS_PER_DAY;
      const newEndTime = endTime + SECONDS_PER_DAY;

      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, endTime, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let streamingPayment;
      streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.eq.BN(endTime);

      const tx = await streamingPayments.setEndTime(1, UINT256_MAX, streamingPaymentId, newEndTime);
      streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.eq.BN(newEndTime);

      await expectEvent(tx, "EndTimeSet", [accounts[0], streamingPaymentId, newEndTime]);
    });

    it("cannot update the end time to a time past", async () => {
      const blockTime = await getBlockTime();
      const endTime = blockTime + SECONDS_PER_DAY * 3;

      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, endTime, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await forwardTime(SECONDS_PER_DAY * 2, this);

      await checkErrorRevert(streamingPayments.setEndTime(1, UINT256_MAX, streamingPaymentId, 0), "streaming-payments-invalid-end-time");
    });

    it("cannot update the end time to before the start time", async () => {
      const blockTime = await getBlockTime();
      const startTime = blockTime + SECONDS_PER_DAY;
      const endTime = startTime;
      const newEndTime = startTime - SECONDS_PER_DAY / 2;

      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, startTime, endTime, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await checkErrorRevert(streamingPayments.setEndTime(1, UINT256_MAX, streamingPaymentId, newEndTime), "streaming-payments-invalid-end-time");
    });

    it("cannot update the end time if the end time has elapsed", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await streamingPayments.cancel(1, UINT256_MAX, streamingPaymentId);

      await forwardTime(1, this);

      await checkErrorRevert(streamingPayments.cancel(1, UINT256_MAX, streamingPaymentId), "streaming-payments-already-ended");
    });

    it("cannot update the end time without relevant permissions", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await checkErrorRevert(
        streamingPayments.setEndTime(1, UINT256_MAX, streamingPaymentId, 0, { from: USER1 }),
        "streaming-payments-admin-not-authorized",
      );
    });

    it("can claim a streaming payment", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
    });

    it(`can claim a streaming payment correctly where the streaming payment id is not the same as the domain id
            or is a domain id that doesn't exist`, async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
    });

    it("can claim multiple streaming payments in a single tx via multicall", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      let tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      tx = await makeTxAtTimestamp(
        streamingPayments.create,
        [1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD],
        blockTime,
        this,
      );
      const streamingPaymentId2 = await streamingPayments.getNumStreamingPayments();

      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      const claimData = await streamingPayments.contract.methods.claim(...claimArgs).encodeABI();
      const claimArgs2 = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId2];
      const claimData2 = await streamingPayments.contract.methods.claim(...claimArgs2).encodeABI();

      tx = await makeTxAtTimestamp(streamingPayments.multicall, [[claimData, claimData2]], blockTime + SECONDS_PER_DAY * 2, this);
      const balancePost = await token.balanceOf(USER1);

      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(4).subn(2)); // -2 for network fees
    });

    it("cannot get more from a payment than should be able to", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(1));

      let blockTime = await getBlockTime();
      const createArgs = [
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        1,
        blockTime,
        blockTime + SECONDS_PER_DAY,
        SECONDS_PER_DAY,
        USER1,
        token.address,
        WAD.muln(100),
      ];
      await makeTxAtTimestamp(streamingPayments.create, createArgs, blockTime, this);

      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      const interval = Math.floor(SECONDS_PER_DAY / 9);
      await fundColonyWithTokens(colony, token, WAD.muln(1));
      blockTime = await getBlockTime();

      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + interval, this);
      await fundColonyWithTokens(colony, token, WAD.muln(1));
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + 2 * interval, this);
      await fundColonyWithTokens(colony, token, WAD.muln(100));
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.be.lte.BN(WAD.muln(100));
    });

    it("should not be able to 'brick' a payout, with 'last paid out' being after the end date", async () => {
      const blockTime = await getBlockTime();
      const createArgs = [
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        1,
        blockTime,
        blockTime + SECONDS_PER_DAY,
        SECONDS_PER_DAY,
        USER1,
        token.address,
        WAD.muln(100),
      ];
      await makeTxAtTimestamp(streamingPayments.create, createArgs, blockTime, this);

      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const balancePre = await token.balanceOf(USER1);
      await forwardTime(SECONDS_PER_DAY, this);

      await fundColonyWithTokens(colony, token, WAD.muln(99));
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await streamingPayments.claim(...claimArgs);

      for (let i = 0; i < 11; i += 1) {
        await fundColonyWithTokens(colony, token, WAD.divn(10));
        await streamingPayments.claim(...claimArgs);
        const balancePost = await token.balanceOf(USER1);
        expect(balancePost.sub(balancePre)).to.be.lte.BN(WAD.muln(100));
      }

      const streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);

      expect(streamingPayment.amountEntitledFromStart).to.be.lte.BN(streamingPayment.amount);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(100).subn(11)); // -11 for network fee after 11 claims that paid
    });

    it("cannot claim a streaming payment before the start time", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await checkErrorRevert(
        streamingPayments.claim(1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId),
        "streaming-payments-too-soon-to-claim",
      );
    });

    it("can cancel a streaming payment", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const tx = await streamingPayments.cancel(1, UINT256_MAX, streamingPaymentId);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.eq.BN(blockTime);

      expectEvent(tx, "EndTimeSet", [accounts[0], streamingPaymentId, blockTime]);
    });

    it("can cancel a streaming payment before the start time", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const tx = await streamingPayments.cancel(1, UINT256_MAX, streamingPaymentId);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.eq.BN(blockTime);
      expect(streamingPayment.startTime).to.eq.BN(blockTime);
    });

    it("can cancel a streaming payment and claim any balance owed", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      // Cancel after one day
      await makeTxAtTimestamp(streamingPayments.cancel, [1, UINT256_MAX, streamingPaymentId], blockTime + SECONDS_PER_DAY, this);

      // Claim after two days, but only get one day's worth of payout
      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.subn(1)); // -1 for network fee
    });

    it("cannot cancel a streaming payment twice", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await streamingPayments.cancel(1, UINT256_MAX, streamingPaymentId);

      await forwardTime(1, this);

      await checkErrorRevert(streamingPayments.cancel(1, UINT256_MAX, streamingPaymentId), "streaming-payments-already-ended");
    });

    it("receipient can cancel and waive a streaming payment", async () => {
      let tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      tx = await makeTxAtTimestamp(streamingPayments.cancelAndWaive, [streamingPaymentId, { from: USER1 }], blockTime + SECONDS_PER_DAY * 2, this);

      const streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.equal((blockTime + SECONDS_PER_DAY * 2).toString());

      expect(streamingPayment.pseudoAmountClaimedFromStart).to.equal((WAD * 2).toString());

      expectEvent(tx, "ClaimWaived", [USER1, streamingPaymentId, token.address]);
    });

    it("multiple cancel-and-waives of a streaming payments do not change the end time", async () => {
      const tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      await makeTxAtTimestamp(streamingPayments.cancelAndWaive, [streamingPaymentId, { from: USER1 }], blockTime + SECONDS_PER_DAY * 2, this);

      const streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.equal((blockTime + SECONDS_PER_DAY * 2).toString());

      await makeTxAtTimestamp(streamingPayments.cancelAndWaive, [streamingPaymentId, { from: USER1 }], blockTime + SECONDS_PER_DAY * 4, this);

      const streamingPayment2 = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.equal(streamingPayment2.endTime);
    });

    it("non-receipient cannot cancel-and-waive a steaming payment", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();
      await checkErrorRevert(streamingPayments.cancelAndWaive(streamingPaymentId), "streaming-payments-not-recipient");
    });

    it("can cancel-and-waive payment before the start time", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const tx = await streamingPayments.cancelAndWaive(streamingPaymentId, { from: USER1 });

      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.endTime).to.equal(blockTime.toString());
      expect(streamingPayment.startTime).to.equal(blockTime.toString());
    });

    it("can claim a streaming payment multiple times", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let balancePre;
      let balancePost;
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];

      // Claim 2 WADs
      balancePre = await token.balanceOf(USER1);
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee

      // Claim 1 WAD
      balancePre = await token.balanceOf(USER1);
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 3, this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.subn(1)); // -1 for network fee
    });

    it("can claim a streaming payment with partial funding", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(1));

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let balancePre;
      let balancePost;

      // Can only claim 1 wad (of 2 wads)
      balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(1).subn(1)); // -1 for network fee

      await fundColonyWithTokens(colony, token, WAD.muln(10));

      // Claim 1 wad plus 1 wad owed
      balancePre = await token.balanceOf(USER1);
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 3, this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
    });

    it("can claim nothing", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await forwardTime(SECONDS_PER_DAY, this);

      // Claim any owed tokens
      const tx = await streamingPayments.claim(1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      // Now claim again at the same timestamp
      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.be.zero;
    });

    it("can change the token amount", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let balancePre;
      let balancePost;

      // Claim one wad
      balancePre = await token.balanceOf(USER1);
      const updateArgs = [1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId, WAD.muln(2)];
      await makeTxAtTimestamp(streamingPayments.setTokenAmount, updateArgs, blockTime + SECONDS_PER_DAY, this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(1).subn(1)); // -1 for network fee

      const streamingPayment = await streamingPayments.getStreamingPayment(streamingPaymentId);
      expect(streamingPayment.amount).to.eq.BN(WAD.muln(2));

      // Claim two wads
      balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
    });

    it("cannot change the token amount if existing payouts cannot be made", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, 1, 0, UINT256_MAX, SECONDS_PER_DAY, USER1, token.address, WAD);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await forwardTime(SECONDS_PER_DAY, this);

      await checkErrorRevert(
        streamingPayments.setTokenAmount(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId, WAD.muln(2)),
        "streaming-payments-insufficient-funds",
      );
    });
  });
});
