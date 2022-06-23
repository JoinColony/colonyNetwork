# Extensions

Starting with `glider`, the Colony contracts provide the option of expanding the basic functionality of a colony through the use of _extensions_.

Extensions are other smart contracts that have been given permissions to interact with a colony in a specified domain. Extensions can be used for many purposes, such as bundling transactions, automating certain actions, enabling stake-based permissionless functionality, or something else entirely. Their implementations are intentionally disconnected from the colonyNetwork codebase (stored in the [/contracts/extensions](https://github.com/JoinColony/colonyNetwork/tree/develop/contracts/extensions) folder in the network) to allow for greater design flexibility unbounded by the network protocol.

Currently there are four extensions 'officially' supported, but more may be added in the future. These extensions are written with dapp support in mind, and emit events to inform a user interface whether a colony has an extension enabled or not. Adding and removing an extension from a colony is restricted to those with `Root` permissions on the colony.

To support easily installation and upgrading of extensions, the Colony Network maintains a repository of "official" extensions. These extensions can be installed, upgraded, deprecated, and uninstalled through the colony itself by Root users.

For example, to enable the `FundingQueue` extension on a `colony` instance of `IColony` on the Görli testnet:

```
const extensionId = soliditySha3("FundingQueue");
await colony.deployExtension(extensionId, 1) // Install version 1

const extensionAddress = await colonyNetwork.getExtensionInstallation(oneTxExtensionId, colony.address);
const oneTxExtension = await OneTxPayment.at(extensionAddress)
```

Once the extension is setup, it will need the `Funding` permission in at least one domain in your colony to function. Permissions can be given is any domain you require the extension to work in, here is an example of permitting it those in the root with domainId 1.

```
await colony.setFundingRole(1, UINT256_MAX, oneTxExtension.address, 1, true)
```

## CoinMachine

A simple mechanism for continually selling tokens ([blog post](https://blog.colony.io/introducing-coin-machine/)).

Must be able to mint tokens, so requires the `Root` permission.

## FundingQueue

A decentralized financial allocation mechanism, as described in the [Colony Whitepaper](https://colony.io/whitepaper.pdf). Allows users to submit & back funding requests, with funding being allocated continually over time based on the level of support.

Must be able to transfer tokens between funding pots, so requires the `Funding` permission.

## OneTxPayment

Ordinarily payments require more than one transaction, because the payment lifecycle requires more than one permissioned [role](/colonynetwork/docs-modular-permissions).

In some use cases, there might be a need for one authorized individual to be able to create, funds, and finalize a payment within a single transaction.

The `OneTxPayment` extension adds this functionality by adding a `makePayment` function which requires the caller to have *both* `Funding` and administration ability within the domain of the payment.

Extension therefore requires `Administration` and `Funding` roles to function.

## VotingReputation

Colony's basic decentralized decision-making mechanism. Allows participants to create, support, and pass motions encoding arbitrary transactions.

Requires different permissions depending on usage, as the extension must be able to execute the encoded action.
