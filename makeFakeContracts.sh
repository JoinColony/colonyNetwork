cd ./contracts/
cp ColonyFactory.sol FakeNewColonyFactory.sol
sed -ie'' s/'new Colony'/'new FakeUpdatedColony'/g FakeNewColonyFactory.sol
sed -ie'' s/'Colony.sol'/'FakeUpdatedColony.sol'/g FakeNewColonyFactory.sol
sed -ie'' s/'contract ColonyFactory'/'contract FakeNewColonyFactory'/g FakeNewColonyFactory.sol
sed -ie'' s/'Colony(colonyAddress'/'FakeUpdatedColony(colonyAddress'/g FakeNewColonyFactory.sol
sed -ie'' s/'Colony colonyNew'/'FakeUpdatedColony colonyNew'/g FakeNewColonyFactory.sol

cp RootColony.sol FakeNewRootColony.sol
sed -ie'' s/'contract RootColony'/'contract FakeNewRootColony'/g FakeNewRootColony.sol

cp Colony.sol FakeUpdatedColony.sol
sed -ie'' s/'contract Colony'/'contract FakeUpdatedColony'/g FakeUpdatedColony.sol
sed -ie'' s/'function Colony'/'function FakeUpdatedColony'/g FakeUpdatedColony.sol
COLONY_VERSION=$(grep 'uint256 public version = ' ./Colony.sol | sed 's/.*version = //' | sed 's/;//')
UPDATED_COLONY_VERSION=$(($COLONY_VERSION+1))
echo "Making Fake updated Colony contract with incremented version '$UPDATED_COLONY_VERSION'."
sed -ie"" "s/uint256 public version = $COLONY_VERSION"/"uint256 public version = $UPDATED_COLONY_VERSION"/g FakeUpdatedColony.sol
sed -ie'' s/'address public eternalStorage;'/'address public eternalStorage;function isUpdated() constant returns(bool) {return true;}'/g FakeUpdatedColony.sol
