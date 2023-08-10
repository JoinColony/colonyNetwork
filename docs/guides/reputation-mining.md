---
description: A guide on how to set up a reputation miner
sidebar_position: 2
---

# Reputation Mining

#### A. Introduction

Colony's reputation system is key to its functionality, and in order to work successfully, with decays being calculated and new reputation being awarded as appropriate, it relies on the reputation 'mining' process. Any user with sufficient CLNY can stake that CLNY to participate in the process. This guide is intended to provide information for a (sufficiently technical) user who wishes to do so.

To participate in the reputation mining process you need to have staked at least the minimum amount of CLNY Tokens (currently 2000 CLNY), for at least one full mining cycle duration (currently 60 minutes) before you can submit a new reputation root hash.

#### B. Awarding appropriate permissions on-chain

1\. Check out our contract repository, following [these instructions](../docs/quick-start.md#cloning-the-repository-and-preparing-the-dependencies). You should then be able to run `yarn run truffle console --network xdai` which will connect you to the right network. You will need to be able to sign messages from the address in control of your CLNY (which will also be the address earning reputation for mining), which in most cases means pasting your private key into `truffle.js` before launching the console. For Ledger support, you can use `yarn run truffle console --network xdaiLedger`. For other hardware wallets, you will need to find an appropriate provider compatible with Truffle, and add it into `truffle.js` in your local version of the repository.\
\
An appropriate gas price for the current level of network use can be found at [https://blockscout.com/xdai/mainnet/](https://blockscout.com/xdai/mainnet/). The default value in `truffle.js` represent 2Gwei.\


2\. Create references to the various contracts that we will need. Run each of these commands in turn:

```javascript
colonyNetwork = await IColonyNetwork.at("0x78163f593D1Fa151B4B7cacD146586aD2b686294" );
clnyToken = await Token.at("0xc9B6218AffE8Aba68a13899Cbf7cF7f14DDd304C");
tokenLockingAddress = await colonyNetwork.getTokenLocking();
tokenLocking = await ITokenLocking.at(tokenLockingAddress);
```

:::info
_Note that all of the following commands, where they represent a transaction being sent on-chain, are documented with `estimateGas`. This is deliberate, and so copying and pasting these instructions should not do anything on chain. Once you are happy with the command, and the call to `estimateGas` does not error, you remove the .`estimateGas` from the command and re-run it to execute it on-chain._
:::

3\. Award the token locking contract the ability to take the CLNY you are intending to stake. The value used in this example is the minimum stake required; you may wish to stake more.

```javascript
// Approve the tokens
clnyToken.approve.estimateGas(tokenLocking.address, "2000000000000000000000");
// Deposit the tokens
tokenLocking.deposit.estimateGas(clnyToken.address, "2000000000000000000000", false); 
// Stake the tokens for mining
colonyNetwork.stakeForMining.estimateGas("2000000000000000000000");
// (Optional) Confirm that the tokens have been staked
await colonyNetwork.getMiningStake(accounts[0]);
[
  '2000000000000000000000',
  '1613397970',
  amount: '2000000000000000000000',
  timestamp: '1613397970'
]
```

4\. Award delegated mining permissions to your 'disposable' address:

```javascript
const miningDelegate = "your-delegate-address"
colonyNetwork.setMiningDelegate.estimateGas(miningDelegate, true)
// To remove delegated mining permissions in the future, run the following
colonyNetwork.setMiningDelegate.estimateGas(miningDelegate, false)
```

:::info
Using two addresses like this is not strictly required, but represents best practices - even if your mining process ended up compromised and the private key accessed, the worst that could be done with it would be to slowly have your stake slashed by misbehaving, which can be prevented by removing the permissions of the disposable address (see below)
:::

Congratulations! You've set up all the necessary permissions to run a miner.

#### C. Setting up the miner

The biggest hurdle to running a reputation miner is syncing it initially. This requires an Xdai archive node. There is a public one available at [`https://xdai-archive.blockscout.com/`](https://xdai-archive.blockscout.com/), which we have successfully used in the past to sync a node from scratch, but can be unreliable for very old historical state. To speed up the syncing process, you can also use a recent snapshot of the reputation state tree ([see below](reputation-mining.md#snapshot)), but this doesn't remove the requirement for an archive node (for more recent historical state).

Strictly speaking, once synced, an archive node is not required. However, should you fall behind (due to the miner not running for some reason), then you will need access to an archive mode to resume.&#x20;

The most reliable way to run the miner is by using docker via the image provided by us, but you can also run it directly from a checked-out copy of our repository (which you already have, if you've completed the previous section).

Regardless of which you use, you will need the private key you wish mining transactions to be signed from. Putting the private key in an environment variable is recommended for security purposes - in the below examples, it could be placed in the appropriate variable with `export PRIVATE_KEY=0xdeadbeef00000000000000000deadbeef000000000000000000000000000dead`

<Tabs>
<TabItem value="docker" label="Using Docker" default>
`docker run -it --env ARGS="--providerAddress https://xdai-archive.blockscout.com/" --env COLONYNETWORK_ADDRESS=0x78163f593D1Fa151B4B7cacD146586aD2b686294 --env SYNC_FROM_BLOCK="11897848" --env REPUTATION_JSON_PATH=/root/datadir/reputations.sqlite --env PRIVATE_KEY=$PRIVATE_KEY -v $(pwd):/root/datadir joincolony/reputation-miner:latest`
</TabItem>

<TabItem value="repository" label="From repository" default>
`node ./packages/reputation-miner/bin/index.js --providerAddress https://xdai-archive.blockscout.com --colonyNetworkAddress 0x78163f593D1Fa151B4B7cacD146586aD2b686294 --syncFrom 11897847 --privateKey $PRIVATE_KEY --dbPath ./reputations.sqlite`
</TabItem>
</Tabs>

The docker image will create files in the directory you run this command from; you can alter the `-v` argument to change this behaviour.

#### D. Getting a recent snapshot <a href="#snapshot" id="snapshot"></a>

A recent snapshot, which should be from the last day or so, is available at [https://xdai.colony.io/reputation/xdai/latestState](https://xdai.colony.io/reputation/xdai/latestState).\
\
After downloading, place it whichever directory you are running the reputation miner from, and rename it to `reputations.sqlite` (if you are using the commands above). Upon start, the miner will load this snapshot, and sync from there.

#### E. Rewards

At the current time, there are no rewards for reputation mining, but this should change in the coming weeks.
