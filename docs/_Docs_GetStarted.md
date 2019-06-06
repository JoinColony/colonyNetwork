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

To connect, you'll need to know the address of the colonyNetwork (which is, in reality, the address of the `etherRouter` contract; see [The Delegate Proxy Pattern](/colonynetwork/docs-upgrade-design/) for more info).

`ColonyNetwork`: `0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B`

You will also require Görli test ETH, and a deployed ERC20 token to import.

### Access with Remix (good for experimenting)

For simple interactions, [Remix](http://remix-alpha.ethereum.org/) is a good lightweight way to call specific functions and get network information from the contracts.

Rather than import the entire set of contracts into remix, use the included `solidity-steamroller` to flatten the needed interface contracts to the `build/flattened/` directory:

```
$ yarn flatten:contracts
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
$ yarn truffle console --network goerli
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