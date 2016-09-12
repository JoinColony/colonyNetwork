// These globals are added by Truffle:
/* globals RootColony, Colony, ColonyFactory, EternalStorage */
contract('all', function (accounts) {
  const GAS_PRICE = 20e9;
  // const _GAS_TO_SPEND_ = 1e6;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];

  let colony;
  let rootColony;
  let eternalStorage;

  let makeTaskCost;
  let updateTaskCost;
  let acceptTaskCost;
  let generateColonyTokensCost;
  let contributeEthToTaskCost;
  let contributeTokensToTaskCost;
  let completeAndPayTaskCost;

  before(function (done) {
    rootColony = RootColony.deployed();

    const prevBalance = web3.eth.getBalance(MAIN_ACCOUNT);
    ColonyFactory.new({ gasPrice: GAS_PRICE })
    .then(function () {
      const currentBalance = web3.eth.getBalance(MAIN_ACCOUNT);
      // Cost of creating a colony
      const costInWei = prevBalance.minus(currentBalance).toNumber();
      const costInGas = costInWei / GAS_PRICE;
      console.log('ColonyFactory cost : ', costInGas);
    })
    .then(done)
    .catch(done);
  });

  beforeEach(function (done) {
    let prevBalance;
    EternalStorage.new()
    .then(function (contract) {
      eternalStorage = contract;
      return eternalStorage.changeOwner(rootColony.address);
    })
    .then(function () {
      return rootColony.registerEternalStorage(eternalStorage.address);
    })
    .then(function () {
      prevBalance = web3.eth.getBalance(MAIN_ACCOUNT);
      return rootColony.createColony('Antz', { from: MAIN_ACCOUNT, gasPrice: GAS_PRICE });
    })
    .then(function () {
      const currentBalance = web3.eth.getBalance(MAIN_ACCOUNT);
      // Cost of creating a colony
      const costInWei = prevBalance.minus(currentBalance).toNumber();
      const costInGas = costInWei / GAS_PRICE;
      console.log('RootColony.createColony(bytes32) : ', costInGas);
    })
    .then(function () {
      return rootColony.getColony.call('Antz');
    })
    .then(function (colony_) {
      colony = Colony.at(colony_);
      return;
    })
    .then(done)
    .catch(done);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Gas costs ', function () {
    it('when working with a Colony', function (done) {
      // When working with tasks
      colony.makeTask.estimateGas('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { })
      .then(function (cost) {
        makeTaskCost = cost;
        console.log('makeTask : ', cost);
        return colony.makeTask('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.updateTask.estimateGas(0, 'My updated task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC02', { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        updateTaskCost = cost;
        console.log('updateTask : ', cost);
        return colony.acceptTask.estimateGas(0, { });
      })
      .then(function (cost) {
        acceptTaskCost = cost;
        console.log('acceptTask : ', cost);
        return colony.generateTokensWei(200, { from: MAIN_ACCOUNT });
      })
      .then(function () {
      // When working with tokens
        return colony.generateTokensWei.estimateGas(200, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        generateColonyTokensCost = cost;
        console.log('generateTokensWei : ', cost);
        return colony.contributeEthToTask.estimateGas(0, { value: 50 });
      })
      .then(function (cost) {
        contributeEthToTaskCost = cost;
        console.log('contributeEthToTask : ', cost);
        return colony.contributeEthToTask(0, { value: 50 });
      })
      .then(function () {
        return colony.contributeTokensWeiFromPool.estimateGas(0, 50, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        contributeTokensToTaskCost = cost;
        console.log('contributeTokensWeiFromPool : ', cost);
        return colony.contributeTokensWeiFromPool(0, 50, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.completeAndPayTask.estimateGas(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        completeAndPayTaskCost = cost;
        console.log('completeAndPayTask : ', cost);
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        return colony.transfer.estimateGas(MAIN_ACCOUNT, 1, { from: OTHER_ACCOUNT });
      })
      .then(function (cost) {
        console.log('Colony.transfer 1 token : ', cost);
        done();
      })
      .catch(done);
    });

    it('Average gas costs for customers should not exceed 0.77 ETH per month', function (done) {
      const totalGasCost = (makeTaskCost * 50) // assume 100 tasks per month are created
      + (updateTaskCost * 200) // assume each task is updated 5 times
      + (acceptTaskCost * 50) // all 100 opened tasks are accepted
      + (contributeEthToTaskCost * 50) // only colony admins are allowed to contribute eth adn tokens
      + (contributeTokensToTaskCost * 50)
      + (completeAndPayTaskCost * 50) // all tasks are closed and paid out
      + (generateColonyTokensCost * 1); // only once per month are new colony tokens generated

      const totalEtherCost = web3.fromWei(totalGasCost * GAS_PRICE, 'ether');
      console.log('Average monthly cost per customer is : ');
      console.log(' Gas : ', totalGasCost);
      console.log(' Ether : ', totalEtherCost);

      // Only do this assert if we're using testrpc. There's discrepancy between TestRPC estimategas
      // and geth estimateGas; the former is too high.
      if (web3.version.node.indexOf('TestRPC') === -1) {
        assert.isBelow(totalEtherCost, 0.77, 'Monthly average costs exceed target');
      } else {
        console.log('IGNORING THE RESULT DUE TO TESTRPC INACCURICIES IN ESTIMATEGAS');
      }

      done();
    });
  });
});
