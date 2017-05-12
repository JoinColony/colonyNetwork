cd ./contracts

COLONY_VERSION=$(grep 'uint256 public version = ' ./Colony.sol | sed 's/.*version = //' | sed 's/;//')
cd ../build/contracts
echo "Current Colony contract version is '$COLONY_VERSION'."
mv ./Colony.sol.js ./Colony_$COLONY_VERSION.sol.js
echo "Colony contract json renamed to ./Colony_$COLONY_VERSION.sol.js."
