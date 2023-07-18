---
description: Quick Start for developing the Colony Network Smart contracts
sidebar_position: 0
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Quick Start

## Prerequisites

You will need:

* [NodeJS](https://nodejs.org/en/) v14.x (use [nvm](https://github.com/nvm-sh/nvm))
* [Docker](https://docs.docker.com/get-docker/) (at least v18, **optional**)

The Colony Network contracts are written in [Solidity](https://soliditylang.org/) and are built, tested and deployed using the [Truffle Suite](https://trufflesuite.com/). With the above dependencies in place you can just follow the instructions below and the Colony Network build scripts will sort out everything else for you.

:::tip
If you're a Dapp developer looking to integrate with Colony, we recommend using [The Colony SDK](https://docs.colony.io/colonysdk/) as an entry point as it is the fastest way to start building with Colony. There you'll find analogous instructions better suited to building applications on top of the colonyNetwork. We also have created some [examples](https://github.com/JoinColony/colonyJS/tree/main/packages/sdk/examples) that you can try out [live in your browser](https://joincolony.github.io/colonyJS/)!
:::

## Cloning the repository and preparing the dependencies

Clone the repository including all its git submodules using this command:

```bash
git clone https://github.com/JoinColony/colonyNetwork.git --recursive
```

:::caution
**Heads up!** Don't forget to add the `--recursive` flag to also clone the git submodules. They are important building blocks for some of the contracts.
:::

Change to the `colonyNetwork` directory and check out the latest version tag (find a list of all released versions and their tags [here](https://github.com/JoinColony/colonyNetwork/releases)):

```bash
cd colonyNetwork
git checkout eac730e # replace eac730e with glwss in the future as soon as it's available
```

:::info
Check out a tagged git release if you want to develop _against_ the ColonyNetwork contracts (like running an RPC node)! Only tagged GitHub releases are known to work under all circumstances and are the ones that ultimately get deployed to the relevant live chains. If you want to work on the ColonyNetwork contracts themselves, this should be omitted.
:::

Then, install the required dependencies using `npm`:

```bash
nvm use # alternatively, make sure you are using node version 14.x
npm ci # make sure you are using node version 14.x
```

This will take some time. If you run into issues, see the Troubleshooting section below.

### Provisioning the Token Contracts

The ColonyNetwork uses some Token Artifacts that need to be built first. To do that issue the command

<Tabs>
<TabItem value="docker" label="Using Docker" default>

When using docker the correct version of the `solc` compiler is automatically downloaded and it usually runs faster.

```bash
npm run provision:token:contracts
```
</TabItem>
<TabItem value="nodocker" label="Without Docker">

When not using Docker, we set the `DISABLE_DOCKER` environment variable to `true`.

```bash
DISABLE_DOCKER=true npm run provision:token:contracts
```

</TabItem>
</Tabs>

**Great!** Now you're ready to compile the contracts and run the tests.

### Where to go from here?

You're already able to make modifications to the contracts and run those against the tests. Next step is to [deploy the Colony Network contracts locally](guides/deploying-colony-locally).

## Troubleshooting

### Q: There's a Python error, what's going on?

A: Some ColonyNetwork dependencies require Python in older versions. To get around that, [pyenv](https://github.com/pyenv/pyenv) has been proven very useful. Install pyenv for your environment according to their [guide](https://github.com/pyenv/pyenv#installation), then issue the following command in the `colonyNetwork` directory:

```bash
pyenv install 2.7.18
pyenv local 2.7.18
```

This will create a file called `.python-version` and instruct pyenv to use Python in version `2.7.18`. After that, try running `npm ci` again.

### Q: I'm trying to deploy but it can't connect to the local ganache instance

A: Use NodeJS version 14.x [nvm](https://github.com/nvm-sh/nvm) can help!
