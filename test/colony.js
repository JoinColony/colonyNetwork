/* globals artifacts */

import { toBN } from "web3-utils";
import chai from "chai";
import bnChai from "bn-chai";

import {
  MANAGER_ROLE,
  EVALUATOR_ROLE,
  WORKER_ROLE,
  SPECIFICATION_HASH,
  SPECIFICATION_HASH_UPDATED,
  DELIVERABLE_HASH,
  INITIAL_FUNDING,
  SECONDS_PER_DAY,
  MANAGER_RATING,
  WORKER_RATING,
  RATING_1_SALT,
  RATING_2_SALT,
  RATING_1_SECRET,
  RATING_2_SECRET,
  MANAGER_PAYOUT,
  WORKER_PAYOUT,
  EVALUATOR_PAYOUT,
  ACTIVE_TASK_STATE,
  CANCELLED_TASK_STATE,
  FINALIZED_TASK_STATE
} from "../helpers/constants";
import {
  getTokenArgs,
  web3GetBalance,
  checkErrorRevert,
  expectEvent,
  expectAllEvents,
  forwardTime,
  currentBlockTime,
  createSignatures,
  getFunctionSignature
} from "../helpers/test-helper";
import {
  fundColonyWithTokens,
  setupRatedTask,
  setupAssignedTask,
  setupFundedTask,
  executeSignedTaskChange,
  executeSignedRoleAssignment,
  makeTask
} from "../helpers/test-data-generator";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const Colony = artifacts.require("Colony");
const Resolver = artifacts.require("Resolver");
const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const Authority = artifacts.require("Authority");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

contract("Colony", accounts => {
  const MANAGER = accounts[0];
  const EVALUATOR = MANAGER;
  const WORKER = accounts[2];
  const OTHER = accounts[3];

  let colony;
  let token;
  let otherToken;
  let authority;
  let colonyNetwork;

  before(async () => {
    const resolverColonyNetworkDeployed = await Resolver.deployed();
    const colonyTemplate = await Colony.new();
    const colonyFunding = await ColonyFunding.new();
    const colonyTask = await ColonyTask.new();
    const resolver = await Resolver.new();
    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await setupColonyVersionResolver(colonyTemplate, colonyTask, colonyFunding, resolver, colonyNetwork);

    const clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createMetaColony(clnyToken.address);

    // Jumping through these hoops to avoid the need to rewire ReputationMiningCycleResolver.
    const deployedColonyNetwork = await IColonyNetwork.at(EtherRouter.address);
    const reputationMiningCycleResolverAddress = await deployedColonyNetwork.getMiningResolver();
    await colonyNetwork.setMiningResolver(reputationMiningCycleResolverAddress);

    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
  });

  beforeEach(async () => {
    const tokenArgs = getTokenArgs();
    token = await Token.new(...tokenArgs);
    const { logs } = await colonyNetwork.createColony(token.address);
    const { colonyAddress } = logs[0].args;
    await token.setOwner(colonyAddress);
    colony = await IColony.at(colonyAddress);
    const authorityAddress = await colony.authority();
    authority = await Authority.at(authorityAddress);
    const otherTokenArgs = getTokenArgs();
    otherToken = await Token.new(...otherTokenArgs);
  });

  describe("when initialised", () => {
    it("should accept ether", async () => {
      await colony.send(1);
      const colonyBalance = await web3GetBalance(colony.address);
      assert.equal(colonyBalance, 1);
    });

    it("should not have owner", async () => {
      const owner = await colony.owner();
      assert.equal(owner, "0x0000000000000000000000000000000000000000");
    });

    it("should return zero task count", async () => {
      const taskCount = await colony.getTaskCount();
      assert.equal(taskCount, 0);
    });

    it("should return zero for taskChangeNonce", async () => {
      const taskChangeNonce = await colony.getTaskChangeNonce(1);
      assert.equal(taskChangeNonce, 0);
    });

    it("should fail if a non-admin tries to mint tokens", async () => {
      await checkErrorRevert(colony.mintTokens(100, { from: OTHER }));
    });

    it("should not allow reinitialisation", async () => {
      await checkErrorRevert(colony.initialiseColony(0x0), "colony-initialise-bad-address");
    });

    it("should correctly generate a rating secret", async () => {
      const ratingSecret1 = await colony.generateSecret(RATING_1_SALT, MANAGER_RATING);
      assert.equal(ratingSecret1, RATING_1_SECRET);
      const ratingSecret2 = await colony.generateSecret(RATING_2_SALT, WORKER_RATING);
      assert.equal(ratingSecret2, RATING_2_SECRET);
    });

    it("should initialise the root domain", async () => {
      // There should be one domain (the root domain)
      const domainCount = await colony.getDomainCount();
      assert.equal(domainCount, 1);

      const domain = await colony.getDomain(domainCount);

      // The first pot should have been created and assigned to the domain
      assert.equal(domain[1], 1);

      // A root skill should have been created for the Colony
      const rootLocalSkillId = await colonyNetwork.getSkillCount();
      assert.equal(domain[0].toNumber(), rootLocalSkillId.toNumber());
    });
  });

  describe("when working with permissions", () => {
    it("should allow current owner role to transfer role to another address", async () => {
      const ownerRole = 0;
      const currentOwner = accounts[0];
      const futureOwner = accounts[2];

      let hasRole = await authority.hasUserRole(currentOwner, ownerRole);
      assert(hasRole, `${currentOwner} does not have owner role`);

      await colony.setOwnerRole(futureOwner);

      hasRole = await authority.hasUserRole(futureOwner, ownerRole);
      assert(hasRole, `Ownership not transfered to ${futureOwner}`);
    });

    it("should allow admin to assign colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user5 = accounts[5];

      await colony.setAdminRole(user1);

      const functionSig = getFunctionSignature("setAdminRole(address)");
      const canCall = await authority.canCall(user1, colony.address, functionSig);
      assert(canCall, `Address ${user1} can't call 'setAdminRole' function`);

      await colony.setAdminRole(user5, {
        from: user1
      });

      const hasRole = await authority.hasUserRole(user5, adminRole);
      assert(hasRole, `Admin role not assigned to ${user5}`);
    });

    it("should allow owner to remove colony admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];

      await colony.setAdminRole(user1);

      let hasRole = await authority.hasUserRole(user1, adminRole);
      assert(hasRole, `Admin role not assigned to ${user1}`);

      await colony.removeAdminRole(user1);

      hasRole = await authority.hasUserRole(user1, adminRole);
      assert(!hasRole, `Admin role not removed from ${user1}`);
    });

    it("should not allow admin to remove admin role", async () => {
      const adminRole = 1;

      const user1 = accounts[1];
      const user2 = accounts[2];

      await colony.setAdminRole(user1);
      await colony.setAdminRole(user2);

      let hasRole = await authority.hasUserRole(user1, adminRole);
      assert(hasRole, `Admin role not assigned to ${user1}`);
      hasRole = await authority.hasUserRole(user2, adminRole);
      assert(hasRole, `Admin role not assigned to ${user2}`);

      await checkErrorRevert(
        colony.removeAdminRole(user1, {
          from: user2
        })
      );

      hasRole = await authority.hasUserRole(user1, adminRole);
      assert(hasRole, `${user1} is removed from admin role from another admin`);
    });

    it("should allow admin to call predetermined functions", async () => {
      const user3 = accounts[3];

      await colony.setAdminRole(user3);

      let functionSig = getFunctionSignature("moveFundsBetweenPots(uint256,uint256,uint256,address)");
      let canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("addDomain(uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("makeTask(bytes32,uint256,uint256,uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("startNextRewardPayout(address,bytes,bytes,uint256,bytes32[])");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("cancelTask(uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, true);

      functionSig = getFunctionSignature("bootstrapColony(address[],uint256[])");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, false);

      functionSig = getFunctionSignature("mintTokens(uint256)");
      canCall = await authority.canCall(user3, colony.address, functionSig);
      assert.equal(canCall, false);
    });
  });

  describe("when adding domains", () => {
    it("should log DomainAdded and PotAdded events", async () => {
      await expectAllEvents(colony.addDomain(1), ["DomainAdded", "PotAdded"]);
    });
  });

  describe("when creating tasks", () => {
    it("should allow admins to make task", async () => {
      const dueDate = await currentBlockTime();
      await makeTask({ colony, dueDate });
      const task = await colony.getTask(1);
      assert.equal(task[0], SPECIFICATION_HASH);
      assert.equal(task[1], "0x0000000000000000000000000000000000000000000000000000000000000000");
      assert.equal(task[2].toNumber(), ACTIVE_TASK_STATE);
      assert.equal(task[3].toNumber(), dueDate);
      assert.equal(task[4].toNumber(), 0);
    });

    it("should fail if a non-admin user tries to make a task", async () => {
      await checkErrorRevert(colony.makeTask(SPECIFICATION_HASH, 1, 0, 0, { from: OTHER }));
      const taskCount = await colony.getTaskCount();
      assert.equal(taskCount.toNumber(), 0);
    });

    it("should set the task manager as the creator and evaluator", async () => {
      const taskId = await makeTask({ colony });

      const taskCount = await colony.getTaskCount();
      assert.equal(taskCount.toNumber(), 1);

      const taskManager = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(taskManager[0], MANAGER);

      const taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.equal(taskEvaluator[0], MANAGER);
    });

    it("should allow the reassignment of evaluator", async () => {
      const newEvaluator = accounts[1];
      assert.notEqual(MANAGER, newEvaluator);

      const taskId = await makeTask({ colony });

      let taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.equal(taskEvaluator[0], EVALUATOR);

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER], // NOTE: only one signature because manager === evaluator
        sigTypes: [0],
        args: [taskId]
      });

      taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.equal(taskEvaluator[0], "0x0000000000000000000000000000000000000000");

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator]
      });

      taskEvaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.equal(taskEvaluator[0], newEvaluator);
    });

    it("should return the correct number of tasks", async () => {
      await makeTask({ colony });
      await makeTask({ colony });
      await makeTask({ colony });
      await makeTask({ colony });
      await makeTask({ colony });
      const taskCount = await colony.getTaskCount();

      assert.equal(taskCount.toNumber(), 5);
    });

    it("should set the task domain correctly", async () => {
      await colony.addDomain(1);
      await makeTask({ colony, domainId: 2 });
      const task = await colony.getTask(1);
      assert.equal(task[7].toNumber(), 2);
    });

    it("should log TaskAdded and PotAdded events", async () => {
      await expectAllEvents(colony.makeTask(SPECIFICATION_HASH, 1, 0, 0), ["TaskAdded", "PotAdded"]);
    });

    it("should optionally set the skill and due date", async () => {
      const skillId = 1;
      const currTime = await currentBlockTime();
      const dueDate = currTime + SECONDS_PER_DAY * 10;

      const taskId = await makeTask({ colony, skillId, dueDate });
      const task = await colony.getTask(taskId);
      assert.equal(task[3].toNumber(), dueDate);
      assert.equal(task[8][0].toNumber(), skillId);
    });

    it("should set the due date to 90 days from now if unspecified", async () => {
      const skillId = 1;
      const dueDate = 0;
      const taskId = await makeTask({ colony, skillId, dueDate });
      const task = await colony.getTask(taskId);
      const currTime = await currentBlockTime();
      const expectedDueDate = currTime + SECONDS_PER_DAY * 90;
      assert.equal(task[3].toNumber(), expectedDueDate);
    });
  });

  describe("when bootstrapping the colony", () => {
    const INITIAL_REPUTATIONS = [toBN(5 * 1e18).toString(), toBN(4 * 1e18).toString(), toBN(3 * 1e18).toString(), toBN(2 * 1e18).toString()];
    const INITIAL_ADDRESSES = accounts.slice(0, 4);

    it("should assign reputation correctly when bootstrapping the colony", async () => {
      const skillCount = await colonyNetwork.getSkillCount();

      await colony.mintTokens(toBN(14 * 1e18).toString());
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);
      const inactiveReputationMiningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const inactiveReputationMiningCycle = await IReputationMiningCycle.at(inactiveReputationMiningCycleAddress);
      const numberOfReputationLogs = await inactiveReputationMiningCycle.getReputationUpdateLogLength();
      assert.equal(numberOfReputationLogs.toNumber(), INITIAL_ADDRESSES.length);
      const updateLog = await inactiveReputationMiningCycle.getReputationUpdateLogEntry(0);
      assert.equal(updateLog[0], INITIAL_ADDRESSES[0]);
      assert.equal(updateLog[1].toString(), INITIAL_REPUTATIONS[0]);
      assert.equal(updateLog[2].toString(), skillCount.toNumber());
    });

    it("should assign tokens correctly when bootstrapping the colony", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), INITIAL_REPUTATIONS[0]);
    });

    it("should be able to bootstrap colony more than once", async () => {
      const amount = toBN(10 * 1e18).toString();
      await colony.mintTokens(amount);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);
      await colony.bootstrapColony([INITIAL_ADDRESSES[0]], [INITIAL_REPUTATIONS[0]]);

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), amount);
    });

    it("should throw if length of inputs is not equal", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(colony.bootstrapColony([INITIAL_ADDRESSES[0]], INITIAL_REPUTATIONS), "colony-bootstrap-bad-inputs");
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, [INITIAL_REPUTATIONS[0]]), "colony-bootstrap-bad-inputs");
    });

    it("should not allow negative number", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(
        colony.bootstrapColony(
          [INITIAL_ADDRESSES[0]],
          [
            toBN(5 * 1e18)
              .neg()
              .toString()
          ]
        ),
        "colony-bootstrap-bad-amount-input"
      );
    });

    it("should throw if there is not enough funds to send", async () => {
      await colony.mintTokens(toBN(10 * 1e18).toString());
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS));

      const balance = await token.balanceOf(INITIAL_ADDRESSES[0]);
      assert.equal(balance.toString(), "0");
    });

    it("should not allow non-creator to bootstrap reputation", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await checkErrorRevert(
        colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS, {
          from: accounts[1]
        })
      );
    });

    it("should not allow bootstrapping if colony is not in bootstrap state", async () => {
      await colony.mintTokens(toBN(14 * 1e18).toString());
      await makeTask({ colony });
      await checkErrorRevert(colony.bootstrapColony(INITIAL_ADDRESSES, INITIAL_REPUTATIONS), "colony-not-in-bootstrap-mode");
    });
  });

  describe("when updating tasks", () => {
    it("should not be able to pass unallowed function signature to `executeTaskRoleAssignment`", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskDueDate",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-change-is-not-role-assignement"
      );
    });

    it("should not be able to send any ether while assigning a role", async () => {
      const taskId = await makeTask({ colony });

      const sigTypes = [0, 0];
      const signers = [MANAGER, WORKER];
      const txData = await colony.contract.methods.setTaskWorkerRole(taskId, WORKER).encodeABI();
      const sigsPromises = sigTypes.map((type, i) => createSignatures(colony, taskId, [signers[i]], 0, txData));
      const sigs = await Promise.all(sigsPromises);
      const sigV = sigs.map(sig => sig.sigV[0]);
      const sigR = sigs.map(sig => sig.sigR[0]);
      const sigS = sigs.map(sig => sig.sigS[0]);

      await checkErrorRevert(colony.executeTaskRoleAssignment(sigV, sigR, sigS, sigTypes, 10, txData), "colony-task-role-assignment-non-zero-value");
    });

    it("should allow the worker and evaluator roles to be assigned", async () => {
      const newEvaluator = accounts[1];
      assert.notEqual(MANAGER, newEvaluator);

      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator]
      });

      const worker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(worker[0], WORKER);

      const evaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.equal(evaluator[0], newEvaluator);
    });

    it("should not allow the worker or evaluator roles to be assigned only by manager", async () => {
      const newEvaluator = accounts[1];
      assert.notEqual(MANAGER, newEvaluator);

      const taskId = await makeTask({ colony });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskEvaluatorRole",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, newEvaluator]
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );

      const evaluator = await colony.getTaskRole(taskId, EVALUATOR_ROLE);
      assert.equal(evaluator[0], "0x0000000000000000000000000000000000000000");

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );

      const worker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(worker[0], "0x0000000000000000000000000000000000000000");
    });

    it("should not allow role to be assigned if it is already assigned to somebody", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER]
        }),
        "colony-task-role-assignment-execution-failed"
      );

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskEvaluatorRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER]
        }),
        "colony-task-role-assignment-execution-failed"
      );
    });

    it("should allow role to be unassigned, as long as the current assigned address agrees", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      let workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(workerInfo[0], WORKER);

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId]
      });

      workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(workerInfo[0], "0x0000000000000000000000000000000000000000");
    });

    it("should not allow role to be unassigned, if current assigned address does not agree", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, 0x0]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(workerInfo[0], WORKER);
    });

    it("should not allow role to be assigned if passed address is not equal to one of the signers", async () => {
      const newEvaluator = accounts[1];
      assert.notEqual(MANAGER, newEvaluator);

      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, newEvaluator]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(workerInfo[0], "0x0000000000000000000000000000000000000000");
    });

    it("should allow manager to assign himself to a role", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, MANAGER]
      });

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(workerInfo[0], MANAGER);
    });

    it("should not allow anyone to assign himself to a role with one signature except manager", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [WORKER],
          sigTypes: [0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-does-not-meet-required-signatures"
      );

      const workerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(workerInfo[0], "0x0000000000000000000000000000000000000000");
    });

    it("should allow different modes of signing when assigning roles", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [WORKER, MANAGER],
        sigTypes: [0, 1],
        args: [taskId, WORKER]
      });

      const worker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(worker[0], WORKER);
    });

    it("should not allow role assignment if none of the signers is manager", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [WORKER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );

      const worker = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(worker[0], "0x0000000000000000000000000000000000000000");
    });

    it("should allow to change manager role if the user agrees", async () => {
      const taskId = await makeTask({ colony });

      await colony.setAdminRole(OTHER);

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskManagerRole",
        signers: [MANAGER, OTHER],
        sigTypes: [0, 0],
        args: [taskId, OTHER]
      });

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(managerInfo[0], OTHER);
    });

    it("should not allow assignment of manager to other role with 1 signature if signer is not manager", async () => {
      const taskId = await makeTask({ colony });

      await colony.setAdminRole(OTHER);

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [OTHER],
          sigTypes: [0],
          args: [taskId, MANAGER]
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );

      const managerInfo = await colony.getTaskRole(taskId, WORKER_ROLE);
      assert.equal(managerInfo[0], "0x0000000000000000000000000000000000000000");
    });

    it("should not allow assignment of manager role if the user does not agree", async () => {
      const taskId = await makeTask({ colony });

      await colony.setAdminRole(OTHER);

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, OTHER]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(managerInfo[0], MANAGER);
    });

    it("should not allow assignment of manager role if user is not an admin", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, OTHER]
        }),
        "colony-task-role-assignment-execution-failed"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(managerInfo[0], MANAGER);
    });

    it("should not allow removal of manager role", async () => {
      const taskId = await makeTask({ colony });

      await colony.setAdminRole(OTHER);

      await checkErrorRevert(
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, 0x0]
        }),
        "colony-task-role-assignment-not-signed-by-new-user-for-role"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(managerInfo[0], MANAGER);
    });

    it("should not allow assignment of manager role if current manager is not one of the signers", async () => {
      const newEvaluator = accounts[1];
      assert.notEqual(MANAGER, newEvaluator);

      const taskId = await makeTask({ colony });
      await colony.setAdminRole(WORKER);

      // Setting the worker
      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      // Setting the evaluator
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "removeTaskEvaluatorRole",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId]
      });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskEvaluatorRole",
        signers: [MANAGER, newEvaluator],
        sigTypes: [0, 0],
        args: [taskId, newEvaluator]
      });

      await checkErrorRevert(
        // Evaluator and worker trying to set a manager
        executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskManagerRole",
          signers: [newEvaluator, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "colony-task-role-assignment-not-signed-by-manager"
      );

      const managerInfo = await colony.getTaskRole(taskId, MANAGER_ROLE);
      assert.equal(managerInfo[0], MANAGER);
    });

    it("should correctly increment `taskChangeNonce` for multiple updates on a single task", async () => {
      const taskId = await makeTask({ colony });

      // Change the task brief
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });

      let taskChangeNonce = await colony.getTaskChangeNonce(taskId);
      assert.equal(taskChangeNonce, 1);

      // Change the due date
      const dueDate = await currentBlockTime();

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, dueDate]
      });

      taskChangeNonce = await colony.getTaskChangeNonce(taskId);
      assert.equal(taskChangeNonce, 2);
    });

    it("should correctly increment `taskChangeNonce` for multiple updates on multiple tasks", async () => {
      const taskId1 = await makeTask({ colony });
      const taskId2 = await makeTask({ colony });

      // Change the task1 brief
      await executeSignedTaskChange({
        colony,
        taskId: taskId1,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId1, SPECIFICATION_HASH_UPDATED]
      });
      let taskChangeNonce = await colony.getTaskChangeNonce(taskId1);
      assert.equal(taskChangeNonce, 1);

      await executeSignedTaskChange({
        colony,
        taskId: taskId2,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId2, SPECIFICATION_HASH_UPDATED]
      });

      taskChangeNonce = await colony.getTaskChangeNonce(taskId2);
      assert.equal(taskChangeNonce, 1);

      // Change the task2 due date
      const dueDate = await currentBlockTime();

      await executeSignedTaskChange({
        colony,
        taskId: taskId2,
        functionName: "setTaskDueDate",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId2, dueDate]
      });

      taskChangeNonce = await colony.getTaskChangeNonce(taskId2);
      assert.equal(taskChangeNonce, 2);
    });

    it("should allow update of task brief signed by manager only when worker has not been assigned", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });
      const task = await colony.getTask(taskId);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });
      const task = await colony.getTask(taskId);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker using Trezor-style signatures", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [1, 1],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });
      const task = await colony.getTask(taskId);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should allow update of task brief signed by manager and worker if one uses Trezor-style signatures and the other does not", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskBrief",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 1],
        args: [taskId, SPECIFICATION_HASH_UPDATED]
      });
      const task = await colony.getTask(taskId);
      assert.equal(task[0], SPECIFICATION_HASH_UPDATED);
    });

    it("should not allow update of task brief signed by manager twice, with two different signature styles", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER, MANAGER],
          sigTypes: [0, 1],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-duplicate-reviewers"
      );
      const task = await colony.getTask(taskId);
      assert.equal(task[0], SPECIFICATION_HASH);
    });

    it("should allow update of task due date signed by manager and worker", async () => {
      const dueDate = await currentBlockTime();

      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskDueDate",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, dueDate]
      });

      const task = await colony.getTask(taskId);
      assert.equal(task[3], dueDate);
    });

    it("should not allow update of task due if it is trying to be set to 0", async () => {
      const dueDate = await currentBlockTime();

      const taskId = await makeTask({ colony, dueDate });

      await checkErrorRevert(
        executeSignedTaskChange({ colony, taskId, functionName: "setTaskDueDate", signers: [MANAGER], sigTypes: [0], args: [taskId, 0] }),
        "colony-task-change-execution-failed"
      );

      const task = await colony.getTask(taskId);
      assert.equal(task[3], dueDate);
    });

    it("should fail if a non-colony call is made to the task update functions", async () => {
      await makeTask({ colony });
      await checkErrorRevert(colony.setTaskBrief(1, SPECIFICATION_HASH_UPDATED, { from: OTHER }), "colony-not-self");
    });

    it("should fail update of task brief signed by a non-registered role", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER, OTHER],
          sigTypes: [0, 0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail update of task brief signed by manager and evaluator", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail to execute task change for a non-registered function signature", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "getTaskRole",
          signers: [MANAGER, EVALUATOR],
          sigTypes: [0, 0],
          args: [taskId, 0]
        }),
        "colony-task-change-does-not-meet-signatures-required"
      );
    });

    it("should fail to execute change of task brief, using an invalid task id", async () => {
      const taskId = await makeTask({ colony });

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [10, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-does-not-exist"
      );
    });

    it("should fail to execute task change, if the task is already finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);

      await checkErrorRevert(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "colony-task-finalized"
      );
    });

    it("should log a TaskBriefChanged event, if the task brief gets changed", async () => {
      const taskId = await makeTask({ colony });

      await expectEvent(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskBrief",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, SPECIFICATION_HASH_UPDATED]
        }),
        "TaskBriefChanged"
      );
    });

    it("should log a TaskDueDateChanged event, if the task due date gets changed", async () => {
      const taskId = await makeTask({ colony });

      const dueDate = await currentBlockTime();
      await expectEvent(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskDueDate",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, dueDate]
        }),
        "TaskDueDateChanged"
      );
    });

    it("should log a TaskSkillChanged event, if the task skill gets changed", async () => {
      const taskId = await makeTask({ colony });

      // Acquire meta colony, create new global skill, assign new task's skill
      const metaColonyAddress = await colonyNetwork.getMetaColony();
      const metaColony = await IColony.at(metaColonyAddress);
      await metaColony.addGlobalSkill(1);

      const skillCount = await colonyNetwork.getSkillCount();

      await expectEvent(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskSkill",
          signers: [MANAGER],
          sigTypes: [0],
          args: [taskId, skillCount.toNumber()]
        }),
        "TaskSkillChanged"
      );
    });

    it("should log a TaskDomainChanged event, if the task domain gets changed", async () => {
      const taskId = await makeTask({ colony });
      await colony.addDomain(1);
      await expectEvent(colony.setTaskDomain(taskId, 2), "TaskDomainChanged");
    });

    it("should log a TaskRoleUserChanged event, if a task role's user gets changed", async () => {
      const taskId = await makeTask({ colony });

      // Change the task role's user
      await expectEvent(
        await executeSignedRoleAssignment({
          colony,
          taskId,
          functionName: "setTaskWorkerRole",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, WORKER]
        }),
        "TaskRoleUserChanged"
      );
    });
  });

  describe("when submitting task deliverable", () => {
    it("should update task", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });

      let task = await colony.getTask(1);
      assert.equal(task[1], "0x0000000000000000000000000000000000000000000000000000000000000000");

      const currentTime = await currentBlockTime();
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });
      task = await colony.getTask(1);
      assert.equal(task[1], DELIVERABLE_HASH);
      assert.closeTo(task[6].toNumber(), currentTime, 2);
    });

    it("should fail if I try to submit work for a task that is complete", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, token, dueDate });
      await colony.completeTask(taskId);
      await checkErrorRevert(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH), "colony-task-complete");
    });

    it("should fail if I try to submit work for a task that is finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupRatedTask({ colonyNetwork, colony, dueDate, token });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH), "colony-task-complete");
    });

    it("should succeed if I try to submit work for a task that is past its due date but not yet marked as complete", async () => {
      let dueDate = await currentBlockTime();
      dueDate -= 1;
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(taskId, DELIVERABLE_HASH, { from: WORKER });
      const task = await colony.getTask(taskId);
      assert.equal(task[1], DELIVERABLE_HASH);
    });

    it("should fail if I try to submit work for a task using an invalid id", async () => {
      await checkErrorRevert(colony.submitTaskDeliverable(10, DELIVERABLE_HASH), "colony-task-does-not-exist");
    });

    it("should fail if I try to submit work twice", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });
      await colony.submitTaskDeliverable(1, DELIVERABLE_HASH, { from: WORKER });

      await checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: WORKER }), "colony-task-complete");
      const task = await colony.getTask(1);
      assert.equal(task[1], DELIVERABLE_HASH);
    });

    it("should fail if I try to submit work if I'm not the assigned worker", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await checkErrorRevert(colony.submitTaskDeliverable(1, SPECIFICATION_HASH, { from: OTHER }), "colony-task-role-identity-mismatch");
      const task = await colony.getTask(1);
      assert.notEqual(task[1], DELIVERABLE_HASH);
    });

    it("should log a TaskDeliverableSubmitted event", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 4;
      await setupAssignedTask({ colonyNetwork, colony, dueDate });

      await expectEvent(
        colony.submitTaskDeliverable(1, DELIVERABLE_HASH, {
          from: WORKER
        }),
        "TaskDeliverableSubmitted"
      );
    });
  });

  describe("when finalizing a task", () => {
    it('should set the task "status" property to "finalized"', async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      const task = await colony.getTask(taskId);
      assert.equal(task[2].toNumber(), FINALIZED_TASK_STATE);
    });

    it("should fail if the task work ratings have not been assigned and they still have time to be", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupAssignedTask({ colonyNetwork, colony, dueDate, token });
      await colony.completeTask(taskId);
      await checkErrorRevert(colony.finalizeTask(taskId), "colony-task-ratings-incomplete");
    });

    it("should fail if I try to accept a task that was finalized before", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.finalizeTask(taskId), "colony-task-already-finalized");
    });

    it("should fail if I try to accept a task using an invalid id", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await setupRatedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.finalizeTask(10), "colony-task-does-not-exist");
    });

    it("should log a TaskFinalized event", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await expectEvent(colony.finalizeTask(taskId), "TaskFinalized");
    });
  });

  describe("when cancelling a task", () => {
    it('should set the task "status" property to "cancelled"', async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });

      await colony.cancelTask(taskId);
      const task = await colony.getTask(taskId);
      assert.equal(task[2].toNumber(), CANCELLED_TASK_STATE);
    });

    it("should be possible to return funds back to the domain", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });
      const task = await colony.getTask(taskId);
      const domainId = task[7].toNumber();
      const domain = await colony.getDomain(domainId);
      const taskPotId = task[5];
      const domainPotId = domain[1];

      // Our test-data-generator already set up some task fund with tokens,
      // but we need some Ether, too
      await colony.send(101);
      await colony.claimColonyFunds(0x0);
      await colony.moveFundsBetweenPots(1, taskPotId, 100, 0x0);

      // And another token
      await otherToken.mint(101);
      await otherToken.transfer(colony.address, 101);
      await colony.claimColonyFunds(otherToken.address);
      await colony.moveFundsBetweenPots(1, taskPotId, 100, otherToken.address);

      // Keep track of original Ether balance in pots
      const originalDomainEtherBalance = await colony.getPotBalance(domainPotId, 0x0);
      const originalTaskEtherBalance = await colony.getPotBalance(taskPotId, 0x0);
      // And same for the token
      const originalDomainTokenBalance = await colony.getPotBalance(domainPotId, token.address);
      const originalTaskTokenBalance = await colony.getPotBalance(taskPotId, token.address);
      // And the other token
      const originalDomainOtherTokenBalance = await colony.getPotBalance(domainPotId, otherToken.address);
      const originalTaskOtherTokenBalance = await colony.getPotBalance(taskPotId, otherToken.address);

      // Now that everything is set up, let's cancel the task, move funds and compare pots afterwards
      await colony.cancelTask(taskId);
      await colony.moveFundsBetweenPots(taskPotId, domainPotId, originalTaskEtherBalance, 0x0);
      await colony.moveFundsBetweenPots(taskPotId, domainPotId, originalTaskTokenBalance, token.address);
      await colony.moveFundsBetweenPots(taskPotId, domainPotId, originalTaskOtherTokenBalance, otherToken.address);

      const cancelledTaskEtherBalance = await colony.getPotBalance(taskPotId, 0x0);
      const cancelledDomainEtherBalance = await colony.getPotBalance(domainPotId, 0x0);
      const cancelledTaskTokenBalance = await colony.getPotBalance(taskPotId, token.address);
      const cancelledDomainTokenBalance = await colony.getPotBalance(domainPotId, token.address);
      const cancelledTaskOtherTokenBalance = await colony.getPotBalance(taskPotId, otherToken.address);
      const cancelledDomainOtherTokenBalance = await colony.getPotBalance(domainPotId, otherToken.address);
      assert.isFalse(originalTaskEtherBalance.eq(cancelledTaskEtherBalance));
      assert.isFalse(originalDomainEtherBalance.eq(cancelledDomainEtherBalance));
      assert.isFalse(originalTaskTokenBalance.eq(cancelledTaskTokenBalance));
      assert.isFalse(originalDomainTokenBalance.eq(cancelledDomainTokenBalance));
      assert.isFalse(originalTaskOtherTokenBalance.eq(cancelledTaskOtherTokenBalance));
      assert.isFalse(originalDomainOtherTokenBalance.eq(cancelledDomainOtherTokenBalance));
      assert.equal(cancelledTaskEtherBalance.toNumber(), 0);
      assert.equal(cancelledTaskTokenBalance.toNumber(), 0);
      assert.equal(cancelledTaskOtherTokenBalance.toNumber(), 0);
      expect(originalDomainEtherBalance.add(originalTaskEtherBalance)).to.eq.BN(cancelledDomainEtherBalance);
      expect(originalDomainTokenBalance.add(originalTaskTokenBalance)).to.eq.BN(cancelledDomainTokenBalance);
      expect(originalDomainOtherTokenBalance.add(originalTaskOtherTokenBalance)).to.eq.BN(cancelledDomainOtherTokenBalance);
    });

    it("should fail if manager tries to cancel a task that was finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      await checkErrorRevert(colony.cancelTask(taskId), "colony-task-already-finalized");
    });

    it("should fail if manager tries to cancel a task with invalid id", async () => {
      await checkErrorRevert(colony.cancelTask(10), "colony-task-does-not-exist");
    });

    it("should log a TaskCanceled event", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await expectEvent(colony.cancelTask(taskId), "TaskCanceled");
    });
  });

  describe("when funding tasks", () => {
    it("should be able to set the task payouts for different roles", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;

      const taskId = await makeTask({ colony, dueDate });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });
      await colony.mintTokens(100);

      // Set the manager payout as 5000 wei and 100 colony tokens
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 0x0, 5000]
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskManagerPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 100]
      });

      // Set the evaluator payout as 1000 ethers
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskEvaluatorPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, 0x0, 1000]
      });

      // Set the evaluator payout as 40 colony tokens
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskEvaluatorPayout",
        signers: [MANAGER],
        sigTypes: [0],
        args: [taskId, token.address, 40]
      });

      // Set the worker payout as 98000 wei and 200 colony tokens
      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, 0x0, 98000]
      });

      await executeSignedTaskChange({
        colony,
        taskId,
        functionName: "setTaskWorkerPayout",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, token.address, 200]
      });

      const taskPayoutManager1 = await colony.getTaskPayout(taskId, MANAGER_ROLE, 0x0);
      assert.equal(taskPayoutManager1.toNumber(), 5000);
      const taskPayoutManager2 = await colony.getTaskPayout(taskId, MANAGER_ROLE, token.address);
      assert.equal(taskPayoutManager2.toNumber(), 100);

      const taskPayoutEvaluator1 = await colony.getTaskPayout(taskId, EVALUATOR_ROLE, 0x0);
      assert.equal(taskPayoutEvaluator1.toNumber(), 1000);
      const taskPayoutEvaluator2 = await colony.getTaskPayout(taskId, EVALUATOR_ROLE, token.address);
      assert.equal(taskPayoutEvaluator2.toNumber(), 40);

      const taskPayoutWorker1 = await colony.getTaskPayout(taskId, WORKER_ROLE, 0x0);
      assert.equal(taskPayoutWorker1.toNumber(), 98000);
      const taskPayoutWorker2 = await colony.getTaskPayout(taskId, WORKER_ROLE, token.address);
      assert.equal(taskPayoutWorker2.toNumber(), 200);
    });

    it("should be able (if manager) to set all payments at once if evaluator and worker are manager or unassigned", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;

      const taskId = await makeTask({ colony, dueDate });
      await checkErrorRevert(colony.setAllTaskPayouts(taskId, 0x0, 5000, 1000, 98000, { from: OTHER }), "colony-funding-must-be-manager");
      await colony.setAllTaskPayouts(taskId, 0x0, 5000, 1000, 98000);

      const taskPayoutManager = await colony.getTaskPayout(taskId, MANAGER_ROLE, 0x0);
      assert.equal(taskPayoutManager.toNumber(), 5000);

      const taskPayoutEvaluator = await colony.getTaskPayout(taskId, EVALUATOR_ROLE, 0x0);
      assert.equal(taskPayoutEvaluator.toNumber(), 1000);

      const taskPayoutWorker = await colony.getTaskPayout(taskId, WORKER_ROLE, 0x0);
      assert.equal(taskPayoutWorker.toNumber(), 98000);
    });

    it("should not be able to set all payments at once if worker is assigned and not manager", async () => {
      let dueDate = await currentBlockTime();
      dueDate += SECONDS_PER_DAY * 7;

      const taskId = await makeTask({ colony, dueDate });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });

      await checkErrorRevert(colony.setAllTaskPayouts(taskId, 0x0, 5000, 1000, 98000), "colony-funding-worker-already-set");
    });

    it("should log a TaskWorkerPayoutChanged event, if the task's worker's payout changed", async () => {
      const taskId = await makeTask({ colony });

      await executeSignedRoleAssignment({
        colony,
        taskId,
        functionName: "setTaskWorkerRole",
        signers: [MANAGER, WORKER],
        sigTypes: [0, 0],
        args: [taskId, WORKER]
      });
      await colony.mintTokens(100);

      // Set the worker payout as 98000 wei
      await expectEvent(
        executeSignedTaskChange({
          colony,
          taskId,
          functionName: "setTaskWorkerPayout",
          signers: [MANAGER, WORKER],
          sigTypes: [0, 0],
          args: [taskId, 0x0, 98000]
        }),
        "TaskWorkerPayoutChanged"
      );
    });

    it("should correctly return the current total payout", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupFundedTask({ colonyNetwork, colony, token });

      const totalTokenPayout = await colony.getTotalTaskPayout(taskId, token.address);
      const totalTokenPayoutExpected = MANAGER_PAYOUT.add(EVALUATOR_PAYOUT).add(WORKER_PAYOUT);
      assert.equal(totalTokenPayout.toString(), totalTokenPayoutExpected.toString());
    });
  });

  describe("when claiming payout for a task", () => {
    it("should payout agreed tokens for a task", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);
      const networkBalanceBefore = await token.balanceOf(colonyNetwork.address);
      await colony.claimPayout(taskId, MANAGER_ROLE, token.address);
      const networkBalanceAfter = await token.balanceOf(colonyNetwork.address);
      expect(networkBalanceAfter.sub(networkBalanceBefore)).to.eq.BN(toBN(1 * 1e18));
      const balance = await token.balanceOf(MANAGER);
      expect(balance).to.eq.BN(toBN(99 * 1e18));
      const potBalance = await colony.getPotBalance(2, token.address);
      expect(potBalance).to.eq.BN(toBN(250 * 1e18));
    });

    it("should payout agreed ether for a task", async () => {
      await colony.send(353);
      await colony.claimColonyFunds(0x0);
      let dueDate = await currentBlockTime();
      dueDate -= 1;
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony,
        token: 0x0,
        dueDate,
        managerPayout: 100,
        evaluatorPayout: 50,
        workerPayout: 200
      });
      await colony.finalizeTask(taskId);
      const metaColonyAddress = await colonyNetwork.getMetaColony();
      const balanceBefore = await web3GetBalance(MANAGER);
      const metaBalanceBefore = await web3GetBalance(metaColonyAddress);
      await colony.claimPayout(taskId, MANAGER_ROLE, 0x0, { gasPrice: 0 });
      const balanceAfter = await web3GetBalance(MANAGER);
      const metaBalanceAfter = await web3GetBalance(metaColonyAddress);
      assert.equal(
        toBN(balanceAfter)
          .sub(toBN(balanceBefore))
          .toNumber(),
        99
      );
      assert.equal(
        toBN(metaBalanceAfter)
          .sub(toBN(metaBalanceBefore))
          .toNumber(),
        1
      );
      const potBalance = await colony.getPotBalance(2, 0x0);
      assert.equal(potBalance.toNumber(), 250);
    });

    it("should disburse nothing for unsatisfactory work, for manager and worker", async () => {
      const evaluator = accounts[1];

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({
        colonyNetwork,
        colony,
        token,
        evaluator,
        managerRating: 1,
        workerRating: 1
      });
      await colony.finalizeTask(taskId);

      await colony.claimPayout(taskId, MANAGER_ROLE, token.address);
      await colony.claimPayout(taskId, WORKER_ROLE, token.address, { from: WORKER });
      await colony.claimPayout(taskId, EVALUATOR_ROLE, token.address, { from: evaluator });

      const managerBalance = await token.balanceOf(MANAGER);
      assert.equal(managerBalance.toNumber(), 0);

      const workerBalance = await token.balanceOf(WORKER);
      assert.equal(workerBalance.toNumber(), 0);

      const evaluatorBalance = await token.balanceOf(evaluator);
      const evaluatorPayout = EVALUATOR_PAYOUT.divn(100).muln(99); // "Subtract" 1% fee
      assert.equal(evaluatorBalance.toString(), evaluatorPayout.toString());
    });

    it("should disburse nothing for unsatisfactory work, for evaluator", async () => {
      const evaluator = accounts[1];

      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const dueDate = await currentBlockTime();
      const taskId = await setupFundedTask({ colonyNetwork, colony, dueDate, token, evaluator });

      await colony.completeTask(taskId);

      await forwardTime(SECONDS_PER_DAY * 10 + 1, this);
      await colony.finalizeTask(taskId);

      await colony.claimPayout(taskId, MANAGER_ROLE, token.address);
      await colony.claimPayout(taskId, WORKER_ROLE, token.address, { from: WORKER });
      await colony.claimPayout(taskId, EVALUATOR_ROLE, token.address, { from: evaluator });

      const managerBalance = await token.balanceOf(MANAGER);
      const managerPayout = MANAGER_PAYOUT.divn(100).muln(99); // "Subtract" 1% fee
      assert.equal(managerBalance.toString(), managerPayout.toString());

      const workerBalance = await token.balanceOf(WORKER);
      const workerPayout = WORKER_PAYOUT.divn(100).muln(99); // "Subtract" 1% fee
      assert.equal(workerBalance.toString(), workerPayout.toString());

      const evaluatorBalance = await token.balanceOf(evaluator);
      assert.equal(evaluatorBalance.toNumber(), 0);
    });

    it("should return error when task is not finalized", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await checkErrorRevert(colony.claimPayout(taskId, MANAGER_ROLE, token.address), "colony-task-not-finalized");
    });

    it("should return error when called by account that doesn't match the role", async () => {
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      const taskId = await setupRatedTask({ colonyNetwork, colony, token });
      await colony.finalizeTask(taskId);

      await checkErrorRevert(colony.claimPayout(taskId, MANAGER_ROLE, token.address, { from: OTHER }), "colony-claim-payout-access-denied");
    });
  });
});
