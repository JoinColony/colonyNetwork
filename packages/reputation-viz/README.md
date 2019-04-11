# Welcome to the Colony Mining visualizers!

## Reputation Mining Cycle visualizer:

In three tabs:

1. `yarn run viz:setup`
2. `./node_modules/trufflepig/bin/trufflepig.js`
3. `cd packages/reputation-viz/; python -m SimpleHTTPServer`

And navigate to `http://localhost:8000/repCycle.html`

## Reputation Tree visualizer:

In two tabs:

1. `yarn run viz:setup`, note the addresses printed to the console at the end
2. `node ./packages/reputation-miner/bin/index.js --colonyNetworkAddress {} --minerAddress {}`
