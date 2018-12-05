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
$SED -i "s/000000000000000000000000000000deadbeef01/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef02/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef03/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef04/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef05/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef06/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef07/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef08/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef09/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef10/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef11/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef12/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef13/$(parity --chain ./parity-genesis.json --keys-path ./keys account list | head -n1)/g" ./parity-genesis.json
