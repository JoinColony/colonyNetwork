---
description: Structure and Architecture of the Colony Network Files
---

# Overview

_The colonyNetwork repository is developed as free software; if you are interested in contributing, or want to report an issue or bug, please see the_ [_GitHub repository._](https://github.com/JoinColony/colonyNetwork)

The Colony Network is a large set of contracts that together define how all colonies operate and interact with people and other smart contracts on the Ethereum blockchain.

Colony is designed to be modular, upgradable, and eternally backwards-compatible. This is achieved through a sophisticated contract architecture that requires a bit of exposition. It is recommended that any developer seeking to understand the Colony Network solidity implementation first read the [Colony White Paper](https://colony.io/whitepaper.pdf), or at the very least, the [White Paper TL;DR](../tldr/).

## Smart Contracts Architecture

The Colony Network contracts are separated out into four functional layers, and four logical entities outlined below. This design is to an extent mandated by the [contract upgrade mechanism](../../colonynetwork/docs-upgrade-design/) we use.

![Interface, Logic, Data](img/colonyNetwork\_diagram\_r12.png) Starting from the layer closes to the user:

**Interface layer**

* `IColony.sol`
* `IMetaColony.sol`
* `IColonyNetwork.sol`
* `IReputationMiningCycle.sol`
* `ITokenLocking.sol`
* `IRecovery.sol`
* `IEtherRouter.sol`

All public and external functions from the logic contracts for an entity are composed into a single interface. For example the Colony interface - `IColony.sol` is a superset of the public and external functions from the logic contracts for a Colony entity, i.e. `Colony.sol`, `ColonyFunding.sol`, etc.

This layer represents the Colony Network API, documented in the [Interface section](https://docs.colony.io/colonynetwork/interface-ietherrouter) of the documentation.

**Logic layer**

All function declarations live in this layer, which constitutes the majority of the colonyNetwork code. Functions that implement a feature or set of related actions are grouped together into a single contract. There are often several logic contracts representing a single logical entity.

For example, the logic for a colony is distributed across `Colony.sol`, `ColonyFunding.sol`, and so on. Likewise for the ColonyNetwork and ReputationMiningCycle entities.

Note that this logic distribution is possible due to the [contract upgrade mechanism](../../colonynetwork/docs-upgrade-design/), in which all functions are called from the same underlying `EtherRouter` delegate proxy instance, regardless of where they are implemented.

**Access layer**

Access management in the network is handled by a group of contracts that underpin all of the application layers.

* `CommonAuthority.sol`
* `ColonyAuthority.sol`
* `ColonyNetworkAuthority.sol`
* `DomainRoles.sol`

These are based on the `DSRoles` and `DSAuth` implementations from the [dappsys library of contracts](https://github.com/dapphub/dappsys-monolithic). For a full list of these contracts, see the "Roles and Authority" point below. Also see the [modular permissions section](../tldr/permissions.md) for design details.

**Data Layer**

Data structures, enums, constants and events are declared in a dedicated `*DataTypes.sol` contract, e.g. `ColonyDataTypes.sol`.

For clarity, all storage variables are held separately in a `*Storage.sol` contract, e.g. `ColonyStorage.sol`. Storage variable declaration ordering is crucial to be maintained; network upgrades and recovery depend on a consistent and clear storage layout. All variables are commented with slot numbers to support developers.

**Integrations** Colony supports an ENS integration, which defines a custom ENS registry for use with colonies and the Colony Network.

* `ENS.sol`
* `ENSRegistry.sol`

Colony also supports the creation of extension contracts for use with other smart contracts or dapps. There are four officially supported extensions:

* `CoinMachine.sol`
* `FundingQueue.sol`
* `OneTxPayment.sol`
* `VotingReputation.sol`

## Logic Entities

Broadly speaking, the Colony Network can be divided into four logical entities:

**Colony**

Defines the state of an individual colony, such as funding pots, tasks, domains, and skills.

* `Colony.sol`
* `ColonyFunding.sol`
* `ColonyStaking.sol`
* `ColonyExpenditure.sol`
* `ColonyPayment.sol`
* `ColonyTask.sol`
* `ColonyStorage.sol`
* `ColonyDataTypes.sol`

**Colony Network**

Defines a global state shared by all colonies, such as reputation, token auctions and ENS.

* `ColonyNetwork.sol`
* `ColonyNetworkAuction.sol`
* `ColonyNetworkENS.sol`
* `ColonyNetworkMining.sol`
* `ColonyNetworkStorage.sol`
* `ColonyNetworkDataTypes.sol`

**Reputation Mining Cycle**

Define a consensus protocol for validators of the global reputation state.

* `ReputationMiningCycle.sol`
* `ReputationMiningCycleRespond.sol`
* `ReputationMiningCycleStorage.sol`
* `ReputationMiningCycleDataTypes.sol`

**Token locking**

Allowing witholding access to deposited tokens from all colonies in the network.

* `TokenLocking.sol`
* `TokenLockingStorage.sol`
* `TokenLockingDataTypes.sol`
