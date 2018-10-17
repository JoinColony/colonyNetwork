DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

cp lib/colonyToken/contracts/Token.sol ./contracts/Token.sol
cp lib/colonyToken/contracts/TokenAuthority.sol ./contracts/TokenAuthority.sol