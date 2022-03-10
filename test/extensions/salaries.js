/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import { checkErrorRevert, web3GetCode, makeTxAtTimestamp, getBlockTime, getTokenArgs, forwardTime } from "../../helpers/test-helper";
import { setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const Token = artifacts.require("Token");
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
    const etherRouter = await EtherRouter.deployed();
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

      await streamingPayments.finishUpgrade();
      await streamingPayments.deprecate(true);
      await streamingPayments.uninstall();

      const code = await web3GetCode(streamingPayments.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(STREAMING_PAYMENTS, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(STREAMING_PAYMENTS, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(STREAMING_PAYMENTS, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(STREAMING_PAYMENTS, { from: USER0 });
    });
  });

  describe("using the extension", async () => {
    it("can create a streaming payment", async () => {
      let streamingPaymentCount;

      streamingPaymentCount = await streamingPayments.getNumStreamingPayments();
      expect(streamingPaymentCount).to.be.zero;

      await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);

      streamingPaymentCount = await streamingPayments.getNumStreamingPayments();
      expect(streamingPaymentCount).to.eq.BN(1);
    });

    it("cannot create a streaming payment without relevant permissions", async () => {
      await checkErrorRevert(
        streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD], { from: USER1 }),
        "streaming-payments-not-authorized"
      );
    });

    it("cannot create a streaming payment with mismatched arguments", async () => {
      await checkErrorRevert(
        streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], []),
        "streaming-payments-bad-input"
      );
    });

    it("can update the start time", async () => {
      const blockTime = await getBlockTime();
      const startTime = blockTime + SECONDS_PER_DAY;
      const newStartTime = blockTime + SECONDS_PER_DAY * 2;

      // Set start time one day into the future
      await streamingPayments.create(1, UINT256_MAX, 1, startTime, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let streamingPayment;
      streamingPayment = await streamingPayments.get(streamingPaymentId);
      expect(streamingPayment.startTime).to.eq.BN(startTime);

      // Now make it two days into the future
      await streamingPayments.setStartTime(1, UINT256_MAX, streamingPaymentId, newStartTime);
      streamingPayment = await streamingPayments.get(streamingPaymentId);
      expect(streamingPayment.startTime).to.eq.BN(newStartTime);
    });

    it("cannot update the start time after the start time has passed", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await forwardTime(SECONDS_PER_DAY, this);

      await checkErrorRevert(streamingPayments.setStartTime(1, UINT256_MAX, streamingPaymentId, 0), "streaming-payments-already-started");
    });

    it("cannot update the start time without correct permissions", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await forwardTime(SECONDS_PER_DAY, this);

      await checkErrorRevert(
        streamingPayments.setStartTime(1, UINT256_MAX, streamingPaymentId, 0, { from: USER1 }),
        "streaming-payments-not-authorized"
        );
    });

    it("can update the end time", async () => {
      const blockTime = await getBlockTime();
      const endTime = blockTime + SECONDS_PER_DAY;
      const newEndTime = blockTime + SECONDS_PER_DAY * 2;

      await streamingPayments.create(1, UINT256_MAX, 1, 0, endTime, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let streamingPayment;
      streamingPayment = await streamingPayments.get(streamingPaymentId);
      expect(streamingPayment.endTime).to.eq.BN(endTime);

      await streamingPayments.setEndTime(1, UINT256_MAX, streamingPaymentId, newEndTime);
      streamingPayment = await streamingPayments.get(streamingPaymentId);
      expect(streamingPayment.endTime).to.eq.BN(newEndTime);
    });

    it("cannot update the end time to a time past", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await checkErrorRevert(streamingPayments.setEndTime(1, UINT256_MAX, streamingPaymentId, 0), "streaming-payments-invalid-end-time");
    });

    it("cannot update the end time without relevant permissions", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await checkErrorRevert(
        streamingPayments.setEndTime(1, UINT256_MAX, streamingPaymentId, 0, { from: USER1 }),
        "streaming-payments-not-authorized"
      );
    });

    it("can claim a streaming payment", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
    });

    it("cannot claim a streaming payment before the start time", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      await checkErrorRevert(
        streamingPayments.claim(1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId),
        "streaming-payments-too-soon-to-claim"
      );
    });

    it("can cancel a streaming payment", async () => {
      await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const tx = await streamingPayments.cancel(1, UINT256_MAX, streamingPaymentId);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const streamingPayment = await streamingPayments.get(streamingPaymentId);
      expect(streamingPayment.endTime).to.eq.BN(blockTime);
    });

    it("can claim a streaming payment multiple times", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
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

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
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

      const tx = await streamingPayments.create(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      // Now claim at the same timestamp
      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.be.zero;
    });

    it("can claim a streaming payment with multiple tokens and amounts", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tokenArgs = getTokenArgs();
      const otherToken = await Token.new(...tokenArgs);
      await otherToken.unlock();
      await fundColonyWithTokens(colony, otherToken, WAD.muln(10));

      const streamingPaymentArgs = [1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address, otherToken.address], [WAD, WAD.muln(2)]];
      const tx = await streamingPayments.create(...streamingPaymentArgs);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      const balance0Pre = await token.balanceOf(USER1);
      const balance1Pre = await otherToken.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      const balance0Post = await token.balanceOf(USER1);
      const balance1Post = await otherToken.balanceOf(USER1);
      expect(balance0Post.sub(balance0Pre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
      expect(balance1Post.sub(balance1Pre)).to.eq.BN(WAD.muln(4).subn(1)); // -1 for network fee
    });

    it("can claim a streaming payment with multiple tokens and amounts with partial funding", async () => {
      // Only fund partially
      await fundColonyWithTokens(colony, token, WAD.muln(1));

      const tokenArgs = getTokenArgs();
      const otherToken = await Token.new(...tokenArgs);
      await otherToken.unlock();
      await fundColonyWithTokens(colony, otherToken, WAD.muln(10));

      const streamingPaymentArgs = [1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address, otherToken.address], [WAD, WAD.muln(2)]];
      const tx = await streamingPayments.create(...streamingPaymentArgs);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const streamingPaymentId = await streamingPayments.getNumStreamingPayments();

      let balance0Pre;
      let balance0Post;
      let balance1Pre;
      let balance1Post;

      balance0Pre = await token.balanceOf(USER1);
      balance1Pre = await otherToken.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, streamingPaymentId];
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 2, this);
      balance0Post = await token.balanceOf(USER1);
      balance1Post = await otherToken.balanceOf(USER1);
      expect(balance0Post.sub(balance0Pre)).to.eq.BN(WAD.muln(1).subn(1)); // -1 for network fee
      expect(balance1Post.sub(balance1Pre)).to.eq.BN(WAD.muln(4).subn(1)); // -1 for network fee

      // Fully fund
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      // The discrepancy is claimed
      balance0Pre = await token.balanceOf(USER1);
      balance1Pre = await otherToken.balanceOf(USER1);
      await makeTxAtTimestamp(streamingPayments.claim, claimArgs, blockTime + SECONDS_PER_DAY * 3, this);
      balance0Post = await token.balanceOf(USER1);
      balance1Post = await otherToken.balanceOf(USER1);
      expect(balance0Post.sub(balance0Pre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
      expect(balance1Post.sub(balance1Pre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
    });
  });
});
