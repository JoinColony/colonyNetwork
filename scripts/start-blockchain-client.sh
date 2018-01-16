#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Get the choice of client: ganache-cli is default
if [ "$1" == "parity" ]; then
  bc_client=$1
else 
  bc_client="ganache-cli"
fi

echo "Chosen client $bc_client"

bc_client_port=8545

bc_client_running() {
  nc -z localhost "$bc_client_port"
}

start_ganache() {
  node_modules/.bin/ganache-cli --acctKeys="./test-accounts.json" \
    --account="0x0355596cdb5e5242ad082c4fe3f8bbe48c9dba843fe1f99dd8272f487e70efae, 100000000000000000000" \
    --account="0xe9aebe8791ad1ebd33211687e9c53f13fe8cca53b271a6529c7d7ba05eda5ce2, 100000000000000000000" \
    --account="0x6f36842c663f5afc0ef3ac986ec62af9d09caa1bbf59a50cdb7334c9cc880e65, 100000000000000000000" \
    --account="0xf184b7741073fc5983df87815e66425928fa5da317ef18ef23456241019bd9c7, 100000000000000000000" \
    --account="0x7770023bfebe3c8e832b98d6c0874f75580730baba76d7ec05f2780444cc7ed3, 100000000000000000000" \
    --account="0xa9442c0092fe38933fcf2319d5cf9fd58e3be5409a26e2045929f9d2a16fb090, 100000000000000000000" \
    --account="0x06af2c8000ab1b096f2ee31539b1e8f3783236eba5284808c2b17cfb49f0f538, 100000000000000000000" \
    --account="0x7edaec9e5f8088a10b74c1d86108ce879dccded88fa9d4a5e617353d2a88e629, 100000000000000000000" \
    --account="0xe31c452e0631f67a629e88790d3119ea9505fae758b54976d2bf12bd8300ef4a, 100000000000000000000" \
    --account="0x5e383d2f98ac821c555333e5bb6109ca41ae89d613cb84887a2bdb933623c4e3, 100000000000000000000" \
    --account="0x33d2f6f6cc410c1d46d58f17efdd2b53a71527b27eaa7f2edcade351feb87425, 100000000000000000000" \
    --account="0x32400a48ff16119c134eef44e2627502ce6e367bc4810be07642275a9db47bf7, 100000000000000000000" >/dev/null 2>&1
}

start_parity() {
  mapfile -t addresses < <( parity --keys-path ./keys account list )
  if [ ${#addresses[@]} -eq 0 ]; then
    echo "No parity addresses found. Did you initialise it correctly?"
    exit 1;
  else
    parity --chain ./parity-genesis.json \
    --author ${addresses[0]} \
    --unlock ${addresses[0]},${addresses[1]},${addresses[2]},${addresses[3]} \
    --keys-path ./keys --geth --no-dapps \
    --tx-gas-limit 0x47E7C4 --gasprice 0x0 --gas-floor-target 0x47E7C4 \
    --reseal-on-txs all --reseal-min-period 0 \
    --jsonrpc-interface all --jsonrpc-hosts all --jsonrpc-cors="http://localhost:3000" \
    --password ./parityPassword >/dev/null 2>&1
  fi
}

if bc_client_running; then
  echo "Using existing bc client instance at port $bc_client_port"
  # todo: kill process
else
  echo "Starting our own $bc_client client instance at port $bc_client_port"
  if [ "$bc_client" == "parity" ]; then
    start_parity
  else 
    start_ganache
  fi
fi