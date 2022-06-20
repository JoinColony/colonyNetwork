---
title: Reputation Mining Client
section: Docs
order: 5
---

## Running the Mining Client

The reputation mining client can be run locally to sync with a local ganache instance, the `goerli` testnet, or with glider on `mainnet`.

To participate in the reputation mining process you need to have staked at least the [minimum amount of CLNY Tokens](/colonynetwork/interface-ireputationminingcycle#getminstake), for at least [one full mining cycle duration](/colonynetwork/interface-ireputationminingcycle#getminingwindowduration) before you can submit a new reputation root hash.

Usage:
```
node packages/reputation-miner/bin/index.js (--arguments <params>) [--arguments <params>]
```

Mandatory arguments:
```
(--minerAddress <address>) | (--privateKey <key>)
(--colonyNetworkAddress <address>)
(--syncFrom <number>)   // [goerli:'548534', mainnet:'7913100']
```
Optional arguments:
```
[--network <(goerli|mainnet)>]  
[--localPort <number>]
[--dbPath <$PATH>]
[--auto <(true|false)>]
```


#### `--minerAddress`
Address of the miner account which the client will send reputation mining contract transactions from. Used when working with an unlocked account for the miner against **development networks only**. We provision twelve unlocked test accounts stored in `ganache-accounts.json` for testing that are available when starting a local ganache-cli instance via `npm run start:blockchain:client` command.

#### `--privateKey`
Private key of the miner account which the client will sign reputation mining contract transactions with.

#### `--colonyNetworkAddress`
The address of the Colony Network's `EtherRouter`. See [Upgrades to the Colony Network](/colonynetwork/docs-upgrade-design/) for more information about the EtherRouter design pattern. This address is static on `goerli` and `mainnet`
`goerli` `0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B`
`mainnet` `0x5346d0f80e2816fad329f2c140c870ffc3c3e2ef`

#### `--dbPath`
Path for the sqlite database storing reputation state. Default is `./reputationStates.sqlite`.

#### `--network`
Used for connecting to a supported Infura node (instead of a local client). Valid options are `goerli` and `mainnet`.

#### `--localPort`
Used to connect to a local clinet running on the specified port. Default is `8545`.

#### `--syncFrom`
Block number to start reputation state sync from. This is the block at which the reputation mining process was initialised. This number is static on `goerli` and `mainnet`
* `goerli: 548534`
* `mainnet: 7913100`

Note that beginning the sync with a too-early block will result in an error. If you get this exception, try syncing from a more recent block. Note that the sync process can take long. Latest tests syncing a client from scratch to 28 reputation cycles took ~2 hours.

#### `--auto`
Default is `true`

The "auto" reputation mining client will:
* Propose a new hash at the first possible block time, and submit until the maximum number has been reached (based on staked CLNY, with a maximum of 12 submissions allowed)
* Respond to challenges if there are disagreeing submissions.
* Confirm the last hash after the mining window closes and any disputes have been resolved.

Reputation mining protocol details can be found in the [Whitepaper TLDR](/colonynetwork/whitepaper-tldr-reputation-mining#submissions)

## Visualizations

The reputation mining client comes with a set of built-in visualizers to make it easier to view reputation states and to see the current state of the mining process. Once a mining client is running and connected to a network, navigate to the client's address in a browser (i.e. `http://localhost:3000/`) to access the available visualization tools.

### Force Reputation Updates

The client is set to provide a reputation update once every 24 hours. For testing, you'll likely want to "fast-forward" your network through a few submissions to see usable reputation.

You can move the network forward by 24 hours with the following command.

```
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[86400],"id": 1}' localhost:8545
```

Once you have moved the network forward 24 hours, you can then mine a new block with the following command.

```
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_mine","params":[]}' localhost:8545
```

Note that because reputation is awarded for the *previous* submission window, you will need to use the "fast-forward" command above to speed through at least 2 reputation updates before noticing a change in the miner's reputation.

## Get Reputation from the Reputation Oracle

The reputation mining client will answer queries for reputation scores locally over HTTP.

```
http://127.0.0.1:3000/{reputationState}/{colonyAddress}/{skillId}/{userAddress}
```

An instance of the oracle is available for reputation queries against `goerli` or `mainnet` networks:
```
https://colony.io/reputation/{network}/{reputationState}/{colonyAddress}/{skillId}/{userAddress}
```

The oracle should be able to provide responses to any valid reputation score in all historical states, as well as the current state. For querying the colony-wide reputation instead of user-specific one, instead of {userAddress} use a zero address (`0x0000000000000000000000000000000000000000`)

For example, you can get the reputation score of the miner in a reputation state `0xc7eb2cf60aa4848ce0feed5d713c07fd26e404dd50ca3b9e4f2fabef196ca3bc`) using the address of the Meta Colony (`0x14946533cefe742399e9734a123f0c02d0405a51`), the mining skill id (`2`), and address of a miner (`0x0A1d439C7d0b9244035d4F934BBF8A418B35d064`).

```
https://colony.io/reputation/mainnet/0xc7eb2cf60aa4848ce0feed5d713c07fd26e404dd50ca3b9e4f2fabef196ca3bc/0x14946533cefe742399e9734a123f0c02d0405a51/2/0x0A1d439C7d0b9244035d4F934BBF8A418B35d064
```

The oracle returns

```
{"branchMask":"0xc000000000000000000000000000000000000000000000000000000000000000","siblings":["0x15c45d734bccc204df2e275d516250ed0a1cd60ccabadf49e2157a3e8067e59c","0xd4ee79473ec5573d706be030f3077c44aef06f26745349bbd93dcf5f4e254422"],"key":"0x14946533cefe742399e9734a123f0c02d0405a5100000000000000000000000000000000000000000000000000000000000000020a1d439c7d0b9244035d4f934bbf8a418b35d064","value":"0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004","reputation":"0x0000000000000000000000000000000000000000000000000000000000000000","uid":"0x0000000000000000000000000000000000000000000000000000000000000004","reputationAmount":"0"}
```
