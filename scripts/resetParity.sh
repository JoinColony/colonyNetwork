DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

if [ ! -e "./parityPassword" ]
then
  echo "password" > ./parityPassword
fi

rm -rf ./keys
rm -rf ./parity-genesis.json
mkdir ./keys

cp ./parity-genesis.template.json ./parity-genesis.json
# We need to use gsed if it exists (i.e if we're on OSX)
# for cross-platform compatability.
if hash gsed 2>/dev/null; then
  SED='gsed'
else
  SED='sed'
fi
$SED -i "s/0000000000000000000000000000000deadbeef1/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/0000000000000000000000000000000deadbeef2/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/0000000000000000000000000000000deadbeef3/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/0000000000000000000000000000000deadbeef4/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/0000000000000000000000000000000deadbeef5/$(parity --chain ./parity-genesis.json --keys-path ./keys account list | head -n1)/g" ./parity-genesis.json
