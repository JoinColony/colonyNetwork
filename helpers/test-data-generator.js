import { MANAGER_ROLE, EVALUATOR_ROLE, WORKER_ROLE, SPECIFICATION_HASH } from '../helpers/constants';
import testHelper from '../helpers/test-helper';

module.exports = {
    async setupAssignedTask(colony, evaluator, worker, dueDate) {
        await colony.makeTask(SPECIFICATION_HASH);
        const taskId = await colony.getTaskCount.call();
        await colony.setTaskRoleUser(taskId, EVALUATOR_ROLE, evaluator);
        await colony.setTaskRoleUser(taskId, WORKER_ROLE, worker);
        const txData = await colony.contract.setTaskDueDate.getData(taskId, dueDate);
        await colony.proposeTaskChange(txData, 0, MANAGER_ROLE);
        const transactionId = await colony.getTransactionCount.call();
        await colony.approveTaskChange(transactionId, WORKER_ROLE, { from: worker });
        return taskId.toNumber();
    },
    async setupRatedTask(colony, evaluator, worker, dueDate, manager_rating, manager_rating_salt, worker_rating, worker_rating_salt) {
        const taskId = await this.setupAssignedTask(colony, evaluator, worker, dueDate);
        const worker_rating_secret = await colony.generateSecret.call(worker_rating_salt, worker_rating);
        const manager_rating_secret = await colony.generateSecret.call(manager_rating_salt, manager_rating);

        await colony.submitTaskWorkRating(taskId, WORKER_ROLE, worker_rating_secret, { from: evaluator });
        await colony.submitTaskWorkRating(taskId, MANAGER_ROLE, manager_rating_secret, { from: worker });
        
        await colony.revealTaskWorkRating(taskId, WORKER_ROLE, worker_rating, worker_rating_salt, { from: evaluator });
        await colony.revealTaskWorkRating(taskId, MANAGER_ROLE, manager_rating, manager_rating_salt, { from: worker });
        return taskId;
    }
};