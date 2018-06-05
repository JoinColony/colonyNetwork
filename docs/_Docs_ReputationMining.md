---
title: Reputation Mining
section: Docs
order: 9
---

This is an overview of the process by which Reputation scores in Colony are maintained.

For a complete description of the Reputation Mining process, see the [whitepaper](https://colony.io/whitepaper.pdf)

# Rationale for off-chain Reputation
Events in Colony that affect reputation are numerous and expected to be frequent. The calculations for global reputation updates would be unreasonable to perform on-chain. However, Reputation doesn't *need* to be on-chain, because reputation is entirely deterministic and calculated from on-chain events.

So, rather than calculating reputation scores on-chain, users submit to the colony contract a transaction  which contains their score, together with a proof that the score is consistent with the global state of reputation.

## Reputation Mining Overview
The process of maintaining consensus over the global state of reputation is called *Reputation Mining*.

Reputation Mining resembles a proof-of-stake blockchain consensus protocol. Miners must put up a stake of the network token, CLNY, to participate in the reputation mining process, whereby the global state of reputation is calculated off-chain and submitted to the blockchain as a `reputationRootHash`. In the case of honest submissions, the miner is rewarded reputation in the Meta Colony tagged with a special 'mining' skill. In the event of malicious activity, miners with false submission is punished by losing her stake.


### Reputation Updates
One feature of reputation that distinguish it from a token or cryptographic asset is that reputation cannot be transferred between accounts through a voluntary transaction. Rather, it is a number associated with an address, calculated from a well-defined set of on-chain events.

Reputation within a specific colony can only be earned and lost by completing tasks within the colony, through the [objections and disputes mechanism](/colonynetwork/docs-objections-and-disputes/), and in the case of the Meta Colony, through participation in the reputation mining process.

### Reputation Root Hashes
Using a [Patricia Tree](https://github.com/ethereum/wiki/wiki/Patricia-Tree), all updates to the global state of reputation are maintained on-chain with a single "Reputation Root Hash".

The Reputation Root Hash is effectively a fingerprint for the network state (of reputation). It is calculated off-chain, but it represents the collection of all reputation-updating events that have occured on the network, and even a single discrepancy in the complete history of reputational updates will result in a different Root Hash.  


## The Reputation Mining Cycle
Reputation mining is a cyclic process in which multiple actors compete to verify the global reputation state.

The process works on an “innocent until proven guilty” principle: Although it’s infeasible for a valid hash to be proven true on-chain, it’s relatively straightforward for an invalid hash to be proven false. In the event that two submitted hashes differ, the false one can be fleshed out through an automated challenge process *on-chain* that will eventually zero in on the exact on-chain events that differ between any two submitted hashes.

The reputation system depends on having at *at least one* honest submission per cycle (as opposed to at least 51% of submissions as is the case in proof-of-work mining).

### Submissions
Each cycle begins with a submission window, in which all miners compete to submit a correct Root Hash to the network. The Root Hash must be calculated from the events stored in a Reputation Update Log, which contains a fixed list of updates to global reputation logged during the previous mining cycle.

A miner is eligible to submit a new Root Hash only if they stake an amount of CLNY. The amount of CLNY staked determines the number of times a miner can submit a Root Hash to the network during each submission window. Thus the greater the stake, the greater the likelihood that a miner will receive rewards from a successful submission.

### Challenges
The complete challenge-response protocol is described in section 7.5.1 of the [Colony whitepaper](https://colony.io/whitepaper.pdf).

For the sake of legibility, the general process has been simplified below to describe a situation in which only two miners are participating in the challenge process, with one of them being a malicious actor:

If two different root hashes are submitted, it is assumed that one submission is honest. Therefore, one submission is false, and the miner that submitted an invalid hash must be punished.

In whichever submission is false, there must be one or more reputation update(s) inconsistent with the global state of reputation up until the current submission window.

Miners can submit a justification to the network that shows how a reputation update results in a Root Hash consistent with the last agreed upon Root Hash (of the previous cycle), and they can do so for each reputation update in the current cycle.

Both miners must provide such a justification to the network for each historical update until the discrepancy is found, at which point the correct hash can be calculated *on-chain*.

Whichever miner is found to have performed the calculation incorrectly is punished by losing some of their CLNY stake.

### Acceptance
When a new Root Hash is accepted by the network, its corresponding Reputation Update Log is deleted from on-chain memory.  

All reputation events that occurred during the current cycle are 'frozen' as the new Reputation Update Log to be used by miners in the next cycle.
