---
description: Quick Start for developing the Colony Network Smart contracts
---

# Quick Start

## Prerequisites

You will need:

* [NodeJS](https://nodejs.org/en/) v12.x (use [nvm](https://github.com/nvm-sh/nvm))
* [Yarn](https://yarnpkg.com/) v1.22.x
* [Docker](https://docs.docker.com/get-docker/) (at least v18, **optional**)

The Colony Network contracts are written in [Solidity](https://soliditylang.org/) and are built, tested and deployed using the [Truffle Suite](https://trufflesuite.com/). With the above dependencies in place you can just follow the instructions below and the Colony Network build scripts will sort out everything else for you.

## Cloning the repository and preparing the dependencies

Clone the repository including all its git submodules using this command:

```bash
git clone https://github.com/JoinColony/colonyNetwork.git --recursive
```

{% hint style="info" %}
**Heads up!** Don't forget to add the `--recursive` flag to also clone the git submodules. They are important building blocks for some of the contracts.
{% endhint %}

Change to the `colonyNetwork` directory and check out the latest version tag (find a list of all released versions and their tags [here](https://github.com/JoinColony/colonyNetwork/releases)):

```bash
cd colonyNetwork
git checkout eac730e # replace eac730e with glwss in the future as soon as it's available
```

{% hint style="info" %}
Check out a tagged git release if you want to develop _against_ the ColonyNetwork contracts (like running an RPC node)! Only tagged GitHub releases are known to work under all circumstances and are the ones that ultimately get deployed to the relevant live chains. If you want to work on the ColonyNetwork contracts themselves, this should be omitted.
{% endhint %}

Then, install the required dependencies using `yarn`:

```bash
yarn # make sure you are using node version 12.x
```

This will take some time. If you run into issues, see the Troubleshooting section below.

### Provisioning the Token Contracts

The ColonyNetwork uses some Token Artifacts that need to be built first. To do that issue the command

{% tabs %}
{% tab title="Using Docker" %}
When using docker the correct version of the `solc` compiler is automatically downloaded and it usually runs faster.

```bash
yarn provision:token:contracts
```
{% endtab %}

{% tab title="Without Docker" %}
When not using Docker, we set the `DISABLE_DOCKER` environment variable to `true`.

```bash
DISABLE_DOCKER=true yarn provision:token:contracts
```
{% endtab %}
{% endtabs %}

**Great!** Now you're ready to compile the contracts and run the tests.

## Troubleshooting

### Q: There's a Python error, what's going on?

A: Some ColonyNetwork dependencies require Python in older versions. To get around that, [pyenv](https://github.com/pyenv/pyenv) has been proven very useful. Install pyenv for your environment according to their [guide](https://github.com/pyenv/pyenv#installation), then issue the following command in the `colonyNetwork` directory:&#x20;

```bash
pyenv install 2.7.18
pyenv local 2.7.18
```

This will create a file called `.python-version` and instruct pyenv to use Python in version `2.7.18`. After that, try running `yarn` again.
