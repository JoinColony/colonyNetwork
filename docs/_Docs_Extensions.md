---
title: Extensions
section: Docs
order: 6
---

`glider` provides the option of expanding the basic functionality of a colony through the use of _extensions_.

Extensions are other smart contracts that have been given permissions to interact with a colony in a specified domain. Extensions can be used for many purposes, such as bundling transactions, automating certain actions, or something else entirely. Their implementations are intentionally disconnected from the colonyNetwork codebase (stored in the [/contracts/extensions](https://github.com/JoinColony/colonyNetwork/tree/develop/contracts/extensions) folder in the network) to allow for greater design flexibility unbounded by the network protocol.

Currently there are two extensions 'officially' supported, but more may be added in the future. These extensions are written with dapp support in mind, and emit events to inform a user interface whether a colony has an extension enabled or not. Adding and removing an extension from a colony is restricted to those with `Root` permissions on the colony.

Supported extensions implement a 'factory' design pattern to make deployment straightforward for users, but custom extensions need not follow this pattern. To enable any of the two existing extensions for your colony, you can use the respective Factory contract to generate it. Factory addresses are published in each [colonyNetwork release](https://github.com/JoinColony/colonyNetwork/releases/).

For example, to enable the `OneTxPayment` extension on a `colony` instance of `IColony` on the Görli testnet:

```
// Instantiate the extension factory on Görli
const oneTxExtensionFactory = await OneTxPaymentFactory.at("0x3e03f868450ffD588E2cB2034fA2e0F74F9FFbe3")

// Deploy a new OneTxPayment extension contract, dedicated for the colony
await oneTxExtensionFactory.deployExtension(colony.address);

// Instantiate the new extension
const oneTxExtensionAddress = await oneTxExtensionFactory.deployedExtensions(colony.address)
const oneTxExtension = await OneTxPayment.at(oneTxExtensionAddress)
```

Once the extension is setup, it will need `Admininstration` and `Funding` permissions in your colony to function. Permissions can be given is any domain you require the payment extension to work in, here is an example of permitting it those in the root with domainId 1.

```
await colony.setAdministrationRole(1, 0, oneTxExtension.address, 1, true)
await colony.setFundingRole(1, 0, oneTxExtension.address, 1, true)
```

## OneTxPayment
Ordinarily payments require more than one transaction, because the payment lifecycle requires more than one permissioned [role](/colonynetwork/docs-modular-permissions).

In some use cases, there might be a need for one authorized individual to be able to create, funds, and finalize a payment within a single transaction.

The `OneTxPayment` extension adds this functionality by adding a `makePayment` function which requires the caller to have *both* `Funding` and administration ability within the domain of the payment.

Extension therefore requires `Administration` and `Funding` roles to function.

## OldRoles
In earlier versions of the colonyNetwork, only two roles existed for permissioned accounts: "Founder", and "Admin"

The `OldRoles` extension bundles the roles in the `glider` release together into super-roles that have the same abilities as the original "Founder" (root) and "Admin" (funding, administration, architecture) roles.

Extension requires `Root` role to function.
