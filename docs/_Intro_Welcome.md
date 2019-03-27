---
title: Welcome
section: Intro
order: 0
---

Colony is a platform for organizations that operate via software rather than paperwork and management hierarchy.

At its core, a colony is a set of smart contracts that describe all aspects of a traditional organization, as well as some new capabilities that would only be possible using a decentralized protocol like Ethereum.

It's infrastructure for the future of the firm, built to organize/incentivize teams, projects, and communities.

### The Colony Protocol

The Colony whitepaper describes a complete protocol for organizations, with crypto-economic processes for:

* Ownership and permissions
* Reputation
* Dispute resolution and decision-making
* Work management and delegation
* Financial management, including rewards and payments

To learn more about the Colony Protocol, dig in to the [Colony Whitepaper](https://colony.io/whitepaper/) or read the [whitepaper TL;DR](/colonynetwork/whitepaper-tldr-colony/)

### The Colony Network
The Colony Network is the infrastructure upon which all colonies run.

The colonyNetwork repository contains the solidity implementation of Colony, which is developed as free software. See our [guidelines](https://github.com/JoinColony/colonyNetwork/blob/develop/docs/CONTRIBUTING.md) if you're interested in contributing to the colonyNetwork codebase. Developers interested in contributing to the Colony Network are encouraged to look at the code on [GitHub](https://github.com/JoinColony/colonyNetwork), and to come say hi on [Gitter](https://gitter.im/JoinColony/colonyNetwork).

The current colonyNetwork release is [glider]. Glider implements some, but not all, of the Colony Protocol:

* Ownership and permissions (through roles)
* Reputation
* Funding Pots and payments
* Domains and Skills
* Tasks and work ratings

To learn more about Glider, see the [releases] page.

The Colony Network is maintained and improved by the [Meta Colony] (which is, itself, a colony on the network with special permissions).

Membership in the Meta Colony is open to all (and heartily encouraged!), but changes such as [network upgrades](/colonynetwork/docs-the-delegate-proxy-pattern/) require a minimum *reputation* within the Meta Colony to proceed.

### ColonyJS (and colonyStarter?)
ColonyJS is a javascript library designed to make interaction with the Colony Network as straightforward as possible for (d)app developers.

Using colonyJS, all of the functions of a colony can be imported and called as methods within a javascript application.

Things like parsing returned parameters from a transaction, connecting to the right network version, and signing transactions with a wallet provider are all handled by this library.

To learn more about how to use colonyJS with your (d)app, or to get specific info about the colonyJS API, see [the colonyJS docs]

### Developer Forums (to switch to developer portal)
If you didn't get here from there, have a look at our developer portal for links to [tutorials], [starter kits], and [developer forums].

Or, if you're feeling old skool and just want to chat, send an email to build@colony.io to chat with our DevRel team. We're nice people!
