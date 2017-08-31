/* globals artifacts */
const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const EternalStorage = artifacts.require('EternalStorage');

contract('all', function (accounts) {
  const gasPrice = 20e9;
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
    ColonyNetwork.deployed()
    .then(function (instance) {
      rootColony = instance;
      console.log('Gas price : ', gasPrice);
    })
    .then(done)
    .catch(done);
  });

  beforeEach(function (done) {
    EternalStorage.new({ gasPrice })
    .then(function (contract) {
      eternalStorage = contract;
      return eternalStorage.changeOwner(rootColony.address);
    })
    .then(function () {
      return rootColony.registerEternalStorage(eternalStorage.address);
    })
    .then(function () {
      return rootColony.createColony.estimateGas('Antz');
    })
    .then(function (estimate) {
      console.log('createColony estimate : ', estimate);
      return rootColony.createColony('Antz', { gasPrice });
    })
    .then(function (tx) {
      console.log('createColony actual cost : ', tx.receipt.gasUsed);
      return rootColony.getColony.call('Antz');
    })
    .then(function (colony_) {
      colony = Colony.at(colony_);
      Colony.defaults({ gasPrice });
    })
    .then(done)
    .catch(done);
  });

  // We currently only print out gas costs and no assertions are made about what these should be.
  describe('Gas costs ', function () {
    it('when working with a Colony', function (done) {
      // When working with tasks
      colony.makeTask.estimateGas('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01')
      .then(function (estimate) {
        console.log('makeTask estimate : ', estimate);
        return colony.makeTask('My new task', 'QmTDMoVqvyBkNMRhzvukTDznntByUNDwyNdSfV8dZ3VKRC01', { gasPrice });
      })
      .then(function (tx) {
        makeTaskCost = tx.receipt.gasUsed;
        console.log('makeTask actual cost :', makeTaskCost);
        return colony.updateTaskTitle.estimateGas(0, 'My updated task');
      })
      .then(function (estimate) {
        console.log('updateTaskTitle estimate : ', estimate);
        return colony.updateTaskTitle(0, 'My updated task', { gasPrice });
      })
      .then(function (tx) {
        updateTaskCost = tx.receipt.gasUsed;
        console.log('updateTaskTitle actual cost :', updateTaskCost);
        return colony.generateTokensWei.estimateGas(200);
      })
      .then(function (estimate) {
        console.log('generateTokensWei estimate : ', estimate);
        return colony.generateTokensWei(200, { gasPrice });
      })
      .then(function (tx) {
        generateColonyTokensCost = tx.receipt.gasUsed;
        console.log('generateTokensWei actual cost :', generateColonyTokensCost);
        return colony.contributeEthToTask.estimateGas(0, { value: 50 });
      })
      .then(function (estimate) {
        console.log('contributeEthToTask estimate : ', estimate);
        return colony.contributeEthToTask(0, { value: 50, gasPrice });
      })
      .then(function (tx) {
        contributeEthToTaskCost = tx.receipt.gasUsed;
        console.log('contributeEthToTask actual cost :', contributeEthToTaskCost);
        return colony.setReservedTokensForTask.estimateGas(0, 50);
      })
      .then(function (estimate) {
        console.log('setReservedTokensForTask estimate : ', estimate);
        return colony.setReservedTokensForTask(0, 50, { gasPrice });
      })
      .then(function (tx) {
        contributeTokensToTaskCost = tx.receipt.gasUsed;
        console.log('setReservedTokensForTask actual cost :', contributeTokensToTaskCost);
        return colony.completeAndPayTask.estimateGas(0, OTHER_ACCOUNT);
      })
      .then(function (estimate) {
        console.log('completeAndPayTask estimate: ', estimate);
        return colony.completeAndPayTask(0, OTHER_ACCOUNT, { gasPrice });
      })
      .then(function (tx) {
        completeAndPayTaskCost = tx.receipt.gasUsed;
        console.log('completeAndPayTask actual cost :', completeAndPayTaskCost);
        return colony.transfer.estimateGas(MAIN_ACCOUNT, 1, { from: OTHER_ACCOUNT });
      })
      .then(function (estimate) {
        console.log('transfer estimate : ', estimate);
        return colony.transfer(MAIN_ACCOUNT, 1, { from: OTHER_ACCOUNT, gasPrice });
      })
      .then(function (tx) {
        console.log('transfer actual cost :', tx.receipt.gasUsed);
        return colony.addUserToRole.estimateGas(OTHER_ACCOUNT, 1);
      })
      .then(function (estimate) {
        console.log('addUserToRole estimate : ', estimate);
        return colony.addUserToRole(OTHER_ACCOUNT, 1, { gasPrice });
      })
      .then(function (tx) {
        console.log('addUserToRole actual cost :', tx.receipt.gasUsed);
        return colony.removeUserFromRole.estimateGas(OTHER_ACCOUNT, 1);
      })
      .then(function (estimate) {
        console.log('removeUserFromRole estimate : ', estimate);
        return colony.removeUserFromRole(OTHER_ACCOUNT, 1, { gasPrice });
      })
      .then(function (tx) {
        console.log('removeUserFromRole actual cost :', tx.receipt.gasUsed);
        done();
      })
      .catch(done);
    });

    it('Average gas costs for customers should not exceed 1 ETH per month', function (done) {
      const totalGasCost = (makeTaskCost * 100) // assume 100 tasks per month are created
      + (updateTaskCost * 20) // assume 20% of all tasks are updated once
      + (contributeTokensToTaskCost * 100) // assume all new tasks have their budget set once
      + (completeAndPayTaskCost * 25) // quarter of all tasks are closed and paid out
      + (generateColonyTokensCost * 1); // only once per month are new colony tokens generated

      const totalEtherCost = web3.fromWei(totalGasCost * gasPrice, 'ether');
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
