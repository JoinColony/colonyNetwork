---
description: >-
  A guide on how to deploy and run the Colony Network Smart Contracts on your
  machine
---

# Deploying Colony Locally

This guide will cover the basics of getting the Colony Network Smart Contracts running on your local development machine.

{% hint style="info" %}
Keep in mind that following this guide will enable you to only _deploy_ and _run_ the contracts locally in order to develop software against the Colony API that needs an [RPC endpoint](https://eth.wiki/json-rpc/API) (like [ColonyJS](https://app.gitbook.com/o/-MTaEZ\_7xhxpButTDDNj/s/QcRjzRciEwod6UqfA3ta/) or the [Colony SDK](https://app.gitbook.com/o/-MTaEZ\_7xhxpButTDDNj/s/slSiNQHJDrgYgciBacVr/)). If you would like to work on the Colony Network contracts _themselves_, please see [Contributing](../contributing.md).
{% endhint %}

## Starting out

After cloning the repository and installing the remaining dependencies you can start a local blockchain with the Colony contracts deployed. Read on to find out how.

### Prerequisites

You will need to have [NodeJS](https://nodejs.org/en/), [Yarn](https://yarnpkg.com/) and optionally [Docker](https://docs.docker.com/get-docker/) installed. See [here](../quick-start.md#prerequisites) for more information.

### Cloning the repository and preparing the dependencies

Please [follow this guide](../quick-start.md#cloning-the-repository-and-preparing-the-dependencies) to clone and set up the repository.

### Starting an RPC server

The RPC development server is a piece of software that emulates the behavior of a "real" RPC node like [geth](https://geth.ethereum.org/). It runs on your machine and you can deploy Smart Contracts just like on any Ethereum chain. A blockchain on your computer! We are using [Ganache](https://trufflesuite.com/ganache/) for this, which is part of the [Truffle](https://trufflesuite.com/) suite.

Ganache was installed when you set up all the dependencies earlier. You can start a CLI version of it like so (run in a different terminal window from the `colonyNetwork` directory):

```bash
yarn start:blockchain:client
```

This will run Ganache on port `8545`. Do not close the window, we're about to deploy the contracts!

{% hint style="info" %}
Ganache will also create a file called `ganache-accounts.json` in the `colonyNetwork` directory. This file contains the public and private keys of development accounts you can use (see the `private_keys` property at the bottom). These accounts will be used to deploy the ColonyNetwork contracts and will be funded with ETH on the local blockchain. You are encouraged to use them in your own code!
{% endhint %}

### Deploying the Colony Network contracts

To deploy the Colony Network contracts to the running development RPC node (Ganache) we use the following command (**make sure you're using the same NodeJS version as for Ganache**):

{% tabs %}
{% tab title="Using Docker" %}
```bash
yarn truffle migrate --reset --compile-all
```
{% endtab %}

{% tab title="Without Docker" %}
```bash
DISABLE_DOCKER=true yarn truffle migrate --reset --compile-all
```
{% endtab %}
{% endtabs %}

This will run Truffle's so called **migrations**, to deploy all contracts. Keep in mind that this will not only deploy the main `ColonyNetwork` contract, but also set up the MetaColony alongside all its extensions. Please be patient, this will take some time. When you see something akin to the following output, everything was successfully deployed:

```
Summary
=======
> Total deployments:   13
> Final cost:          0.57571114 ETH
```

The migration scripts will also create a file called `etherrouter-address.json`. It contains the address for the main entry point for the Colony Contracts and can be instantiated as the `ColonyNetwork` contract. From this one you will be able to figure out all relevant addresses by just calling the corresponding functions on the `ColonyNetwork` contract.

{% hint style="info" %}
&#x20;Why `etherrouter-address`? Colony uses the so called _EtherRouter_ pattern for upgradeable Smart Contracts. Read more about that [here](https://blog.colony.io/writing-upgradeable-contracts-in-solidity-6743f0eecc88/). Or watch [this video](https://www.youtube.com/watch?v=Sw9O2LWgWC0). It's up to you :)
{% endhint %}

What does that mean in practice? Act as if the `etherrouter-address` is the Address for the deployed `ColonyNetwork` contract.

## Talking to the Colony Network

While the Ganache RPC is still running, we can now actually communicate with the deployed contracts. Let's find out the address of the `EtherRouter` and ask for the locally deployed MetaColony's address:

```bash
cat etherrouter-address.json       
# {"etherRouterAddress":"0x5CC4a96B08e8C88f2c6FC5772496FeD9666e4D1F"}
curl -X POST --data '{"jsonrpc":"2.0","method":"eth_call","params":[{ "to": "0x5CC4a96B08e8C88f2c6FC5772496FeD9666e4D1F", "data": "0x731bc22f" }],"id":1}' http://localhost:8545
# {"id":1,"jsonrpc":"2.0","result":"0x0000000000000000000000001133560db4aebbebc712d4273c8e3137f58c3a65"}
```

What happened here? Let's break it down:

As mentioned before, the `etherRouterAddress` can be seen as the address the [IColonyNetwork](https://github.com/JoinColony/colonyNetwork/blob/db41471f222a012c1a05f48a129f71c8d93d8a3b/contracts/colonyNetwork/IColonyNetwork.sol) contract is deployed under. Now we are using curl to talk to the Ethereum JSON-RPC API of our Ganache node. See [the RPC API documentation](https://eth.wiki/json-rpc/API#eth\_call) for detailed explanations.

What we're doing here is issuing a `call` to the [`getMetaColony()`](https://github.com/JoinColony/colonyNetwork/blob/db41471f222a012c1a05f48a129f71c8d93d8a3b/contracts/colonyNetwork/IColonyNetwork.sol#L75) function on the contract with the address `0x5CC4a96B08e8C88f2c6FC5772496FeD9666e4D1F` (the `to` field). This is encoded in the `data` field by using the first four bytes of the `keccak256` hash of the function signature (`getMetaColony()`) - including its parameter types (in this case there are none). For some more examples see the [Solidity documentation](https://docs.soliditylang.org/en/latest/abi-spec.html#examples).

To reiterate:

| Function signature                                                                                                               | `getMetaColony()`                                                  |   |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | - |
| Function signature `keccak256` hash (use for example [this online tool](https://emn178.github.io/online-tools/keccak\_256.html)) | `731bc22f478b87eebe748e766203ce0cbda401a2dd97cc0679f3a69a209ed724` |   |
| First four bytes                                                                                                                 | `731bc22f`                                                         |   |

{% hint style="info" %}
If this way of communication with Ethereum Smart Contracts seems cumbersome to you - that's because it is! Luckily some wonderful people in the Open Source community built tools to make all this a lot easier. For general solutions look into [`ethers.js`](https://docs.ethers.io/v5/) or [`web3.js`](https://web3js.readthedocs.io/).
{% endhint %}

The Ganache server will answer with the address of the deployed MetaColony (plus some 0-padding): `0x1133560db4aebbebc712d4273c8e3137f58c3a65`.

Check the logs of the `truffle migrate` command we issued earlier. The MetaColony should have the same address:

```
8_setup_meta_colony.js
======================
### Meta Colony created at 0x1133560dB4AebBebC712d4273C8e3137f58c3A65

   > Saving migration to chain.
   -------------------------------------
   > Total cost:                   0 ETH
```

****:tada:**Congratulations, you've successfully deployed the ColonyNetwork** :tada:****

Where to go from here? Well, you can try to issue a few more `eth_call` commands to retrieve data or even make a custom manual transaction?

Or just go down the easy path! We created [Colony SDK](https://app.gitbook.com/o/-MTaEZ\_7xhxpButTDDNj/s/slSiNQHJDrgYgciBacVr/), to make it really easy to talk to the Colony contracts. With the knowledge you just acquired you can even test it out locally. Or try our more involved solution [ColonyJS](https://app.gitbook.com/o/-MTaEZ\_7xhxpButTDDNj/s/QcRjzRciEwod6UqfA3ta/) that is quite a bit more flexible - we're using it to power the Colony Dapp!

## Setting up the Reputation Oracle (optional)

If you would like to access the reputation related functionality within your development work (mainly to get a user's reputation), please see [this guide](reputation-oracle-setup.md).
