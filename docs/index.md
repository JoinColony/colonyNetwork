---
id: "index"
description: Documentation for the Colony Network Smart Contracts
sidebar_position: 2
---

# The Colony Network

![](https://raw.githubusercontent.com/JoinColony/brand/v1.0.0/logo_network.svg)

Colony is a platform for organizations that operate via software rather than paperwork and management hierarchy.

At its core, a colony is a set of smart contracts that describe all aspects of a traditional organization, as well as some new capabilities that would only be possible using a decentralized protocol like Ethereum.

It's infrastructure for the future of the firm, built to organize and incentivize teams, projects, and communities.

## Want to jump right in?

Feeling like an eager beaver? Jump in to the [quick start docs](quick-start) and get the Smart Contracts running on your machine:

## The Colony Ecosystem

### The Colony Protocol

The Colony White Paper describes a complete protocol for organizations, with crypto-economic processes for:

* Ownership and permissions
* Reputation
* Dispute resolution and decision-making
* Work management and delegation
* Financial management, including rewards and payments

To learn more about the Colony Protocol, dig in to the [Colony White Paper](https://colony.io/whitepaper.pdf) or read the [White Paper TL;DR](tldr/)

### The Colony Network

The Colony Network is the infrastructure upon which all colonies run.

The colonyNetwork repository contains the solidity implementation of Colony, which is developed as free software. See our [guidelines](https://github.com/JoinColony/colonyNetwork/blob/develop/.github/CONTRIBUTING.md) if you're interested in contributing to the colonyNetwork codebase. Developers interested in contributing to the Colony Network are encouraged to look at the code on [GitHub](https://github.com/JoinColony/colonyNetwork), and to come say hi on [Discord](https://discord.gg/feVZWwysqM).

The current colonyNetwork release is [`flwss`](https://github.com/JoinColony/colonyNetwork/releases/tag/flwss) (Fuchsia Lightweight Spaceship). It implements some, but not all, of the Colony Protocol:

* Ownership and permissions (through roles)
* Reputation
* Funding Pots and Expenditures
* Domains and Skills

The Colony Network is maintained and improved by the [Meta Colony](tldr/metacolony.md) (which is, itself, a colony on the network with special permissions).

Membership in the Metacolony is open to all (and heartily encouraged!), but changes such as [network upgrades](concepts/upgrades.md) require a minimum _reputation_ within the Metacolony to proceed.

### Colony SDK

The Colony SDK is a JavaScript library designed to make interaction with the Colony Network as straightforward as possible for (d)app developers.

Using the Colony SDK, all of the functions of a colony can be imported and called as methods within a JavaScript application. It runs on all modern browsers as well as in an NodeJS environment.

Things like parsing returned parameters from a transaction, and signing transactions with a wallet provider are all handled by this library while providing a small API with sane defaults.

To learn more about how to use the Colony SDK with your dapp, or to get specific info about the Colony SDK API, see its [docs](https://docs.colony.io/colonysdk).

### Developer Portal

If you didn't get here from there, have a look at our Developer Portal to [get started](https://www.notion.so/colony/Colony-Developer-Portal-2155ba0a012e46f9991bbd693b04de2b).

Or, if you're feeling old skool and just want to chat, send an email to [chris@colony.io](mailto:build@colony.io) or ping chmanie#5800 on Discord!
