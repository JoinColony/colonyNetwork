---
Title: The Colony Network
Section: Docs
Order: 0
---

The Colony Network, at a high level, is a collection of smart contracts on the Ethereum blockchain.

The contracts that comprise the Colony Network provide a standard framework for the creation of decentralized organizations as described in the [Colony Whitepaper](https://colony.io/whitepaper.pdf).

In addition to the core business logic of all colonies, the Colony Network contains several contracts that mediate low-level transactions and permissions on the blockchain, such as [upgradability](./docs-upgrades/), as well as contracts which manage functionality of the network as a whole, including interactions with the reputation system and the creation of new colonies.

The Colony Network is maintained and improved by [The Meta Colony](./docs-metacolony/).

Developers interested in contributing to the Colony Network are encouraged to look at the code on [GitHub](https://github.com/JoinColony/colonyNetwork), and to come say hi on [Gitter](https://gitter.im/JoinColony/colonyNetwork).

## Interface Contracts
The full collection of Colony Network contracts can be inspected on [GitHub](https://github.com/JoinColony/colonyNetwork). Once deployed, however, the publically available functions for interacting with the Colony Network are aggregated into two Interface contracts:

* `IColony.sol` contains the functions that pertain to a particular colony, including the creation of tasks, funding, and work ratings.

* `IColonyNetwork.sol` contains the functions that pertain to the network as a whole, such as the global heirarchy of skill tags and interactions with the reputation mining client.

You can inspect both interfaces in the (API documentation coming soon, in the mean time check the GitHub :)
