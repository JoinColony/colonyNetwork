# Modular Permissions

In the full implementation of the Colony protocol, decision making will be determined by the reputation score of an account. Actions that are currently permissioned, such as moving shared funds and creating a task, will be allowed proportionate to an account's reputation score. This functionality is planned for later releases.

In the current `glider` release, network state changes are authorized by dedicated "authority" contracts e.g. `ColonyAuthority.sol`. These are based on the `DSRoles` implementation from [dappsys](https://github.com/dapphub/dappsys-monolithic). Functions decorated with the `auth` and `authDomain` modifiers will perform an authorization check via the authority contracts before granting access. In future releases, this pattern will also allow us to switch to a reputation-mediated authority in colonies.

Roles are defined within `ColonyRole` struct and grant permission to call certain functions within a specific domain of the colony. These are initialized in `ColonyAuthority.sol`. An account may be given one or more of the available pre-defined roles:

* Administration
* Funding
* Architecture
* Arbitration
* Root (only exists in the top-level domain)

Note: Currently, the existing `auth` modifier is preserved and checks for permissions in the root domain.

Note: Currently `Arbitration` role grants permission for no functions. It is a placeholder for the dispute resolution system, to be implemented in later releases.

## Domain permission transitivity
*Note: Domains are currently restricted to one level below the root domain. This restriction will be removed after release.*

Domain permissions extend from the root domain. Permissions held in a domain are held in all child sub-domains, but not in parent domains.

As an example, consider this tree of domains in a colony (using domainIds as identifiers):

```
      1
   /  |  \
  2   4   6
 / \  
3   5
```

Authority in domain `2` to call a permissioned function is valid in domains `3` and `5`, but not `6`. Authority in domain `1` to call a permissioned function is valid in all subdomains.

## Using permissioned functions
Permissioned functions check two arguments, which are by convention the first and second ones expected in all permissioned functions:

`_permissionDomainId`: The domain that gives the caller the authority to execute an action
`_childSkillIndex`: an index that specifies where to find the domain in which the action occurs.

New domains are given a unique skillId upon creation, so a colony with the following domain structure
```
      1
   /  |  \
  2   4   6
 / \  
3   5
```
might have local skillIds assigned as:
```
       142
    /   |   \
  147  254  696
  / \  
159  307
```

In this example,
* Skill `142` has children: `[147, 159, 254, 307, 696]`
* Skill `147` has children: `[159, 307]`
* Skill `254` has children: `[]`

If a user with "Admininstration" authority in domain `2` wants to finalize a payment in domain `5`, they would call:

```
colony.finalizePayment(2, 1, _paymentId);
```

The `authDomain` modifier performs the following checks:

* Whether `msg.sender` has the "Administration" or "Root" permission in domain `2`
* Whether the domain of action (in this case domain `5`) is indeed a child of the permission domain `2`, by checking that the second item in the `childSkillIndex` matches the local skill associated with the domain, whatever that may be.   

Note: Functions authorized by the "Architecture" role check to see that the domain is strictly a child of the permission domain exclusively (not the permission domain itself).

Within `ColonyAuthority.sol` you will see this role implemented as both`Architecture` and `ArchitectureSubdomain` roles. This is in order to prohibit an architect from modifying the domain in which the role was given (which would allow them to, for example, remove their co-architect's role). Architects may alter permissions in sub-domains only.
