---
title: Tasks
section: Docs
order: 3
---
The smallest conceptual unit within a Colony is a **task**. A task is a discrete unit of work which requires no further subdivision or delegation, and which can be evaluated as complete or incomplete based on some set of criteria.

There is intentionally no further prescription for how a task is meant to be used within a colony. Depending on context and criteria, a task could be called a "bounty", a "salary", a "reimbursement", or an "incentive".


==TOC==

### Task structure

This is a general description of the Task as it functions in the current Colony Network implementation, with some aspects suppressed for legibility. For a more exact description, please refer to the [colonyJS API](../../colonyjs/api-colonyclient/) or [IColony.sol](https://github.com/JoinColony/colonyNetwork/blob/develop/contracts/IColony.sol).

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

## The Task Life-cycle

### Create
A newly created task must be assigned to a domain and must reference a specification for the task's completion, i.e. a description of the work to be done and how that work will be evaluated.

### Modify
Once created, the task may be modified to include additional data. This could be setting the task's due date, payouts for completion, or skill tag(s).

Important changes to a task must be approved by multiple people. Task changes requiring two signatures are:
* Changing the task Brief (Manager and Worker)
* Changing or setting the task Due Date (Manager and Worker)
* Changing or setting the Worker's payout (Manager and Worker)
* Changing or setting the Evaluator's payout (Manager and Evaluator)

At any time before a task is finalized, the task can be canceled, which allows any funding to be returned to the colony and halts any further modification of the task.

### Rate
After the work has been submitted (or the due date has passed), the work rating period begins.

Task payouts are determined by work rating, which is currently implemented as "5-star" system, but which will change to a "3-star" system in the future.

* The Evaluator reviews the work done and submits a rating for the Worker.
* The Worker considers the task assignment and submits a rating for the Manager.

Because work ratings are on-chain, they follow a _*Commit* and *Reveal*_ pattern in which ratings are obscured to prevent them from influencing each other.

* During the *Commit* period, hidden ratings are submitted to the blockchain. The commit period lasts at most 5 days, but completes earlier if all parties commit.
* During the *Reveal* period, users submit a transaction to reveal their rating. The reveal period also lasts at most 5 days, but completes earlier if all parties reveal. 

During the rating period, if either party fails to commit or reveal their rating, their counterpart is given the highest possible rating, and their own rating is penalized.

### Finalize
After the rating period has finished, the task may be finalized, which prevents any further task modifications and allows each role to claim their payout.
