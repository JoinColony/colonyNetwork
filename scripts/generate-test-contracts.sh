#!/bin/bash

version="$(grep 'function version() public pure returns (uint256 colonyVersion) { return ' ./contracts/colony/Colony.sol | sed 's/function version() public pure returns (uint256 colonyVersion) { return //' | sed 's/; }//' | sed 's/ //g')"
echo "Current Colony contract version is $version"
updated_version=$(($version + 1))
echo "Updating version to $updated_version"

cp ./contracts/common/Resolver.sol ./contracts/common/UpdatedResolver.sol
sed -i.bak "s/Resolver/UpdatedResolver/g" ./contracts/common/UpdatedResolver.sol
sed -i.bak "s/function stringToSig/function isUpdated() public pure returns(bool) {return true;} function stringToSig/g" ./contracts/common/UpdatedResolver.sol
cp ./contracts/colony/Colony.sol ./contracts/colony/UpdatedColony.sol
cp ./contracts/colony/ColonyDataTypes.sol ./contracts/colony/UpdatedColonyDataTypes.sol
cp ./contracts/colony/ColonyStorage.sol ./contracts/colony/UpdatedColonyStorage.sol
cp ./contracts/colony/IColony.sol ./contracts/colony/IUpdatedColony.sol
cp ./contracts/colonyNetwork/ColonyNetwork.sol ./contracts/colonyNetwork/UpdatedColonyNetwork.sol
cp ./contracts/reputationMiningCycle/ReputationMiningCycle.sol ./contracts/reputationMiningCycle/UpdatedReputationMiningCycle.sol
cp ./contracts/reputationMiningCycle/IReputationMiningCycle.sol ./contracts/reputationMiningCycle/IUpdatedReputationMiningCycle.sol
# Modify UpdatedColonyNetwork contract
sed -i.bak "s/contract ColonyNetwork/contract UpdatedColonyNetwork/g" ./contracts/colonyNetwork/UpdatedColonyNetwork.sol
sed -i.bak "s/address resolver;/address resolver;function isUpdated() public pure returns(bool) {return true;}/g" ./contracts/colonyNetwork/UpdatedColonyNetwork.sol
# Modify UpdatedColony contract
sed -i.bak "s/contract Colony/contract UpdatedColony/g" ./contracts/colony/UpdatedColony.sol
sed -i.bak "s/ColonyStorage/UpdatedColonyStorage/g" ./contracts/colony/UpdatedColony.sol
sed -i.bak "s/function version() public pure returns (uint256 colonyVersion) { return ${version}/function version() public pure returns (uint256 colonyVersion) { return ${updated_version}/g" ./contracts/colony/UpdatedColony.sol
sed -i.bak "s/contract UpdatedColony is BasicMetaTransaction, UpdatedColonyStorage, PatriciaTreeProofs {/contract UpdatedColony is BasicMetaTransaction, UpdatedColonyStorage, PatriciaTreeProofs {function isUpdated() external pure returns(bool) {return true;}/g" ./contracts/colony/UpdatedColony.sol
# Modify UpdatedColonyDataTypes contract
sed -i.bak "s/ColonyDataTypes/UpdatedColonyDataTypes/g" ./contracts/colony/UpdatedColonyDataTypes.sol
sed -i.bak "s/mapping (uint8 => mapping (address => uint256)) payouts;/mapping (uint8 => mapping (address => uint256)) payouts; uint256 x;/g" ./contracts/colony/UpdatedColonyDataTypes.sol
# Modify UpdatedColonyStorage contract
sed -i.bak "s/ColonyStorage/UpdatedColonyStorage/g" ./contracts/colony/UpdatedColonyStorage.sol
sed -i.bak "s/ColonyDataTypes/UpdatedColonyDataTypes/g" ./contracts/colony/UpdatedColonyStorage.sol
# Modify IUpdatedColony contract
sed -i.bak "s/interface IColony/interface IUpdatedColony/g" ./contracts/colony/IUpdatedColony.sol
sed -i.bak "s/ColonyDataTypes/UpdatedColonyDataTypes/g" ./contracts/colony/IUpdatedColony.sol
sed -i.bak "s/interface IUpdatedColony is UpdatedColonyDataTypes, IRecovery, IBasicMetaTransaction {/interface IUpdatedColony is UpdatedColonyDataTypes, IRecovery, IBasicMetaTransaction {function isUpdated() external pure returns(bool);/g" ./contracts/colony/IUpdatedColony.sol
# Modify UpdatedReputationMiningCycle contract
sed -i.bak "s/contract ReputationMiningCycle/contract UpdatedReputationMiningCycle/g" ./contracts/reputationMiningCycle/UpdatedReputationMiningCycle.sol
sed -i.bak "s| is ReputationMiningCycleCommon {| is ReputationMiningCycleCommon {\nfunction isUpdated() public pure returns(bool) {return true;}|g" ./contracts/reputationMiningCycle/UpdatedReputationMiningCycle.sol
# Modify IReputationMiningCycle contract
sed -i.bak "s/interface IReputationMiningCycle/interface IUpdatedReputationMiningCycle/g" ./contracts/reputationMiningCycle/IUpdatedReputationMiningCycle.sol
sed -i.bak "s/function resetWindow() public;/function resetWindow() public; function isUpdated() public pure returns(bool);/g" ./contracts/reputationMiningCycle/IUpdatedReputationMiningCycle.sol
# Modify VotingReputationMisaligned to have the correct version

votingVersion="$(grep 'return [0-9]*;' ./contracts/extensions/VotingReputation/VotingReputation.sol | sed 's/    return //' | sed 's/;//')"
echo "Current Voting contract version is $votingVersion"
previous_version=$(($votingVersion - 1))
echo "Updating test contract to $previous_version"
sed -i.bak "s/return 4/return $previous_version/g" ./contracts/testHelpers/VotingReputationMisaligned.sol
