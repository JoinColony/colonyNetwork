DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

BUILD_DIR="${BUILD_DIR:-build}"

test ! -d ./$BUILD_DIR/contracts/ && mkdir -p ./$BUILD_DIR/contracts/

cp lib/colonyToken/build/contracts/PinnedToken.json ./$BUILD_DIR/contracts/Token.json
cp lib/colonyToken/build/contracts/PinnedTokenAuthority.json ./$BUILD_DIR/contracts/TokenAuthority.json
cp lib/colonyToken/build/contracts/PinnedMultiSigWallet.json ./$BUILD_DIR/contracts/MultiSigWallet.json
# Provision the openzeppelin Mintable ERC20 token contract used in integration testing
npx truffle compile --contracts_directory ./node_modules/openzeppelin-solidity/contracts
if  [ $BUILD_DIR != "build" ]
then
  cp ./build/contracts/ERC20PresetMinterPauser.json ./$BUILD_DIR/contracts/ERC20PresetMinterPauser.json
fi