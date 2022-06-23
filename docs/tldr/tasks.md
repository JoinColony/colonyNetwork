# Whitepaper tl;dr: Tasks and Payments

Funds controlled by a colony can be transferred to an external account either through a `task` or a `payment`.

A task is a discrete unit of work which requires no further subdivision or delegation, and which can be evaluated as complete or incomplete based on some set of criteria. In the task workflow most information relevant to the work is recorded on-chain. This includes a specification for the work to be done, a submission of the work, and ratings for the quality of work.

A payment is similar to a task, without the requirement of "on-chain" management. Payments simply transfer tokens to external accounts directly from a domain pot to an external account. (and confer reputation if made in the colony's internal token).  

There is intentionally no further prescription for how tasks or payments are meant to be used within a colony. Depending on context and criteria, they could be called "bounties", "salaries", "reimbursements", or "incentives".

### Task structure

This is a general description of the Task as it functions in the current Colony Network implementation, with some aspects suppressed for legibility. For a more exact description, please refer to the [colonyJS API](/colonyjs/api-colonyclient/) or [IColony.sol](https://github.com/JoinColony/colonyNetwork/blob/develop/contracts/IColony.sol).

| component | description |
|------------|---------|
|Brief or Specification|A reference for a description of the work to be done.|
|Deliverable |A reference for the work done to complete the task.|
|Due Date |A due date for the submission of task deliverables.|
|Payouts |A payout for the task upon successful completion, for each of the MANAGER, EVALUATOR, and WORKER roles.|
|Domain|The task's associated domain.|
|Skill tags |Any skills associated with the task.|

### Roles
Every task has three roles associated with it which determine permissions for editing the task, submitting work, and ratings for performance. In the `colonyNetwork` contracts, the roles are represented as 8-bit numbers to keep permission logic simple.

| Role [`role Id`]| Description |
|------|------|
|Manager [`0`]| A task's Manager role is by default the creator of the task, and usually expected to be the person to accept the task as complete when the work is done.
|Evaluator [`1`]| A task's Evaluator role is a person who will independently establish the quality of the work done by the Worker.  
|Worker [`2`]| A task's Worker role is the person who will fulfill the requirements of the task as specified in the task brief.

Once created, some changes to a task require the signature of multiple roles. See the colonyJS [Task Lifecycle](/colonyjs/topics-task-lifecycle/) and [Using Multisignature](/colonyjs/topics-using-multisignature/) documentation for for further information about role permissions and multi-sig operations.

Additionally, in the first version of the Colony Network, the creation and modification of tasks is mediated by `auth` roles as described in the [Colony Roles](/colonyjs/topics-colony-roles/).

## The Task Life-cycle

### Create
![create_task](img/taskCreation_1.png)
A newly created task must be assigned to a domain and must reference a specification for the task's completion, i.e. a description of the work to be done and how that work will be evaluated.

Upon task creation, the account creating the task is automatically assigned the roles of Manager and Evaluator.

A due date for the task and a skill tag may also be added at task creation if desired.

### Modify
![modify_task](img/taskModification_r2.png)
Once created, the task may be modified to include additional data. This could be setting the task's due date, payouts for completion, or domain.

Important changes to a task must be approved by multiple people after roles have been assigned. Task changes requiring two signatures are:
* Changing the task Brief (Manager and Worker)
* Changing or setting the task Due Date (Manager and Worker)
* Changing or setting the Worker's payout (Manager and Worker)
* Changing or setting the skill tag (Manager and Worker)
* Changing or setting the Evaluator's payout (Manager and Evaluator)

At any time before a task is finalized, the task can be canceled, which allows any funding to be returned to the colony and halts any further modification of the task.

### Rate
![rate_task](img/taskRatings_r2.png)
When work is submitted, the work rating period begins.

_* If no work is submitted by the task's due date, `completeTask()` must be called by the Manager to open the work rating period_

One large determiner of reputation within a colony is the rating that one has earned for completing tasks within the colony. In addition to serving as a quick reference for one's ability and commitment to the shared values of the organization, reputation (combined with token holdings) grant one a portion of the colony's revenue, paid out in rewards.

Reputation changes are determined by work rating, which is rated on the basis of 3 possible outcomes:
* `[1]` **Unsatisfactory**. The work done did not meet the expectations established by the manager. The worker is *penalized* reputation equal to the internal token payout.
* `[2]` **Satisfactory**. The work done met the established expectations. Worker is awarded reputation equal to the internal token payout.
* `[3]` **Excellent**. The work done exceeded the expectations of the manager. Reputation is awarded at 1.5 times the internal token payout.

In consideration of the descriptions above, during the rating period:
* The Evaluator reviews the work done and submits a rating for the Worker.
* The Worker considers the task assignment and submits a rating for the Manager.

Because work ratings are on-chain, they follow a _*Commit* and *Reveal*_ pattern in which ratings are obscured to prevent them from influencing each other.

* During the *Commit* period, hidden ratings are submitted to the blockchain. The commit period lasts at most 5 days, but completes earlier if all parties commit.
* During the *Reveal* period, users submit a transaction to reveal their rating. The reveal period also lasts at most 5 days, but completes earlier if all parties reveal.

During the rating period, if either party fails to commit or reveal their rating, their counterpart is given the highest possible rating, and their own rating is penalized at -0.5 times the internal token payout.

### Finalize
![task_payout](img/taskPayout_1.png)
After the rating period has finished, the task may be finalized, which prevents any further task modifications and allows each role to claim their payout.
