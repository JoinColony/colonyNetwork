---
title: Modular Permissions
section: Docs
order: 4
---

In the full implementation of the Colony protocol, decision making will be determined by the reputation score of an account. Actions that are currently permissioned, such as moving shared funds and creating a task, will be allowed proportionate to an account's reputation score. This functionality is planned for later releases.

In the current `glider` release, network state changes are authorised by dedicated "authority" contracts e.g. `ColonyAuthority.sol`. These are based on the `DSRoles` implementation from [dappsys library](https://github.com/dapphub/dappsys-monolithic). Functions decorated with the `auth` and `authDomain` modifiers will perform an authorization check via the authority contracts before granting access. In future releases, this pattern will also allow us to switch to a reputation-mediated authority in colonies.

Roles are defined within `ColonyRole` struct and grant permission to call certain functions within a specific domain of the colony. These are initialized in `ColonyAuthority.sol`. An account may be given one or more of the available pre-defined roles:

* Administration
* Funding
* Architecture
* Arbitration
* Root (only exists in the top-level domain)

Note: Currently, the existing `auth` modifier is preserved and checks for permissions in the root domain.

Note: Currently `Arbitration` role grants permission for no functions. It is a placeholder for the dispute resolution system, to be implemented in later releases.

For example, within the 'logistics' domain, any address with the `Administration` role may call the `addPayment` function to create a new payment. But to add funding for the payment, an address with the `Funding` role must call `moveFundsBetweenPots` for the payment. These two functions can be called by the same address (even in the same transaction), provided that the address has both `Administration` and `Funding` permissions.

**Domain permission inheritance**
Domain permissions flow down in the domain tree. As an example of how domain permissions propagate, consider this tree of domains in a colony (using domainIds as identifiers):

```
      1
   /  |  \
  2   4   6
 / \  
3   5
```

If you have funding permission in `3`, and funding permission in `6`, you shouldn't be able to move funds from `3` to `6`, because that would be taking them out of `2`, which you don't have the permission for. If you have funding permission in `1`, however, you should be able to move from `3` to `6`, because that's all under 'one roof'.

**Using permissioned functions**

In order to provide the necessary inputs to the authorisation logic, we have added two arguments to every permissioned function, which by convention are the first two arguments. The first is the permission domain id (`_permissionDomainId`), and the second is an index (`_childSkillIndex`) telling us where in the child array of the permission domain we can find the "domain of action". The "domain of action" itself is the domain in which state is being changed.

For example is a colony with the domain tree below,
```
      1
   /  |  \
  2   4   6
 / \  
3   5
```
which has representative local skills Id as follows:
```
       142
    /   |   \
  147  254  696
  / \  
159  307
```
Skill `142` has the following `children`: `[147, 159, 254, 307, 696]`

if we want to grant user `USER2` permission to create tasks and payments in domain `5`, and we ourselves are user `USER1` have root permissions. We need to give them permissions in that specific domain as follows:

```
colony.setAdministrationRole(1, 3, USER2, 5, true, { from: USER1 });
```

Essentially the two additional parameters are used to perform the following checks:

1) Whether `USER1` has the permission to assign a new `Administrator` in `_permissionDomainId`, which is domain `1` in this case.

2) Whether the domain of action, if this case domain `5`, is actually a child of the permission domain `1`. This is done using `_childSkillIndex`, here passed as `3` meaning the permission domain (`1`) `skill.children` array's third member should match domain `5` skill.

And for the architecture permission, checks to see that the domain is strictly a child of the permission domain (i.e. not the permission domain itself).

Note: Within `ColonyAuthority.sol` you will see this role implemented as both`Architecture` and `ArchitectureSubdomain` roles. This is in order to prohibit an architect from modifying the domain in which the role was given (which would allow them to, for example, remove their co-architect's role). Architects may alter permissions in sub-domains only.