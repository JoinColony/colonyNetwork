---
title: Colony
section: Docs
order: 0
---

Colony is a protocol for a new type of open, meritocratic organization that operates via software rather than paperwork and management hierarchy.

A colony is a set of smart contracts on the Ethereum blockchain that contains all of the normal functions of a traditional firm, as well as some new functions that are only possible using a decentralized platform. Using the functions built into Colony, an organization can do:

* Decision making
* Ownership
* Reputation
* Dispute resolution
* Work management and delegation
* Financial management

The basic ideas of how Colony fits together are presented below.

==TOC==

## `Tasks`
The smallest conceptual unit within a Colony is a **task**. A task is a discrete unit of work which requires no further subdivision or delegation, and which can be evaluated as complete or incomplete based on some set of criteria.

There is intentionally no further prescription for how a task is meant to be used within a colony. Depending on context and criteria, a task could be called a "bounty", a "salary", a "reimbursement", or an "incentive".

At a minimum, a newly created task must be assigned a `domainId` and reference a specification for the task's completion, i.e. a description of the work to be done and how that work will be evaluated.

[More about Tasks](/colonynetwork/docs-tasks/)


## `Reputation and Tokens`
In an organization of any type, reputation is an essential heuristic for people to keep track of each other's perceived merit in an environment of limited information. Reputation within Colony is meant to stay as close as possible to the concept of reputation as it is commonly understood. Reputation is a representation of _merit_, which in Colony implies an immutable record of contributions to a shared goal.

In the Colony Protocol, **reputation** is a number that quantifies a particular individual’s influence, calculated from the sum of work that has been completed within the colony.

Every Colony has its own **native token** which complements reputation. Tokens, when earned as a task payout, create reputation for the recipient.

Tasks are expected to be funded with native tokens (thus awarding reputation), and/or payment tokens (which do not confer reputation). When a task is funded, the task awaits work completion and approval before paying out to a worker.

Unlike a token, reputation cannot be transacted between accounts, and can only be gained or lost through the completion of tasks, the resolution of disputes, or participating in the reputation mining process. Reputation decays over time due to encourage frequent and regular engagement-- it has a half-life of ~3.5 months.

Within a colony, both tokens and reputation are required in order to create tasks and domains, to raise objections or disputes, and to vote on the collective actions/decisions of the colony.

It's up to each colony to decide how they use their token. Creators of a colony get to determine an initial `TokenSupplyCeiling` and `TokenIssuanceRate`. Depending on how these parameters are set and what the colony does, tokens could be valuable and bought/sold for a hefty price, or they could be ubiquitous and more of a symbolic gesture -- like an upvote.

[More about Reputation and Tokens](/colonynetwork/docs-reputation/)

## Domains and Skills
Domains and Skills are concepts that define a colony's organizational structure in a decentralized context, and allow for the division of labor without a strict management hierarchy.

Domains are a structure for compartmentalizing the work and shared resources of a colony into smaller, more specialized sub-groups which are analogous to the departments of a traditional company.

Skills are a similar structure that categorize the _type_ of work done, independent of the domain or colony in which the work took place.

[More about Domains and Skills](/colonynetwork/docs-domains-and-skills/)

## Pots
All funding within a colony resides in pots. Pots can be thought of as 'earmarked' funds for a specific purpose, and depending on context, might be called a bounty, a budget, working capital, or rewards.  A colony will have many pots, but at a minimum will have one pot for rewards ( `pots[0]` ) and one for working capital ( `pots[1]` ).

When domains (and tasks within those domains) are created, they each are assigned a newly created pot, which can then be funded with the `moveFundsBetweenPots` function. This action will eventually be mediated by a user's reputation score, but for now is merely permissioned based on the roles defined in `Authority.sol` (meaning only colony owners and admins may create new pots and move funds between pots).

Every colony has a special pot, `pots[0]`, which accrues funds by taking a small percentage of colony revenue. Members of the colony may claim rewards from this pot based on the number of colony tokens they have.

[More about Pots](/colonynetwork/docs-pots-and-funding/)
