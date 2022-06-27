---
description: How Colony's upgradeable contract's work
---

# Upgrade design

The contracts comprising the Colony Network are upgradeable using the Delegate Proxy design pattern.

Providing an upgrade path is important to allow for the continuous improvement of the Colony Network. At the same time, all depreciated versions of Colony should remain functional indefinitely after deployment, so that the organizations created are not predicated upon the actions/efforts of a third party.

In other words, upgrades to any individual colony on the network are "opt-in", while the network as a whole remains eternally backwards-compatible.

**Delegate Proxy Pattern**

Interacting with both the Colony Network and individual colonies on the network is somewhat different than many other smart contract interactions that a blockchain developer might not be accustomed to.

Rather than calling functions directly from the contract in which they are deployed, all transactions are signed and sent to the `EtherRouter` contract.

Whenever a transaction is received by the `EtherRouter` contract, it looks the function up in a `Resolver` contract, using the function signature.

The `Resolver` contract contains a mapping of whitelisted function signatures to addresses (`mapping ( bytes4 => address )`).

A function signature lookup will return the address of the contracts that implement the desired function. `EtherRouter` in turn calls the function via `delegatecall`, and passes any returns from the call back to `msg.sender`.

![EtherRouter](../.gitbook/assets/delegateProxyCallchain\_1.png)

This pattern enables both fine-grained control of permissions for individual functions (see below), well as eternal backwards-compatibility following network upgrades.
