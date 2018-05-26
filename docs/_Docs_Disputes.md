---
title: Objections and Disputes
section: Docs
order: 7
---
The solution to collective decision making is usually voting, but Colony is designed for day to day operation of an organisation. Voting on every decision is wholly impractical.

Colony is designed to be permissive. The [reputation system](/colonynetwork/docs-reputation/) mediates the extent to which members may influence a colony, but beyond that constraint, members are free to take executive action with most colony matters without any aproval from a management authority.

In the event of disagreement, the Dispute system allows colony members to signal disapproval and potentially force a vote on decisions and actions that would otherwise have proceeded unimpeded.

## Objections
When a member of a colony feels that something is amiss, they can _raise an objection_. By doing so, they are fundamentally proposing that a variable, or more than one variable, in the contract should be changed to another value. For this reason we call supporters of the objection the "change" side and opponents the "keep" side.

The user raising the objection must put up a stake of colony tokens to back it up. In essence, they are challenging the rest of the colony to disagree with them.

In raising an objection, the objector must provide the change to be made, as well as specify the Reputation that should vote on the issue.

Objections pass *automatically* after three days if they are not opposed by other colony members, who must stake tokens on the "keep" side in order to _escalate_ the objection to become a _dispute_.

## Disputes
>In Colony you cannot escalate a decision to higher management, you can only escalate to bigger groups of your peers.

A dispute is settled by vote to "Change" or "Keep", within the domain and/or skill that was specified when the objection was raised.

During the vote, any member with reputation in the named domain or skill may stake the "Change" or the "Keep" side with the colony's native token.

At the conclusion of the poll, losing stakers receive some of their staked tokens back and they lose the complementary percentage of the reputation that was required to stake. The exact amount of tokens they receive back (and therefore reputation they lose) is based on:
* The fraction of the reputation in the colony that voted.
* How close the vote ultimately was.

At the end of a vote, if the vote was very close, then the losing side receives nearly 90% of their stake back. If the vote is lopsided enough that the winning side’s vote weight reaches a landslide threshold of the total vote weight, then they receive 0% of their staked tokens back.

The motivation here is efficiency — it aims to discourage spurious objections and disputes. A close vote is a sign that the decision was not a simple one and forcing a vote may have been wise. Therefore, the instigators of the dispute should not be harshly punished. On the other hand, if a vote ended in a landslide, it is a sign that the losing side was going up against a general consensus.

We encourage communication within the colony. Members should be aware of the opinions of their peers whenever possible before disputes are invoked.

Complete details of the dispute mechanism can be found in the [Colony Whitepaper](https://colony.io/whitepaper.pdf) in section 9.2
