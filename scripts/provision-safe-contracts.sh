DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $DIR
cd ..

BUILD_DIR="${BUILD_DIR:-build}"

if [[ "$BUILD_DIR" == "build" ]]; then
	echo "No further provisioning needed"
	exit 0
fi

cp ./build/contracts/Gnosis*.json ./$BUILD_DIR/contracts/