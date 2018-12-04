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
$SED -i "s/000000000000000000000000000000deadbeef10/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef11/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef12/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef13/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef14/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef15/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef16/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef17/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef18/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef19/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef20/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef21/$(parity account new --chain ./parity-genesis.json --keys-path ./keys --password ./parityPassword)/g" ./parity-genesis.json
$SED -i "s/000000000000000000000000000000deadbeef22/$(parity --chain ./parity-genesis.json --keys-path ./keys account list | head -n1)/g" ./parity-genesis.json
