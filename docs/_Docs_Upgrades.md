---
title: Upgrades to the Colony Network
section: Docs
order: 10
---

Improvements to the Colony Network are expected to be continuously developed and periodically deployed.

Providing an upgrade path is important to allow people to use Colony without preventing themselves using new features as they are added to the Network. At the same time, all depreciated versions of Colony should remain functional indefinitely after deployment, so that the organizations created are not predicated upon the actions/efforts of a third party.

The contracts comprising the Colony Network are upgradeable using the design pattern called EtherRouter.

## EtherRouter
This pattern uses two contracts in addition to the contract(s) providing their intended functionality:

* The `EtherRouter` contract which passes transactions (via `delegatecall`) to the contract that implements the called function.
* A `Resolver` contract where the addresses of the contracts that implement the desired function are defined.

Whenever a transaction is received by the `EtherRouter` contract, it looks up the contract that implements that function (if any) in the `Resolver`, and then `delegatecall`s that contract.

![EtherRouter](https://raw.githubusercontent.com/JoinColony/colonyNetwork/develop/docs/img/EtherRouter.svg?sanitize=true)

In order to upgrade, new contracts are deployed with new functionality, and then contracts that the `Resolver` contract points to must be changed to point to these new contracts.

In order to avoid a situation where the contract partially implements both old and new functionality, a new instance of `Resolver` will be deployed for each upgrade, and then a single transaction can point `EtherRouter` at the new Resolver.

This pattern applies for both upgrades to individual colonies as well as to the Network-level contracts.
