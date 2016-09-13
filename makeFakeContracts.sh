cd ./truffle/contracts/
cp ColonyFactory.sol FakeNewColonyFactory.sol
sed -i "" s/'new Colony'/'new FakeUpdatedColony'/g FakeNewColonyFactory.sol
sed -i "" s/'Colony.sol'/'FakeUpdatedColony.sol'/g FakeNewColonyFactory.sol
sed -i "" s/'contract ColonyFactory'/'contract FakeNewColonyFactory'/g FakeNewColonyFactory.sol
sed -i "" s/'Colony(colonyAddress'/'FakeUpdatedColony(colonyAddress'/g FakeNewColonyFactory.sol
sed -i "" s/'Colony colonyNew'/'FakeUpdatedColony colonyNew'/g FakeNewColonyFactory.sol

cp RootColony.sol FakeNewRootColony.sol
sed -i "" s/'contract RootColony'/'contract FakeNewRootColony'/g FakeNewRootColony.sol

cp Colony.sol FakeUpdatedColony.sol
sed -i "" s/'contract Colony'/'contract FakeUpdatedColony'/g FakeUpdatedColony.sol
sed -i "" s/'function Colony'/'function FakeUpdatedColony'/g FakeUpdatedColony.sol
sed -i "" s/'address public eternalStorage;'/'address public eternalStorage;function isUpdated() constant returns(bool) {return true;}'/g FakeUpdatedColony.sol
