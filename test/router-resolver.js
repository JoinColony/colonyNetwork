/* globals artifacts */
import testHelper from '../helpers/test-helper';

const MultiSigWallet = artifacts.require('multisig-wallet/MultiSigWallet.sol');
const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');

contract('EtherRouter / Resolver', function (accounts) {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let multisig;

  before(async function () {
    resolver = await Resolver.new();
  });

  beforeEach(async function () {
    etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolver.address);
    // Need at least 2 confirmations for EtherRouter owner-required transactions
    multisig = await MultiSigWallet.new([ACCOUNT_TWO, ACCOUNT_THREE], 2);
    await etherRouter.setOwner(multisig.address);
  });

  describe('EtherRouter', function () {
    it('should revert if non-owner tries to change the Resolver on EtherRouter', async function () {
      let tx;
      try {
        tx = await etherRouter.setResolver('0xb3e2b6020926af4763d706b5657446b95795de57', { from: COINBASE_ACCOUNT, gas: 4700000});
      } catch (err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      const _resolver = await etherRouter.resolver.call();
      assert.equal(_resolver, resolver.address);
    });

    it('should throw if owner tries to change the Resolver on EtherRouter with invalid address', async function () {
      const txData = await etherRouter.contract.setResolver.getData('0x0')
      const transactionId = await multisig.submitTransaction(etherRouter.address, 0, txData, { from: ACCOUNT_TWO });
      let tx;
      try {
        tx = await multisig.confirmTransaction(transactionId);
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }

      const _resolver = await etherRouter.resolver.call();
      assert.equal(_resolver, resolver.address);
    });

    it('should throw if there have been insufficient number of confirmations to change the Resolver on EtherRouter', async function () {
      const txData = await etherRouter.contract.setResolver.getData('0xb3e2b6020926af4763d706b5657446b95795de57');
      let tx;
      try {
        tx = await multisig.submitTransaction(etherRouter.address, 0, txData, { from: ACCOUNT_TWO });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      const transactionId = tx.logs[0].args['transactionId'];
      const isConfirmed = await multisig.isConfirmed.call(transactionId);
      assert.isFalse(isConfirmed);
      const _resolver = await etherRouter.resolver.call();
      assert.equal(_resolver, resolver.address);
    });
  });

  describe('Resolver', function () {
    it('when checking outsize, should return correct return param size for given function', async function () {
      const outsize = await resolver.outsize.call('0x18160ddd');
      assert.equal(outsize, 32);
    });

    it('when checking outsize for a function that doesn\'t exist, should return default of 32', async function () {
      const outsize = await resolver.outsize.call('0x18118aaa');
      assert.equal(outsize, 32);
    });

    it('should return correctly encoded function signature', async function () {
      const signature = await resolver.stringToSig.call('transferFrom(address,address,uint256)');
      assert.equal(signature, '0x23b872dd');
    });
  });
});
