#!/bin/bash

let "VERSION = 5"
let "UPDATED_VERSION = 1001"
cp ./contracts/Token.sol ./contracts/UpdatedToken.sol
sed -i.bak "s/Token/UpdatedToken/g" ./contracts/UpdatedToken.sol
sed -i.bak "s/function mint/function isUpdated() public pure returns(bool) {return true;} function mint/g" ./contracts/UpdatedToken.sol
cp ./contracts/Resolver.sol ./contracts/UpdatedResolver.sol
sed -i.bak "s/Resolver/UpdatedResolver/g" ./contracts/UpdatedResolver.sol
sed -i.bak "s/function stringToSig/function isUpdated() public pure returns(bool) {return true;} function stringToSig/g" ./contracts/UpdatedResolver.sol
cp ./contracts/Colony.sol ./contracts/UpdatedColony.sol
cp ./contracts/IColony.sol ./contracts/IUpdatedColony.sol
cp ./contracts/ColonyNetwork.sol ./contracts/UpdatedColonyNetwork.sol
sed -i.bak "s/contract ColonyNetwork/contract UpdatedColonyNetwork/g" ./contracts/UpdatedColonyNetwork.sol
sed -i.bak "s/address resolver;/address resolver;function isUpdated() public pure returns(bool) {return true;}/g" ./contracts/UpdatedColonyNetwork.sol
sed -i.bak "s/contract Colony/contract UpdatedColony/g" ./contracts/UpdatedColony.sol
sed -i.bak "s/function version() public pure returns (uint256) { return ${VERSION}/function version() public pure returns (uint256) { return ${UPDATED_VERSION}/g" ./contracts/UpdatedColony.sol
sed -i.bak "s/contract UpdatedColony is ColonyStorage {/contract UpdatedColony is ColonyStorage {function isUpdated() public pure returns(bool) {return true;}/g" ./contracts/UpdatedColony.sol
sed -i.bak "s/contract IColony/contract IUpdatedColony/g" ./contracts/IUpdatedColony.sol
sed -i.bak "s/contract IUpdatedColony {/contract IUpdatedColony {function isUpdated() public pure returns(bool);/g" ./contracts/IUpdatedColony.sol