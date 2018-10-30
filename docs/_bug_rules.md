---
title: Overview
section: Bug Bounty Program
order: 0
---

The Colony Network is a set of smart contracts designed to manage shared resources of multiple individuals in a secure and predictable manner. These digital assets could be of great value; it is therefore imperative that the system behaves as the Bagginses did before Bilbo: without ever doing anything unexpected.

To this end, Colony is offering substantial rewards to external developers who report bugs and flaws in the colonyNetwork contracts ([terms apply](https://docs.colony.io/colonynetwork/bug-bounty-program-terms-and-conditions/)).

This bug bounty does *not* apply to Colony tools such as Purser. See [Ineligible bugs](https://docs.colony.io/colonynetwork/bug-bounty-program-overview/#ineligible-bugs) for more information.

==TOC==

## Scope

This bug bounty program extends to all contracts within the [colonyNetwork Github repo](https://github.com/JoinColony/colonyNetwork).

Bounties for potential bugs include, but are not limited to:
* Reputation Mining vulnerabilities
* Task, Domain, and Skill workflow exploits
* Attacks during a network upgrade
* Authority and permissions

More generally, if it lives in the repository* and affects the Colony smart contracts, it's fair game.

_\* There are some components of the colonyNetwork repository that are not created by the Colony team, but which still could be relevant to overall security. If a bug or exploit makes use of any external libraries or submodules, it will be considered on a case-by-case basis for elegibility._

## Rules


### Submission Guidelines

All bugs reported must be done through the creation of an issue in the colonyNetwork github repo, or _if the submitter wishes to disclose privately, or to remain anonymous_ by an email sent to security@colony.io. Private submissions are still eligible for a bounty.

Unless there is a specific reason for a private disclosure, bugs should be submitted as issues on the colonyNetwork GitHub repository, and tagged with the 'bug' label.

It is requested that all submissions follow the format defined in the [issue template](https://github.com/JoinColony/colonyNetwork/blob/develop/docs/ISSUE_TEMPLATE.md) -- clarity of description and thoroughness of documentation will be a consideration for reward amount, in addition to impact and likelihood.

In the case of private bug disclosure, all relevant materials should be sent in email to `security@colony.io` -- and should follow the same template as a public issue.

Once submitted, the issue will be responded to, verified, accepted, and rewarded according to the timelines defined on our [service level agreement](https://docs.colony.io/colonynetwork/bug-bounty-program-terms-and-conditions/#service-level-agreement).

### Submission Branches
Participants in the program are free to submit bugs on two different branches in the colonyNetwork codebase:
* the current testnet release (tagged on the `master` branch) and deployed to Rinkeby
* against the `develop` branch where we merge ongoing work

Rinkeby deployments will be updated as _greenfield_ deployments, every one month.

### Bug Severity and Bounties
In the same manner as the [Ethereum Bug Bounty Program](https://bounty.ethereum.org/), submissions will be evaluated by the Colony team according to the [OWASP risk rating methodology](https://www.owasp.org/index.php/OWASP_Risk_Rating_Methodology), which grades based on both _Impact_ and _Likelihood_.

It is at the *sole discretion of Colony* to decide whether or not a bug report qualifies for a bounty, and to determine the severity of the issue

Severity levels:

* *Note*: Up to $500 USD (min. $100)
* *Low*: Up to $2,000 USD (min. $500)
* *Medium*: Up to $5,000 USD (min. $2,000)
* *High*: Up to $10,000 USD (min. $5,000)
* *Critical*: Up to $20,000 USD (min. $10,000)

Issues reported may or may not constitute a security risk for the colonyNetwork contracts. A higher severity will be awarded to vulnerabilities submitted that could potentially result in either the loss of funds, or a situation in which the contracts arrive in an undesirable state that cannot be rectified through existing contract mechanisms, such as 'emergency mode' or through a network upgrade. However, all submitted bugs and vulnerabilities will be considered for prizes.

### Ineligible Bugs

Any vulnerabilities or flaws in other software tools created by Colony (e.g. colonyJS, purser, tailor, etc.) are not eligible. Flaws in these software tools are welcome disclosures, but will not be awarded bounties for this bug bounty program.

Additional examples of ineligible bugs:
* Attacks and vulnerabilities that depend on compromised keys or other security flaws outside the colonyNetwork codebase (keyloggers, intercepted communications, social engineering exploits, etc.).
* Attacks that are accounted for in the system design, i.e. Ethereum network spamming, malicious reputation mining, malfeasance in colony administration.
* Critiques of the Colony Protocol and overall mechanism design. We welcome suggestions and constructive criticism, and ask that it be directed to hello@colony.io or the [Build with Colony Forums](https://build.colony.io/)

Please read the [terms and conditions](https://docs.colony.io/colonynetwork/bug-bounty-program-terms-and-conditions/) for more information.
