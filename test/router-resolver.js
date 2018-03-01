/* globals artifacts */
import { checkErrorRevert } from "../helpers/test-helper";

const MultiSigWallet = artifacts.require("gnosis/MultiSigWallet");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");

contract("EtherRouter / Resolver", accounts => {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let multisig;

  before(async () => {
    resolver = await Resolver.new();
  });

  beforeEach(async () => {
    etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolver.address);
    // Need at least 2 confirmations for EtherRouter owner-required transactions
    multisig = await MultiSigWallet.new([ACCOUNT_TWO, ACCOUNT_THREE], 2);
    await etherRouter.setOwner(multisig.address);
  });

  describe("EtherRouter", () => {
    it("should revert if non-owner tries to change the Resolver on EtherRouter", async () => {
      await checkErrorRevert(etherRouter.setResolver("0xb3e2b6020926af4763d706b5657446b95795de57", { from: COINBASE_ACCOUNT }));
      const resolverUpdated = await etherRouter.resolver.call();
      assert.equal(resolverUpdated, resolver.address);
    });

    it("should not change resolver on EtherRouter if there have been insufficient number of confirmations", async () => {
      const txData = await etherRouter.contract.setResolver.getData("0xb3e2b6020926af4763d706b5657446b95795de57");
      const tx = await multisig.submitTransaction(etherRouter.address, 0, txData, { from: ACCOUNT_TWO });
      const { transactionId } = tx.logs[0].args;
      const isConfirmed = await multisig.isConfirmed.call(transactionId);
      const resolverUpdated = await etherRouter.resolver.call();
      assert.isFalse(isConfirmed);
      assert.equal(resolverUpdated, resolver.address);
    });
  });

  describe("Resolver", () => {
    it("when checking outsize, should return correct return param size for given function", async () => {
      const outsize = await resolver.outsize.call("0x18160ddd");
      assert.equal(outsize, 32);
    });

    it("when checking outsize for a function that doesn't exist, should return default of 32", async () => {
      const outsize = await resolver.outsize.call("0x18118aaa");
      assert.equal(outsize, 32);
    });

    it("should return correctly encoded function signature", async () => {
      const signature = await resolver.stringToSig.call("transferFrom(address,address,uint256)");
      assert.equal(signature, "0x23b872dd");
    });
  });
});
