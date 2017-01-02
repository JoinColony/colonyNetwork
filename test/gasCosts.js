// These globals are added by Truffle:
/* globals RootColony, Colony, ColonyFactory, EternalStorage */
contract('all', function (accounts) {
  const GAS_PRICE = web3.eth.gasPrice;
  // const _GAS_TO_SPEND_ = 1e6;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];

  let colony;
  let rootColony;
  let eternalStorage;

  let makeTaskCost;
  let updateTaskCost;
  let generateColonyTokensCost;
  let contributeEthToTaskCost;
  let contributeTokensToTaskCost;
  let completeAndPayTaskCost;

  before(function (done) {
    rootColony = RootColony.deployed();

    let prevBalance = web3.eth.getBalance(MAIN_ACCOUNT);
    let currentBalance;
    let costInWei;
    let costInGas;

    ColonyFactory.new()
    .then(function () {
      console.log('Gas price : ', GAS_PRICE);
      currentBalance = web3.eth.getBalance(MAIN_ACCOUNT);
      // Cost of creating a colony
      costInWei = prevBalance.minus(currentBalance).toNumber();
      costInGas = costInWei / GAS_PRICE;
      console.log('ColonyFactory actual cost : ', costInGas);
      prevBalance = currentBalance;
    })
    .then(function () {
      return RootColony.new();
    })
    .then(function () {
      currentBalance = web3.eth.getBalance(MAIN_ACCOUNT);
      costInWei = prevBalance.minus(currentBalance).toNumber();
      costInGas = costInWei / GAS_PRICE;
      console.log('RootColony actual cost : ', costInGas);
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
      return rootColony.createColony.estimateGas('Antz', { from: MAIN_ACCOUNT });
    })
    .then(function (cost) {
      console.log('createColony estimate : ', cost);
      prevBalance = web3.eth.getBalance(MAIN_ACCOUNT);
      return rootColony.createColony('Antz', { from: MAIN_ACCOUNT });
    })
    .then(function () {
      const currentBalance = web3.eth.getBalance(MAIN_ACCOUNT);
      // Cost of creating a colony
      const costInWei = prevBalance.minus(currentBalance).toNumber();
      const costInGas = costInWei / GAS_PRICE;
      console.log('createColony actual cost : ', costInGas);
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
      let balanceBefore = 0;
      let balanceAfter = 0;

      // When working with tasks
      colony.makeTask.estimateGas('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { })
      .then(function (cost) {
        makeTaskCost = cost;
        console.log('makeTask estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.makeTask('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('makeTask actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.updateTask.estimateGas(0, 'My updated task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC02', { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        updateTaskCost = cost;
        console.log('updateTask estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.updateTask(0, 'My updated task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC02', { from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('updateTask actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.generateTokensWei.estimateGas(200, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        generateColonyTokensCost = cost;
        console.log('generateTokensWei estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.generateTokensWei(200, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('generateTokensWei actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.contributeEthToTask.estimateGas(0, { value: 50, from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        contributeEthToTaskCost = cost;
        console.log('contributeEthToTask estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.contributeEthToTask(0, { value: 50, from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('contributeEthToTask actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.contributeTokensWeiFromPool.estimateGas(0, 50, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        contributeTokensToTaskCost = cost;
        console.log('contributeTokensWeiFromPool estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.contributeTokensWeiFromPool(0, 50, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('contributeTokensWeiFromPool actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.completeAndPayTask.estimateGas(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        completeAndPayTaskCost = cost;
        console.log('completeAndPayTask estimate: ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('completeAndPayTask actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.transfer.estimateGas(MAIN_ACCOUNT, 1, { from: OTHER_ACCOUNT });
      })
      .then(function (cost) {
        console.log('transfer estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.transfer(MAIN_ACCOUNT, 1, { from: OTHER_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('transfer actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.addUserToRole.estimateGas(OTHER_ACCOUNT, 1, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        console.log('addUserToRole estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.addUserToRole(OTHER_ACCOUNT, 1, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('addUserToRole actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        return colony.removeUserFromRole.estimateGas(OTHER_ACCOUNT, 1, { from: MAIN_ACCOUNT });
      })
      .then(function (cost) {
        console.log('removeUserFromRole estimate : ', cost);
        balanceBefore = web3.eth.getBalance(MAIN_ACCOUNT);
        return colony.removeUserFromRole(OTHER_ACCOUNT, 1, { from: MAIN_ACCOUNT });
      })
      .then(function () {
        balanceAfter = web3.eth.getBalance(MAIN_ACCOUNT);
        console.log('removeUserFromRole actual cost :', balanceBefore.minus(balanceAfter).dividedBy(GAS_PRICE).toNumber());
        done();
      })
      .catch(done);
    });

    it('Average gas costs for customers should not exceed 1 ETH per month', function (done) {
      const totalGasCost = (makeTaskCost * 50) // assume 100 tasks per month are created
      + (updateTaskCost * 200) // assume each task is updated 5 times
      + (contributeEthToTaskCost * 50) // only colony admins are allowed to contribute eth and tokens
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
        assert.isBelow(totalEtherCost, 1, 'Monthly average costs exceed target');
      } else {
        console.log('IGNORING THE RESULT DUE TO TESTRPC INACCURICIES IN ESTIMATEGAS');
      }

      done();
    });
  });
});
