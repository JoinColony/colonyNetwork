#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Start second instance of ganache

export CHAIN_ID=2656692
export PORT=8546
export DBPATH=./ganache-chain-db-2

yarn start:blockchain:client &

while ! nc -z 127.0.0.1 $PORT; do
  sleep 0.1 # wait for 1/10 of the second before check again
done
# Deploy safe contracts to second instance of ganache

cd ./lib/safe-contracts
# This is the private key for the first account we create on ganache, so has ether to pay for gas fees
PK="0x0355596cdb5e5242ad082c4fe3f8bbe48c9dba843fe1f99dd8272f487e70efae" NODE_URL=http://127.0.0.1:8546 yarn hardhat --network custom deploy

# Should have deployed GnosisSafeProxyFactory at 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2