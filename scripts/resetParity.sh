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
$SED -i "s/wwwww/$(parity --keys-path ./keys --password ./parityPassword account new)/g" ./parity-genesis.json
$SED -i "s/xxxxx/$(parity --keys-path ./keys --password ./parityPassword account new)/g" ./parity-genesis.json
$SED -i "s/yyyyy/$(parity --keys-path ./keys --password ./parityPassword account new)/g" ./parity-genesis.json
$SED -i "s/zzzzz/$(parity --keys-path ./keys --password ./parityPassword account new)/g" ./parity-genesis.json