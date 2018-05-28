---
title: Glossary of Terms
section: Docs
order: 11
---

==TOC==

### CLNY
The Native Token of the Meta Colony. CLNY is staked in the reputation mining process.

### Dispute
An objection to an objection triggers a dispute, which must be resolved through a reputation-weighted vote within the domain that the objection was initially raised.

### Domain
A category for organizing tasks, skills, and pots within a Colony. Domains can be thought of as 'departments' or 'divisions' within the larger organizational whole.

### Funding Pots
All funding within a colony resides in pots. Pots can be thought of as 'earmarked' funds for a specific purpose, and depending on context, might be called a bounty, a budget, working capital, or rewards.  A colony will have many pots, but at a minimum will have one pot for rewards ( `pots[0]` ) and one for working capital ( `pots[1]` ).

### Meta Colony
The Meta Colony is “the Colony colony” — its remit is to develop, support, and grow the Colony Network. Every colony on the public network needs the Meta Colony, and everyone may be a member.

### Native Token
A token chosen by a colony which confers reputation when paid out as a task bounty. The Native token together with reputation is used for vote-weighting and calculating rewards payouts.

### Objection
A statement by a member of a colony that proposes some variable in the contracts of the colony should be changed to another state. To raise an objection, a colony member is required to put up a stake of native tokens. If another member opposes an objection, they may stake tokens to elevate the objection to become a dispute. Otherwise, the objection will pass automatically after a defined period of time.

### Reputation
A number associated with an account which attempts to quantify the merit of a user’s recent contributions to a colony. Reputation is used to weight a user’s influence in decisions related to the expertise they have demonstrated, and to determine amounts owed to a colony’s members when rewards are disbursed.

Unlike tokens, reputation cannot be transferred between addresses; it must be earned by direct action within the colony. Reputation that is earned will eventually be lost through inactivity (decay), error, or malfeasance.

### Reputation Mining
The calculations involved in maintaining the entire state of reputation amongst all accounts on the Colony Network are far too complex to be performed on-chain. Instead, reputation is calculated off-chain and periodically put on-chain by CLNY holders in a process resembling a proof-of-stake blockchain protocol -- engaging in the process of updating the global state of reputation for the Colony Network is called "Reputation Mining".

### Rewards
When a colony earns Ether or other currencies as revenue, the revenue distribution system allocates some of them to be claimed as rewards. In particular, the special triggering transaction takes any such revenue that has accumulated since the last such transaction, and makes 99% available to the colony as working capital, while the remaining 1% is used to pay out rewards to users that hold both colony tokens and reputation in the colony.

### Role
A task has 3 roles associated with it:
* A Manager - someone responsible for defining and coordinating the delivery of the task.
* An Evaluator - someone responsible for assessing whether the work has been completed satisfactorily.
* A Worker - someone responsible for executing the task.

### Skills
Skills are a global hierarchy of tags that can be assigned to any task. Tagging a task with a skill allows for a more granular account of the work a user completes to earn their reputation.

The Meta Colony curates the hierarchy of global skill tags.

### Task
A discrete unit of work which requires no further subdivision or delegation, and which can be evaluated as complete or incomplete based on some set of criteria.

### Token Issuance Rate
The rate at which new native tokens are minted and made available to fund tasks. A higher rate could result in an inflated supply and perhaps diminishing value per-token.

### Token Supply Ceiling
An upper bound on the total supply of a token.

### Work Specification
A description of the work to be done for a task. In the `colonyNetwork` contracts, the work specification is pointed to by a hash, and stored off-chain.
