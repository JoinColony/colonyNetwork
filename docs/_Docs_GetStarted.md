---
title: Get Started
section: Docs
order: 1
---
This page details how to engage purely on the contract-level, and is intended more for developers looking to contribute new features, extensions, or contract-level integrations. See our [guidelines](https://github.com/JoinColony/colonyNetwork/blob/develop/docs/CONTRIBUTING.md) if you're interested in contributing to the colonyNetwork codebase.

If you're a dapp developer looking to integrate with colony, we recommend using [colonyJS](/colonyjs/intro-welcome/) as an entry point. There you'll find analogous instructions better suited to building applications on top of the colonyNetwork. For those without patience, we have built a [colonyStarter kit](/colonystarter/docs-overview/) which contains boilerplate examples for dapp development, including frontend frameworks like react, and is the fastest way to start building with Colony.

Either way, if you run into trouble or have any questions/comments, please post in our [developer forums](https://build.colony.io/).

==TOC==

## Colony Network

For local development and testing, follow instructions listed in the [repository readme page](https://github.com/JoinColony/colonyNetwork/blob/develop/docs/README.md).

For more detailed instructions, and additional steps required to set up an environment for use with [colonyJS](https://github.com/JoinColony/colonyJS), check out the colonyJS [Local Setup](/colonyjs/intro-local-setup/) documentation.

## `glider-rc.3` on the Görli testnet

The [Glider release candidate](https://github.com/JoinColony/colonyNetwork/releases/tag/glider-rc.3) is in many ways a simpler and easier way to experiment than setting up a local development environment, and can be very useful if you're looking to just get a sense of how the colonyNetwork contracts work, or want to build extensions/integrations that remain inside the EVM.

To connect, you'll need to know the address of the colonyNetwork (which is, in reality, the address of the `etherRouter` contract; see [upgrade design](/colonynetwork/docs-upgrade-design/) for more info).

`ColonyNetwork`: `0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B`

You will also require Görli test ETH, and a deployed ERC20 token to import.

### Access with Remix (good for experimenting)

For simple interactions, [Remix](http://remix-alpha.ethereum.org/) is a good lightweight way to call specific functions and get network information from the contracts.

Rather than import the entire set of contracts into remix, use the included `solidity-steamroller` to flatten the needed interface contracts to the `build/flattened/` directory:

```
$ npm run flatten:contracts
```

Navigate to `colonyNetwork/build/flattened/` to find the contracts you need to import to Remix.

In Remix, instantiate `flatIColonyNetwork.sol` to the `ColonyNetwork` address `0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B`

Use the address of your existing ERC20 token contract to `createColony()`, then immidiately use `getColonyCount()` to get your colony's ID.

Call `getColony()` to get your colony's address from the ID, then instantiate `flatIColony.sol` to your colony's address in Remix.


### Access with the Truffle console

First, add a private key of your choice to the `truffle.js` configuration file:
```
goerli: {
      provider: () => {
        return new HDWalletProvider("replace-with-private-key-when-using", "https://goerli.infura.io/v3/e21146aa267845a2b7b4da025178196d");
      },
      network_id: "5"
    }
  },
```

Then, start up the truffle console and connect to testnet:
```
$ npx truffle console --network goerli
```
In the truffle console, instantiate the IColonyNetwork interface on Görli:
```
truffle(goerli)> let colonyNetwork = await IColonyNetwork.at("0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B")

```
From here, you can create a new colony (with an ERC20 token already deployed):
```
truffle(goerli)> await colonyNetwork.createColony("your-erc20-token-address")
```
And find your colony's id (the newest created colony) after the transaction is mined:
```

truffle(goerli)> await colonyNetwork.getColonyCount()
```

**Helpers for multisig**
Constructing multisig transactions is required for certain parts of the task workflow. These transactions involve [parameterized transaction reviews](https://blog.colony.io/parameterized-transaction-reviews-11f0cdc40479/) signed by at least one of the task role members. The operations work through the `executeTaskChange` and `executeTaskRoleAssignment` methods.  

To simplify their execution, we provide a set of convenience functions which you can import in the truffle console via
`const sigHelper = require("../helpers/task-review-signing.js")`

To execute a signed task change, for example, cancel a task with id 5, you can call the helper in the truffle console as follows:
```
await sigHelper.executeSignedTaskChange({colony, functionName:"cancelTask",taskId:5, signers:[TASK_MANAGER_ADDRESS], privKeys:[TASK_MANAGER_PRIVATE_KEY], sigTypes: [0],args: [5]})
```

`colony` is your colony instantiated in the console via `const colony = await IColony.at(COLONY_ADDRESS)`.

`TASK_MANAGER_ADDRESS` and `TASK_MANAGER_PRIVATE_KEY` are the address and private key of the manager account for task 5.

Note that in this example the task is not yet assigned a worker, otherwise both the signatures and private keys of manager and worker would be required.

### Safely testing transactions against Goerli and Mainnet

If you want to safely test your transactions before executing them against a network, you can fork the target network and do a practice run there. To fork either goerli or mainnet networks with `ganache-cli` use

`npx ganache-cli --fork https://goerli.infura.io/v3/e21146aa267845a2b7b4da025178196d`
for goerli

`npx ganache-cli --fork https://mainnet.infura.io/v3/e21146aa267845a2b7b4da025178196d`
for mainnet

This will start a local copy of the target network running on `ganache-cli` which returns `revert` error messages for failed transactions that are essential in troubleshooting. Other benefits of the forked network include instant mining and zero gas costs.

Then you can connect via the truffle console to this local node via the usual way `npx truffle console`. In the console you can then safely execute your transactions to test their results.
