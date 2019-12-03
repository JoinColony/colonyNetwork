DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

test ! -d ./build/contracts/ && mkdir -p ./build/contracts/

cp lib/tabookey-gasless/build/contracts/RelayHub.json ./build/contracts/RelayHub.json
