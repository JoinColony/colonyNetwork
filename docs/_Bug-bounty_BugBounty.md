---
title: Bug Bounty Program
section: Bug Bounty
order: 0
---
## Colony Bug Bounty Program

The Colony Network is a set of smart contracts designed to manage shared resources of multiple individuals in a secure and predictable manner. The system is designed to handle a potentially large amount of digital assets; it is therefore imperative that the system behaves as the Bagginses did before Bilbo: without ever doing anything unexpected.

To this end, Colony is offering substantial rewards to external developers who report bugs and flaws in the colonyNetwork contracts.

Interested? Read on.

## Rules

All bugs reported must be done _either_ through the creation of an issue in the colonyNetwork github repo, or by an email sent to security@colony.io (if the bug is deemed by the finder to be sensitive to public disclosure).

## Scope
This bug bounty program extends to all contracts within the [colonyNetwork Github repo](https://github.com/JoinColony/colonyNetwork).

* Reputation Mining vulnerabilities
* Task, Domain, and Skill workflow exploits
* Attacks during a network upgrade.

## Ineligible Bugs

To qualify for a bounty a bug must be vulnerability or flaw expressed in the colonyNetwork codebase*.

* *If a vulnerability makes use of a flaw in an imported submodule (dappsys libraries), it is at the discretion of Colony to decide whether it qualifies for a bounty or not.*

Any vulnerabilities or flaws in other software tools created by Colony (e.g. colonyJS, purser, tailor, etc.) are not eligible. Flaws in these software tools are welcome disclosures, but will not be awarded bounties for this bug bounty program.

Additional examples of ineligible bugs:
* Attacks and vulnerabilities that depend on compromised keys or other security flaws outside the colonyNetwork codebase (keyloggers, intercepted communications, etc.).
* Attacks that are accounted for in the system design, i.e. Ethereum network spamming, malicious reputation mining, malfeasance in colony administration.


## Bug Severity and Bounties
In the same manner as the [Ethereum Bug Bounty Program](https://bounty.ethereum.org/), submissions will be evaluated by the Colony team according to the OWASP risk rating model, methodology, which grades based on both _Impact_ and _Likelihood_.

Issues reported may or may not constitute a security risk for the colonyNetwork contracts. The key consideration for bugs is whether or not a flaw in the contracts could potentially result in either the loss of funds, or a situation in which the contracts arrive in an un-desirable state that *cannot be rectified through existing contract mechanisms, such as 'emergency mode' or through a network upgrade.

It is at the *sole discretion of Colony* to decide whether or not a bug report qualifies for a bounty, and to determine the severity of the issue.

* Note: Up to $500 USD
* Low: Up to $2,000 USD
* Medium: Up to $5,000 USD
* High: Up to $10,000 USD
* Critical: Up to $20,000 USD



## Eligibility and Participation Requirements


## Service Level Agreement

Response within 3 days determining whether or not the report qualifies for any bounty

If the report qualifies, determination of severity and size of reward within 7 business days.

Once the severity and bounty is decided, the Colony team will begin work on patching the bug.

In this case, a PR will be opened that references the issue of original report. This PR may request more information from the submitter of the bug, and may accept input from external developers for fixing.

When the PR closing the referenced issue is merged to the `/develop` branch (and, in the case of a live mainnet deployment, an upgrade has been successfully deployed), the issue will be considered "resolved" and payment can take place.

Time to remediation:
* Critical: within 3 days
* High: within 9 business days
* Medium: within 30 business days
* Low, within 60 business days





## Terms and Conditions

### 1. Definitions

#### 1.1 "Bounty"

#### 1.2 "Bug Report Issue"

#### 1.3 "Bug Bounty Program"

#### 1.4 "Colony"

#### 1.5 "Issue"

#### 1.6 "Remediation"
