import BigNumber from 'bignumber.js';

import { MANAGER,
    EVALUATOR, 
    WORKER,
    OTHER,
    MANAGER_PAYOUT, 
    WORKER_PAYOUT, 
    MANAGER_RATING, 
    WORKER_RATING, 
    RATING_1_SALT, 
    RATING_2_SALT, 
    MANAGER_ROLE, 
    EVALUATOR_ROLE, 
    WORKER_ROLE, 
    SPECIFICATION_HASH,
    DELIVERABLE_HASH } from '../helpers/constants';
import testHelper from '../helpers/test-helper';

module.exports = {
    async setupAssignedTask(colony, 
        dueDate = testHelper.currentBlockTime(), 
        evaluator = EVALUATOR, 
        worker = WORKER) {
        await colony.makeTask(SPECIFICATION_HASH);
        let taskId = await colony.getTaskCount.call();
        taskId = taskId.toNumber();
        await colony.setTaskRoleUser(taskId, EVALUATOR_ROLE, evaluator);
        await colony.setTaskRoleUser(taskId, WORKER_ROLE, worker);
        const txData = await colony.contract.setTaskDueDate.getData(taskId, dueDate);
        await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
        const transactionId = await colony.getTransactionCount.call();
        await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });
        return taskId;
    },
    async setupFundedTask(colony, 
        token, 
        dueDate, 
        evaluator = EVALUATOR, 
        worker = WORKER, 
        manager_payout = MANAGER_PAYOUT, 
        worker_payout = WORKER_PAYOUT) {
        let tokenAddress;
        if (token == undefined) {
            tokenAddress = await colony.getToken.call();            
        } else {
            tokenAddress = token == 0x0 ? 0x0 : token.address;
        }

        const taskId = await this.setupAssignedTask(colony, dueDate, evaluator, worker);
        const task = await colony.getTask.call(taskId);
        const potId = task[6].toNumber();
        manager_payout = new BigNumber(manager_payout);
        worker_payout = new BigNumber(worker_payout);
        const totalPayouts = manager_payout.add(worker_payout);
        await colony.moveFundsBetweenPots(1, potId, totalPayouts, tokenAddress);
        let txData = await colony.contract.setTaskPayout.getData(taskId, MANAGER_ROLE, tokenAddress, manager_payout);
        await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
        let transactionId = await colony.getTransactionCount.call();
        await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });

        txData = await colony.contract.setTaskPayout.getData(taskId, WORKER_ROLE, tokenAddress, worker_payout);
        await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
        transactionId = await colony.getTransactionCount.call();
        await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });
        return taskId;
    },
    async setupRatedTask(colony, 
        token, 
        dueDate, 
        evaluator = EVALUATOR, 
        worker = WORKER,         
        manager_payout = MANAGER_PAYOUT, 
        worker_payout = WORKER_PAYOUT, 
        manager_rating = MANAGER_RATING, 
        manager_rating_salt = RATING_1_SALT, 
        worker_rating = WORKER_RATING,
        worker_rating_salt = RATING_2_SALT) {
        const taskId = await this.setupFundedTask(colony, token, dueDate, evaluator, worker, manager_payout, worker_payout);
        const worker_rating_secret = await colony.generateSecret.call(worker_rating_salt, worker_rating);
        const manager_rating_secret = await colony.generateSecret.call(manager_rating_salt, manager_rating);
        await colony.submitTaskWorkRating(taskId, WORKER_ROLE, worker_rating_secret, { from: evaluator });
        await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, manager_rating_secret, { from: worker });
        await colony.revealTaskWorkRating(taskId, WORKER_ROLE, worker_rating, worker_rating_salt, { from: evaluator });
        await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, manager_rating, manager_rating_salt, { from: worker });
        return taskId;
    },
    async fundColonyWithTokens(colony, token, tokenAmount) {
        let colonyToken = await colony.getToken.call();
        tokenAmount = new BigNumber(tokenAmount);
        if (colonyToken == token.address) {
            await colony.mintTokens(tokenAmount); 
        } else {
            await token.mint(tokenAmount);
            await token.transfer(colony.address, tokenAmount);
        }
        await colony.claimColonyFunds(token.address);
    }
};