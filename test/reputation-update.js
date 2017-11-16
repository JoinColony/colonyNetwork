/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');

contract('Colony', function (accounts) {
  let COLONY_KEY;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const THIRD_ACCOUNT = accounts[2];
  // This value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;
  // The base58 decoded, bytes32 converted value of the task ipfsHash
  const ipfsDecodedHash = '9bb76d8e6c89b524d34a454b3140df28';
  const newIpfsDecodedHash = '9bb76d8e6c89b524d34a454b3140df29';

  const optionsToSpotTransactionFailure = {
    from: MAIN_ACCOUNT,
    gas: GAS_TO_SPEND,
  };

  let colony;
  let token;
  let authority;
  let colonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
    await colonyNetwork.createColony("Common Colony");
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await Colony.at(address);
    let authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    let tokenAddress = await colony.token.call();
    token = await Token.at(tokenAddress);
  });

  describe('when update added to reputation update log', () => {
    it('should be readable', async function () {
      await colony.makeTask(ipfsDecodedHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      await colony.acceptTask(1);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(0);
      assert.equal(x[0], OTHER_ACCOUNT);
      assert.equal(x[1].toNumber(), 10);
      assert.equal(x[2].toNumber(), 5);
      assert.equal(x[3], colony.address);
      assert.equal(x[4].toNumber(), 2);
      assert.equal(x[5].toNumber(), 0);
    });

    it('should not be able to be appended by an account that is not a colony', async function () {
      let lengthBefore = await colonyNetwork.getReputationUpdateLogLength.call();
      let tx;
      try {
        tx = await colonyNetwork.appendReputationUpdateLog(MAIN_ACCOUNT, 1, 2, { gas: GAS_TO_SPEND });
      } catch (err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      // We got a throw. Check it wasn't appended to
      let lengthAfter = await colonyNetwork.getReputationUpdateLogLength.call();
      assert.equal(lengthBefore.toNumber(), lengthAfter.toNumber());
    })

    it('should populate nPreviousUpdates correctly', async function () {
      await colony.makeTask(ipfsDecodedHash);
      await colony.setTaskWorker(1, OTHER_ACCOUNT);
      await colony.acceptTask(1);
      await colony.makeTask(ipfsDecodedHash);
      await colony.setTaskWorker(2, OTHER_ACCOUNT);
      await colony.acceptTask(2);
      let x = await colonyNetwork.getReputationUpdateLogEntry.call(1);
      assert.equal(x[5].toNumber(), 2);
    });

    it.skip('should calculate nUpdates correctly when making a log');
  });
});
