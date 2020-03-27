#!/bin/bash

version="$(grep 'function version() public pure returns (uint256 colonyVersion) { return ' ./contracts/colony/Colony.sol | sed 's/function version() public pure returns (uint256 colonyVersion) { return //' | sed 's/; }//' | sed 's/ //g')"
echo "Current Colony contract version is $version"
updated_version=$(($version + 1))
echo "Updating version to $updated_version"

cp ./contracts/common/Resolver.sol ./contracts/UpdatedResolver.sol
sed -i.bak "s/Resolver/UpdatedResolver/g" ./contracts/UpdatedResolver.sol
sed -i.bak "s/function stringToSig/function isUpdated() public pure returns(bool) {return true;} function stringToSig/g" ./contracts/UpdatedResolver.sol
cp ./contracts/colony/Colony.sol ./contracts/UpdatedColony.sol
cp ./contracts/colony/ColonyDataTypes.sol ./contracts/UpdatedColonyDataTypes.sol
cp ./contracts/colony/ColonyStorage.sol ./contracts/UpdatedColonyStorage.sol
cp ./contracts/colony/IColony.sol ./contracts/IUpdatedColony.sol
cp ./contracts/colonyNetwork/ColonyNetwork.sol ./contracts/UpdatedColonyNetwork.sol
cp ./contracts/reputationMiningCycle/ReputationMiningCycle.sol ./contracts/UpdatedReputationMiningCycle.sol
cp ./contracts/reputationMiningCycle/IReputationMiningCycle.sol ./contracts/IUpdatedReputationMiningCycle.sol
# Modify UpdatedColonyNetwork contract
sed -i.bak "s/contract ColonyNetwork/contract UpdatedColonyNetwork/g" ./contracts/UpdatedColonyNetwork.sol
sed -i.bak "s/address resolver;/address resolver;function isUpdated() public pure returns(bool) {return true;}/g" ./contracts/UpdatedColonyNetwork.sol
# Modify UpdatedColony contract
sed -i.bak "s/contract Colony/contract UpdatedColony/g" ./contracts/UpdatedColony.sol
sed -i.bak "s/ColonyStorage/UpdatedColonyStorage/g" ./contracts/UpdatedColony.sol
sed -i.bak "s/function version() public pure returns (uint256 colonyVersion) { return ${version}/function version() public pure returns (uint256 colonyVersion) { return ${updated_version}/g" ./contracts/UpdatedColony.sol
sed -i.bak "s/contract UpdatedColony is UpdatedColonyStorage, PatriciaTreeProofs {/contract UpdatedColony is UpdatedColonyStorage, PatriciaTreeProofs {function isUpdated() public pure returns(bool) {return true;}/g" ./contracts/UpdatedColony.sol
# Modify UpdatedColonyDataTypes contract
sed -i.bak "s/ColonyDataTypes/UpdatedColonyDataTypes/g" ./contracts/UpdatedColonyDataTypes.sol
sed -i.bak "s/mapping (uint8 => mapping (address => uint256)) payouts;/mapping (uint8 => mapping (address => uint256)) payouts; uint256 x;/g" ./contracts/UpdatedColonyDataTypes.sol
# Modify UpdatedColonyStorage contract
sed -i.bak "s/ColonyStorage/UpdatedColonyStorage/g" ./contracts/UpdatedColonyStorage.sol
sed -i.bak "s/ColonyDataTypes/UpdatedColonyDataTypes/g" ./contracts/UpdatedColonyStorage.sol
# Modify IUpdatedColony contract
sed -i.bak "s/contract IColony/contract IUpdatedColony/g" ./contracts/IUpdatedColony.sol
sed -i.bak "s/ColonyDataTypes/UpdatedColonyDataTypes/g" ./contracts/IUpdatedColony.sol
sed -i.bak "s/contract IUpdatedColony is UpdatedColonyDataTypes, IRecovery {/contract IUpdatedColony is UpdatedColonyDataTypes, IRecovery {function isUpdated() public pure returns(bool);/g" ./contracts/IUpdatedColony.sol
# Modify UpdatedReputationMiningCycle contract
sed -i.bak "s/contract ReputationMiningCycle/contract UpdatedReputationMiningCycle/g" ./contracts/UpdatedReputationMiningCycle.sol
sed -i.bak "s/WAD;/WAD;function isUpdated() public pure returns(bool) {return true;}/g" ./contracts/UpdatedReputationMiningCycle.sol
# Modify IReputationMiningCycle contract
sed -i.bak "s/contract IReputationMiningCycle/contract IUpdatedReputationMiningCycle/g" ./contracts/IUpdatedReputationMiningCycle.sol
sed -i.bak "s/function resetWindow() public;/function resetWindow() public; function isUpdated() public pure returns(bool);/g" ./contracts/IUpdatedReputationMiningCycle.sol
