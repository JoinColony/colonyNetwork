#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

CHAIN_ID=${CHAIN_ID:-265669100}
PORT=${PORT:-8545}

# Get the choice of client: hardhat is default
if [ "$1" == "parity" ]; then
  bc_client=$1
else
  bc_client="hardhat"
fi

echo "Chosen client $bc_client"

bc_client_port=$PORT

bc_client_running() {
  nc -z localhost "$bc_client_port"
}

start_hardhat() {
  CHAIN_ID=$CHAIN_ID npx hardhat node --port $PORT >/dev/null 2>&1 \
  & bash -c 'until nc -z $0 $1; do sleep 1; done' 127.0.0.1 $PORT
}

start_parity() {
  mapfile -t addresses < <( parity --keys-path ./keys account list --chain ./parity-genesis.json)
  if [ ${#addresses[@]} -eq 0 ]; then
    echo "No parity addresses found. Did you initialise it correctly?"
    exit 1;
  else
    parity --chain ./parity-genesis.json --author ${addresses[0]} \
    --unlock ${addresses[0]},${addresses[1]},${addresses[2]},${addresses[3]},${addresses[4]},${addresses[5]},${addresses[6]},${addresses[7]},${addresses[8]},${addresses[9]},${addresses[10]},${addresses[11]},${addresses[12]},${addresses[13]},${addresses[14]},${addresses[15]},${addresses[16]},${addresses[17]} \
    --keys-path ./keys --geth --tx-gas-limit 0x6691B7 --gas-floor-target 0x6691B7 \
    --reseal-on-txs all --reseal-min-period 0 \
    --jsonrpc-interface all --jsonrpc-hosts all --jsonrpc-cors="http://localhost:3000" \
    --password ./parityPassword >/dev/null 2>&1
  fi
}

if bc_client_running; then
  echo "Using existing bc client instance at port $bc_client_port"
else
  echo "Starting our own $bc_client client instance at port $bc_client_port"
  if [ "$bc_client" == "parity" ]; then
    start_parity
  else
    start_hardhat
  fi
fi

echo "Client initialised!"
