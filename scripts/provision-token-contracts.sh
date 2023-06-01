DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

BUILD_DIR="${BUILD_DIR:-build}"

test ! -d ./$BUILD_DIR/contracts/ && mkdir -p ./$BUILD_DIR/contracts/

cp lib/colonyToken/build/contracts/PinnedToken.json ./$BUILD_DIR/contracts/Token.json
cp lib/colonyToken/build/contracts/PinnedTokenAuthority.json ./$BUILD_DIR/contracts/TokenAuthority.json
cp lib/colonyToken/build/contracts/PinnedMultiSigWallet.json ./$BUILD_DIR/contracts/MultiSigWallet.json
