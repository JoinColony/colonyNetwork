DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

test ! -d ./build/contracts/ && mkdir -p ./build/contracts/

cp lib/colonyToken/build/contracts/Token.json ./build/contracts/Token.json
cp lib/colonyToken/build/contracts/TokenAuthority.json ./build/contracts/TokenAuthority.json
cp lib/colonyToken/build/contracts/MultiSigWallet.json ./build/contracts/MultiSigWallet.json