# Bug Bounty Program

The Colony Network is a set of smart contracts designed to manage shared resources of multiple individuals in a secure and predictable manner. These digital assets could be of great value; it is therefore imperative that the system behaves as the Bagginses did before Bilbo: without ever doing anything unexpected.

To this end, Colony is offering substantial rewards to external developers who report bugs and flaws in the colonyNetwork contracts ([terms apply](bug-bounty.md#service-level-agreement)).

This bug bounty does _not_ apply to Colony tools such as Purser. See [Ineligible bugs](bug-bounty.md#ineligible-bugs) for more information.

## Scope

This bug bounty program extends to all contracts within the [colonyNetwork Github repo](https://github.com/JoinColony/colonyNetwork).

Bounties for potential bugs include, but are not limited to:

* Reputation Mining vulnerabilities
* Task, Domain, and Skill workflow exploits
* Attacks during a network upgrade
* Authority and permissions

More generally, if it lives in the repository\* and affects the Colony smart contracts, it's fair game.

_\* There are some components of the colonyNetwork repository that are not created by the Colony team, but which still could be relevant to overall security. If a bug or exploit makes use of any external libraries or submodules, it will be considered on a case-by-case basis for elegibility._

## Rules

### Submission Guidelines

All bugs reported must be done through the creation of an issue in the colonyNetwork github repo, or _if the submitter wishes to disclose privately, or to remain anonymous_ by an email sent to security@colony.io. Private submissions are still eligible for a bounty.

Unless there is a specific reason for a private disclosure, bugs should be submitted as issues on the colonyNetwork GitHub repository, and tagged with the 'bug' label.

It is requested that all submissions follow the format defined in the [issue template](https://github.com/JoinColony/colonyNetwork/blob/develop/.github/ISSUE\_TEMPLATE.md) -- clarity of description and thoroughness of documentation will be a consideration for reward amount, in addition to impact and likelihood.

In the case of private bug disclosure, all relevant materials should be sent in email to `security@colony.io` -- and should follow the same template as a public issue.

Once submitted, the issue will be responded to, verified, accepted, and rewarded according to the timelines defined on our [service level agreement](bug-bounty.md#service-level-agreement).

### Submission Branches

Participants in the program are free to submit bugs on two different branches in the colonyNetwork codebase:

* the current testnet release (tagged on the `develop` branch) and deployed to Görli
* against the `master` branch which will be tagged as the mainnet release for deployment

### Bug Severity and Bounties

In the same manner as the [Ethereum Bug Bounty Program](https://bounty.ethereum.org/), submissions will be evaluated by the Colony team according to the [OWASP risk rating methodology](https://www.owasp.org/index.php/OWASP\_Risk\_Rating\_Methodology), which grades based on both _Impact_ and _Likelihood_.

It is at the _sole discretion of Colony_ to decide whether or not a bug report qualifies for a bounty, and to determine the severity of the issue

Severity levels:

* _Note_: Up to $500 USD (min. $100)
* _Low_: Up to $2,000 USD (min. $500)
* _Medium_: Up to $5,000 USD (min. $2,000)
* _High_: Up to $10,000 USD (min. $5,000)
* _Critical_: Up to $20,000 USD (min. $10,000)

Issues reported may or may not constitute a security risk for the colonyNetwork contracts. A higher severity will be awarded to vulnerabilities submitted that could potentially result in either the loss of funds, or a situation in which the contracts arrive in an undesirable state that cannot be rectified through existing contract mechanisms, such as 'emergency mode' or through a network upgrade. However, all submitted bugs and vulnerabilities will be considered for prizes.

### Ineligible Bugs

Any vulnerabilities or flaws in other software tools created by Colony (e.g. colonyJS, purser, tailor, etc.) are not eligible. Flaws in these software tools are welcome disclosures, but will not be awarded bounties for this bug bounty program.

Additional examples of ineligible bugs:

* Attacks and vulnerabilities that depend on compromised keys or other security flaws outside the colonyNetwork codebase (keyloggers, intercepted communications, social engineering exploits, etc.).
* Attacks that are accounted for in the system design, i.e. Ethereum network spamming, malicious reputation mining, malfeasance in colony administration.
* Critiques of the Colony Protocol and overall mechanism design. We welcome suggestions and constructive criticism, and ask that it be directed to [hello@colony.io](mailto:hello@colony.io).

## Eligibility and Participation Requirements

To participate in this bug bounty you must:

* Not be employed by Colony, a family member of a person employed by Colony, or a contractor of Colony.
* Not be in violation of any national state, or local law or regulation with respect to any activities directly or indirectly related to the Bug Bounty Program

To qualify for a bounty you must:

* Be the first to report a specific vulnerability
* Report a vulnerability through the process outlined in the [Rules](bug-bounty.md#rules)
* Disclose the vulnerability responsibly and directly to Colony. Disclosure to other third parties before or during bug review will invalidate the submission
* Not seek or leverage the vulnerability for additional or external bounties or rewards

### Good Faith Participation

All participants in the Bug Bounty Program must act in good faith when investigating vulnerabilities. "Good Faith" means:

* Play by the Rules -- Abide by the terms and conditions specified herein. If you have any questions or concerns about the terms and conditions, please reach out directly to the Colony team about it
* Don't be a jerk. You should never illegally or in bad faith leverage the existence of a vulnerability or access to sensitive or confidential information, such as making extortionate demands or ransom requests or trying to shake us down. In other words, if you find a vulnerability, report it to us with no conditions attached
* Work for Good -- You should never leave a system or users in a more vulnerable state than when you found them. This means that you should not engage in testing or related activities that degrades, damages, or destroys information within our systems, or that may impact our users, such as denial of service, social engineering, or spam

Failure to act in good faith will result in immediate disqualification from the Bug Bounty Program and ineligibility for receiving any benefit of the Bug Bounty Program

## Service Level Agreement

After a vulnerability has been submitted either as an [issue on GitHub](https://github.com/JoinColony/colonyNetwork/issues) or as an email to `security@colony.io`, the Colony team will evaluate and determine if the vulnerability is eligible for a bounty within 3 days.

Accepted bounties will be graded and assigned a severity according to the team's assesment within 7 days, or a total of 10 days from first submission.

Once the severity and bounty is decided, the Colony team will begin work on patching the bug. In this case, a PR will be opened that references the issue of original report. This PR may request more information from the submitter of the bug, and may accept input from external developers for fixing. Participation in resolving a vulnerability is welcome but not required to receive a bounty.

When the PR closing the referenced issue is merged to the `/develop` branch (and, in the case of a live mainnet deployment, an upgrade has been successfully deployed), the issue will be considered "resolved" and payment can take place.

Payment will be disbursed as DAI through the Gitcoin platform to the account which submitted the bounty report, unless otherwise requested by the submitter. Payment will take place as soon as possible following the report's resolution, but may take up to 30 days to process.

You must comply with all applicable laws in connection with your participation in this program. You are also responsible for any applicable taxes associated with any reward you receive.

### Limitation of Liability

YOUR PARTICIPATION IN THE BUG BOUNTY PROGRAM IS AT YOUR OWN RISK. COLONY HEREBY DISCLAIMS ANY AND ALL WARRANTIES, EXPRESS, IMPLIED, STATUTORY OR OTHERWISE WITH RESPECT TO THE BUG BOUNTY PROGRAM. Colony SHALL NOT BE LIABLE FOR ANY DIRECT OR INDIRECT DAMAGES ARISING OUT OF OR RELATED TO YOUR PARTICIPATION OR INABILITY TO PARTICIPATE IN THE BUG BOUNTY PROGRAM. Colony assumes no responsibility for any computer, online, telephone transmission or technical malfunctions that may occur during participation in the bug bounty program, or for theft, destruction or unauthorized access to, or alteration of, your submission or any other materials submitted by you. Colony is not responsible for any incorrect or inaccurate information, whether caused by website users, other participants, or any of the equipment or programming associated with or utilized in the Competition, or for any technical or human error which may occur in the processing of submissions in the Competition. Colony assumes no responsibility for any error, interruption, defect, or delay in operation or transmission, failures or technical malfunction of the Internet, or any telephone network or lines, computer online systems, servers, computer equipment, software, email. Colony is not responsible for any injury or damage to participants or to any computer related to or resulting from participating or downloading materials in this program. Some jurisdictions may not allow certain limitations on liability and so the foregoing limitations may not apply to you.

### Ineligible Persons

The Bug Bounty Program is not open to any of the following persons (“Ineligible Persons”): (1) anyone who is not at least the legal age of majority, at the time of Entry, to form valid contracts in their respective country, province or state of legal residence; or (2) in, a country, state, province or territory where the laws of the United States or local law prohibits participating or receiving a prize in the Bug Bounty program (including, but not limited to, Brazil, Quebec, and Cuba, Sudan, Iran, North Korea, Syria, Myanmar (formerly Burma) and any other country designated by the United States Treasury's Office of Foreign Assets Control) . Employees, independent contractors under a current services agreement with Colony and members of their immediate families (defined as parents, children, siblings and spouse, regardless of where they reside and/or those living in the same household of each) are not eligible to participate in the Bug Bounty Program. Colony reserves the right to verify eligibility and to adjudicate on any dispute at any time.

### Additional Terms

We may modify the terms of this program or terminate this program at any time. We won’t apply any changes we make to these program terms retroactively.

All conditions specified in the [general terms agreement of colony.io](https://xdai.colony.io/terms-and-services) apply to this program.

### 1. Definitions

### 1.1 "Bounty", "Prize", "Payout", "Reward"

The monetary reward for submitting a vulnerability that is accepted, graded, and resolved by the process defined in the terms and conditions herein.

### 1.2 "Bug", "Vulnerability", "Exploit", "Bug Report", "Bug Report Issue"

A disclosure of any software flaw or attack vector submitted to the bug bounty program, and any related documentation thereof.

### 1.4 "Colony"

This program is sponsored by Collectively Intelligent Ltd (3 Butler House, 49-51 Curtain Road, London, United Kingdom EC2A 3PT ("Colony"). Colony is responsible for any website hosting, marketing, bug report assessment, prize disbursement, and any other activities not listed here related to the Bug Bounty Program.

### 1.7 "Submitter", or "Participant"

The individual or individuals disclosing a vulnerability in the bug bounty program. In the case of this program, this implies the owner of the Github account which creates and submits the bug report as an issue. This may also mean the holder of an Ethereum account requesting a prize for a submitted vulnerability, or the owner of the email address submitting a bounty privately to security@colony.io
