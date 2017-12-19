import { MANAGER_ROLE, EVALUATOR_ROLE, WORKER_ROLE, SPECIFICATION_HASH, DELIVERABLE_HASH } from '../helpers/constants';
import testHelper from '../helpers/test-helper';

module.exports = {
    async setupAssignedTask(colony, evaluator, worker, dueDate) {
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
    async setupFundedTask(colony, evaluator, worker, dueDate, token, manager_payout, worker_payout) {
        const taskId = await this.setupAssignedTask(colony, evaluator, worker, dueDate);
        const task = await colony.getTask.call(taskId);
        const potId = task[6].toNumber();
        const tokenAddress = token == 0x0 ? 0x0 : token.address;
        await colony.moveFundsBetweenPots(1, potId, (manager_payout + worker_payout), tokenAddress);
        
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
    async setupRatedTask(colony, evaluator, worker, dueDate, token, manager_payout, worker_payout, manager_rating, manager_rating_salt, worker_rating, worker_rating_salt) {
        const taskId = await this.setupFundedTask(colony, evaluator, worker, dueDate, token, manager_payout, worker_payout);
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
        if (colonyToken == token.address) {
            await colony.mintTokens(tokenAmount); 
        } else {
            await token.mint(tokenAmount);
            await token.transfer(colony.address, tokenAmount);
        }
        await colony.claimColonyFunds(token.address);
    }
};