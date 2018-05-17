/* globals artifacts */
import { checkErrorRevert } from "../helpers/test-helper";

const MultiSigWallet = artifacts.require("gnosis/MultiSigWallet");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const ColonyNetwork = artifacts.require("ColonyNetwork");

contract("EtherRouter / Resolver", accounts => {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let multisig;

  before(async () => {
    resolver = await Resolver.deployed();
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
    it("should return correct destination for given function", async () => {
      const deployedColonyNetwork = await ColonyNetwork.deployed();
      const signature = await resolver.stringToSig.call("createColony(address)");
      const destination = await resolver.lookup.call(signature);
      assert.equal(destination, deployedColonyNetwork.address);
    });

    it("when checking destination for a function that doesn't exist, should return 0", async () => {
      const destination = await resolver.lookup.call("0xdeadbeef");
      assert.equal(destination, 0);
    });

    it("should return correctly encoded function signature", async () => {
      const signature = await resolver.stringToSig.call("transferFrom(address,address,uint256)");
      assert.equal(signature, "0x23b872dd");
    });
  });
});
