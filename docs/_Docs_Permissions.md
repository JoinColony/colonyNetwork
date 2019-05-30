---
title: Modular Permissions
section: Docs
order: 4
---

In the full implementation of the Colony protocol, any account with reputation in a colony should be allowed to move shared funds proportional with their reputation score. This functionality is planned for later releases.

In the `glider` release, permissions within a colony are based on roles.

An account may be given zero or more of five pre-defined roles that grant permission to call certain functions within a specific domain of the colony.

Inside each domain, the possible roles are:

* Administration
* Funding
* Architecture
* Arbitration
* Root (only exists in the top-level domain)

On a domain-by-domain basis, an address given one or more roles will be able to call the functions assigned to the role (see below for a list of each role and its authorized functions).

For example, within the 'logistics' domain, any address with the `ADMINISTRATION_ROLE` may call the `addPayment` function to create a new payment. But to add funding for the payment, an address with the `FUNDING_ROLE` must call `moveFundsBetweenPots` for the payment. These two functions can be called by the same address (even in the same transaction), provided that the address has both Administration and Funding permissions.

## Definitions

Roles are defined within `ColonyDataTypes.sol`, and initialized for functions in `ColonyAuthority.sol`

### Administration
```
makeTask
addPayment
setPaymentRecipient
setPaymentDomain
setPaymentSkill
setPaymentPayout
finalizePayment
```

### Funding
```
moveFundsBetweenPots
```

### Architecture

```
addDomain
setArchitectureRole
setFundingRole
setAdministrationRole
```
Note: Within `ColonyAuthority.sol` you will see this role implemented as `ARCHITECTURE_ROLE` and `ARCHITECTURE_SUBDOMAIN_ROLE`. This is in order to prohibit an architect from modifying the domain in which the role was given (which would allow them to, for example, remove their co-architect's role). Architects may alter permissions only in sub-domains only.

### Arbitration

Currently this role grants permission for no functions. It is a placeholder for the dispute resolution system, to be implemented in later releases.

### Root
```
setRootRole
setArchitectureRole
setFundingRole
setAdministrationRole
setRecoveryRole
removeRecoveryRole
startNextRewardPayout
bootstrapColony
registerColonyLabel
setRewardInverse
mintTokens
upgrade
addNetworkColonyVersion
setNetworkFeeInverse
addGlobalSkill
deprecateGlobalSkill
```

## It calls for `roleId`
Most functions in colony are *authorized* by a separate contract which defines the rules for who can call which functions. Any function that is decorated with the `auth` modifier will perform an authorization check before granting access to the function.

In the current Glider release, authority is based on roles, which are defined in the relevant "authority" contracts, e.g. `ColonyAuthority.sol`.

Roles within Colony act as a white-list for functions, registering specific addresses to a `Founder` or `Admin` role, approved to call a certain set of functions within a colony.

Roles also are used in task-level permissions. A more specific example of task roles can be seen in the [task workflow](https://docs.colony.io/colonyjs/topics-task-lifecycle/#task-roles).

In future releases, this pattern will allow for reputation-mediated authority in Colony.