DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

test ! -d ./build/contracts/ && mkdir -p ./build/contracts/

cp lib/colonyToken/build/contracts/PinnedToken.json ./build/contracts/Token.json
cp lib/colonyToken/build/contracts/PinnedTokenAuthority.json ./build/contracts/TokenAuthority.json
cp lib/colonyToken/build/contracts/PinnedMultiSigWallet.json ./build/contracts/MultiSigWallet.json
# Provision the openzeppelin Mintable ERC20 token contract used in integration testing
cp node_modules/openzeppelin-solidity/build/contracts/ERC20PresetMinterPauser.json ./build/contracts/ERC20PresetMinterPauser.json
