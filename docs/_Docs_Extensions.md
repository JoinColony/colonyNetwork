---
title: Extensions
section: Docs
order: 5
---

`glider` provides the option of "extensions" to the basic functionality of a colony through the use of _extensions_.

Extensions are other smart contracts that have been given permissions to interact with a colony in a specified domain. Extensions can be used for many purposes, such as bundling transactions, automating certain actions, or something else entirely.

Extensions do not need to be part of the colonyNetwork codebase to function, the contract address simply must be given permission to call the desired functions as a member of the colony.

Currently there are two extensions 'officially' supported, but more may be added in the future. These extensions are written with dapp support in mind, and emit events to inform a user interface whether a colony has an extension enabled or not.

Supported extensions implement a 'factory' design pattern to make deployment straightforward for users, but custom extensions need not follow this pattern. 

## OneTxPayment
Ordinarily payments require more than one transaction, because the payment lifecycle requires more than one permissioned [role](/colonynetwork/docs-modular-permissions).

In some use cases, there might be a need for one authorized individual to be able to create, funds, and finalize a payment within a single transaction.

The `OneTxPayment` extension adds this functionality by adding a `makePayment` function which requires the caller to have *both* funding and administration ability within the domain of the payment.

## OldRoles
In earlier versions of the colonyNetwork, only two roles existed for permissioned accounts: "Founder", and "Admin"

The `OldRoles` extension bundles the roles in the `glider` release together into super-roles that have the same abilities as the original "Founder" (root) and "Admin" (funding, administration, architecture) roles.
