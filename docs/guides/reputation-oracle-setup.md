---
description: How to set up the Reputation Miner for local development
---

# Reputation Oracle Setup

If you'd like to run the reputation oracle locally (for development purposes or to try some of the examples in ColonySDK), please follow this guide.

## Deploy Colony locally

First we need to deploy the Colony Network contracts locally. Please follow [this guide](deploying-colony-locally.md) to the end to do that first.

{% hint style="info" %}
After successful deployment, leave the Ganache development server running. The Reputation Oracle makes heavy use of it and the contracts that are deployed on our local chain!
{% endhint %}

## Starting the Reputation Oracle

The Reputation Oracle sets up an HTTP API that provides information about reputation states in Colonies.

{% hint style="info" %}
Make sure you're on a recent version of the `colonyNetwork`, git hash `eac730e` should work or, in the future the git tag `glwss`.
{% endhint %}

To start the oracle, go to the `colonyNetwork` directory and run this command:

```bash
yarn start:reputation:oracle
```

Wait for it to say

```
⭐️ Reputation oracle running on port 3000
```

then you're all set up and ready to interact with the Reputation Oracle.
