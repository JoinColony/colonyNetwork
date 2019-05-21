# Welcome to the Colony Mining visualizers!

## Local Development

To setup, first run: `yarn run viz:bootstrap`

This script will print out a command to spin up a reputation miner; run this command in a new tab.

Finally, navigate to `http://localhost:3000/`.

## Goerli Testnet

To connect a miner to the Goerli testnet, run the following:

`node ./packages/reputation-miner/bin/index.js --network goerli --colonyNetworkAddress 0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B --privateKey {}`
