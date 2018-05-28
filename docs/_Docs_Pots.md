---
title: Pots and Funding
section: Docs
order: 6
---
All funding within a colony resides in pots. To each pot, a colony can associate any number of unassigned tokens it holds. Pots can be thought of as 'earmarked' funds for a specific purpose, and depending on context, might be called a bounty, a budget, working capital, or rewards.

Assigning funding to pots is purely a bookkeeping mechanism for a colony. From the perspective of the blockchain, ether and tokens are held by the colony contract until they are paid out when a task is completed.

==TOC==

## Types of Pots
A colony will have many pots, but at a minimum will have one pot for rewards ( `pots[0]` ) and one for working capital ( `pots[1]` ), both of which are associated with the colony-wide domain.

### Rewards
Every colony has a special pot, `pots[0]`, which accrues funds by taking a small percentage of colony revenue. Members of the colony may claim rewards from this pot based on the number of colony tokens they have.

When funds are sent to a colony as revenue, they must be put into the working capital pot before they can be further distributed to relevant sub-domains. In doing so, 1% of the revenue is siphoned off and put into the _rewards_ pot.

When triggered, the rewards pot disburses to all members of the colony that have *both* tokens and reputation. Rewards are limited to the (normalized) geometric average of token holdings and reputation score (read more about the rewards formula in section 10.2 of the colony whitepaper).

The rewards mechanism maximizes payout for individuals who both contribute meaningful work to the colony (evidenced by their reputation), and who maintain 'skin in the game' (evidenced by their unsold token holdings).

### Domain Funding
When new domains are created, they each are assigned a newly created pot, which can then be funded from the parent domain (see 'Funding Proposals' below). Pots associated with domains may only pay out to other pots.

### Task Funding
Each task created within a domain also has its own pot, which is funded from the domain to which the task belongs. Pots associated with tasks may only pay out to the individuals associated with the task (the Manager, Evaluator, and Worker of the task).

## Funding Proposals
Funding proposals are the mechanism that mediates the flow of funds between pots. Funding proposals are created by any user with sufficient reputation to stake in the relevant domain.

Funding proposals can be one of two types: Basic Funding Proposals (BFPs), or Priority Funding Proposals (PFPs).

_Basic Funding Proposals_ are immediately active upon creation, but are restricted to funding pots which are direct descendants of the source. In other words, the `From` pot must be a parent of the `To` pot. BFPs also have an upper limit on the rate funds can be moved.

_Priority Funding Proposals_ must be explicitly voted on before it starts directing funds, but may move funds from any pot to any other pot within a colony, at any rate, so long as there is consensus in the relevant domain.

### The Funding Queue
In normal circumstances, funding should flow naturally from the pots of general, top-level domains toward more specific and focused sub-domains and tasks through the use of Basic Funding Proposals (BFPs).

Any user with sufficient reputation may create a BFP. Once created, the BFP is `active`, and is placed in a _Funding Queue_ associated with the `From` pot.

All funding proposals in the same _Funding Queue_ are ranked according to the reputation that is 'backing' the proposal, which may come from multiple users. The greater the reputation backing the proposal, the closer to the top the proposal sits.

To mitigate possible manipulation and attack, only the top proposal in the queue is funded at any given time. This allows for other members to halt malicious funding proposals with an objection before too many funds can be taken.
