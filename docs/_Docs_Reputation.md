---
title: Reputation
section: Docs
order: 4
---

In an organization of any type, reputation is an essential heuristic for people to keep track of each other's perceived merit in an environment of limited information. Reputation within Colony is meant stay close to the concept of reputation as it is commonly understood. Reputation is a representation of _merit_, which in Colony implies an immutable record of contributions to a shared goal.

In the Colony Protocol, **reputation** is a number that quantifies a particular individual’s influence, calculated from the sum of work that has been completed within the colony.

Every Colony has its own **native token** which complements reputation. Tokens, when earned as a task payout, create reputation for the recipient.

The Reputation System in Colony is a tool for governance in a decentralized context: It allows for members of an organization to have different amounts of influence over the organization, without the use of a management hierarchy or frequent voting.

Reputation confers influence in a colony by mediating a member's ability to adjust various aspects of the organization. Whether it is the ability to move funds to fund tasks, to create new domains and skills, or to settle disputes, reputation determines influence by degrees.

==TOC==

## Gaining and Losing Reputation
Unlike a token, reputation cannot be transacted between accounts. Reputation can only be gained or lost through interactions with other members of a colony.

### Completing Tasks
The most straightforward way of gaining reputation is by completing tasks within the colony. Tasks funded with native tokens generate reputation for their recipient upon payout.

The amount of reputation gained or lost through a task is determined by the task's rating:
  * *1 point*. User was unable to complete the task. Reputation penalty equal to the token payout.
  * *2 points*. User completed the task acceptably. Reputation gain equal to the token payout.
  * *3 points*. User completed the task to a higher standard than requested. Reputation gain equal to 1.5 × the token payout.

When a payout is received for the completion of a task, reputation is awarded within the task's domain, as well as all its parent domains. If the task is tagged with a skill, reputation is awarded in the skill, as well as all its parent skills.

See [Tasks](/colonynetwork/docs-tasks/) for more information about the task workflow and ratings.

### Staking Reputation
Almost every interaction with a colony requires that the user stake some amount of reputation. How much reputation is required to stake depends on how important the interaction is. Actions like the creation and funding of tasks require a nominal amount of reputation, while things like creating a new domain require comparatively more.

Staked reputation has the potential to be both lost and gained in the event of an objection or a dispute.

If an objection to any action is raised by another member, the reputation stake is given to the objector (objections pass automatically if they are not challenged).

If an objection is escalated to a dispute, a reputation-weighted vote is called within the objection's domain, in which both sides must stake reputation. The amount of reputation gained/lost by each side is determined by the vote's outcome ('landslide' outcomes punish the losing side harshly, while more contentious decisions have only small penalties for the losing side).

See [Objections and Disputes](./docs-disputes/) for more information about reputation-weighted voting and the dispute resolution process.

### Reputation Bootstrapping
After a colony is created, reputation can only be gained and lost through normal interactions within a colony. But at the colony's beginning, we are presented with a bootstrapping problem: When a colony is new, no-one has yet completed any work in it and so nobody will have earned any reputation.

During a colony's creation, the creator of the colony is granted the ability to designate an initial set of addresses to receive native tokens and an equivalent amount of reputation. Users receiving reputation are presumably the colony creator and their colleagues, and this starting reputation should be seen as a representation of the existing trust within the team.

## Reputation Decay
One of the unique characteristics of reputation is that it decays over time. This is meant to incentivise frequent and consistent contributions to a colony, and to ensure that reputation represents _recent_ contributions.

Every 600000 blocks, a user’s reputation in every domain or skill decays by a factor of 2. This implies a 'reputation half-life' of about 3.5 months.
