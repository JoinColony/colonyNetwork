LATEST_RELEASE=`curl --silent "https://api.github.com/repos/joinColony/colonyNetwork/releases/latest" | grep -Po '"tag_name": "\K.*?(?=")'`

CURRENT_BRANCH=`git branch --show-current`

# Get release

git checkout $LATEST_RELEASE

# Compile release
npm ci --force && npx truffle compile
rm -rf build-$LATEST_RELEASE || true
mv build build-$LATEST_RELEASE

# Compile current commit
git checkout $CURRENT_BRANCH
find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +
npm ci && npx truffle compile

version_from_commit() {
	COMMIT=$1;
	FILE=$2;
	VERSION="$(git show $COMMIT:$FILE | grep 'function version() public pure returns (uint256 colonyVersion) { return ' | sed 's/function version() public pure returns (uint256 colonyVersion) { return //' | sed 's/; }//' | sed 's/ //g')"
	echo $VERSION
}

version_from_commit_extensions() {
	COMMIT=$1;
	FILE=$2;

	git show $COMMIT:$FILE > /dev/null 2>&1
	if [ $? -ne 0 ]; then
	  # the file does not exist at that commit
	  echo -1;
	  return;
	fi

	VERSION="$(git show $COMMIT:$FILE | grep -A1 'function version() public' | tail -n 1 | sed 's/return //g' | sed 's/;//g' )"
	echo $VERSION
}

relevant_bytecode() {
	FILE=$1
	# Deployed bytecode vs bytecode to avoid issues with contracts that have
	# a constructor, but none of our versioned contracts do, so I think
	# this is okay?
	BYTECODE=`cat $FILE | jq -r '.deployedBytecode'`
	if [ "$BYTECODE" == "0x" ]; then
		echo "0x"
		return
	fi
	# For the bytecode, discard the metadata hash (and anything else) that
	# the compiler has appended.
	# https://docs.soliditylang.org/en/v0.8.13/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode
	# Get the last two bytes
	LENGTH=${BYTECODE: -4}
	# That's the length in bytes of this end section, not including itself
	# So convert that to decimal, double it, and that the number of characters to trim off th eend
	LENGTH=$((16#$LENGTH))
	BYTECODE=${BYTECODE::-$(( LENGTH*2 +4 ))}
	echo $BYTECODE
}

compare_bytecodes_check_version() {
	CONTRACT_NAME=`basename $1 .sol`
	FILE_WITH_VERSION=$2

	LAST_RELEASE_FILE="build-$LATEST_RELEASE/contracts/$CONTRACT_NAME.json"
	THIS_COMMIT_FILE="build/contracts/$CONTRACT_NAME.json"

	if [ ! -f "$LAST_RELEASE_FILE" ]; then
	    echo "$LAST_RELEASE_FILE does not exist in last release, skipping."
	    return
	fi

	LAST_RELEASE_BYTECODE=$(relevant_bytecode ./build-$LATEST_RELEASE/contracts/$CONTRACT_NAME.json)

	NEW_BYTECODE=$(relevant_bytecode ./build/contracts/$CONTRACT_NAME.json)

	# If the bytecode is different, check the version in the appropriate file
	if [ "$LAST_RELEASE_BYTECODE" != "$NEW_BYTECODE" ]; then
		oldVersion="$(version_from_commit_extensions $LATEST_RELEASE $FILE_WITH_VERSION)"

		# What version does the staged version have?
		newVersion="$(version_from_commit_extensions '' $FILE_WITH_VERSION)"
		if [ $oldVersion -eq -1 ]; then
			# It didn't exist in the old commit, so allow without further comparison
			echo "Skipping $CONTRACT_NAME as $2 doesn't exist in latest release. If it's been moved, check if version bump necessary manually"
		elif [ $newVersion -eq $oldVersion ]; then
			echo "Version not bumped for $FILE_WITH_VERSION when it should be"
			STATUS=1;
		fi
	fi
}

check_and_dependencies() {
	local BASE_CONTRACT_NAME=`basename $1 .sol`
	local FILE_WITH_VERSION=$2
	compare_bytecodes_check_version $BASE_CONTRACT_NAME $FILE_WITH_VERSION
	# Anything that relies on that file
	for extensionFile in $(grep -ilr "^contract.* is .*$BASE_CONTRACT_NAME[, {]" ./contracts/extensions/)
	do
		check_and_dependencies $extensionFile $extensionFile
	done
}

# Are there changes in the colony contract that need colony version bumped?
# Get the names of the colony contracts that changed
for file in contracts/colony/*
do
	CONTRACT_NAME=`basename $file .sol`
	LAST_RELEASE_BYTECODE=$(relevant_bytecode ./build-$LATEST_RELEASE/contracts/$CONTRACT_NAME.json)
	NEW_BYTECODE=$(relevant_bytecode ./build/contracts/$CONTRACT_NAME.json)

	# If the bytecode is different, check the version in colony
	if [ "$LAST_RELEASE_BYTECODE" != "$NEW_BYTECODE" ]; then
		oldVersion="$(version_from_commit $LATEST_RELEASE 'contracts/colony/Colony.sol')"

		# What version does the staged version have?
		newVersion="$(version_from_commit '' 'contracts/colony/Colony.sol')"

		if [ $newVersion -eq $oldVersion ]; then
			echo "Version not bumped for Colony.sol when it should be"
			STATUS=1;
		fi
	fi


done

# Now the same for the extensions
for file in contracts/extensions/*
do
	# Skip directories
	if [ ! -d "$file" ]; then
		if [ $file = "contracts/extensions/votingReputation/VotingReputation*.sol" ]; then
			check_and_dependencies $file contracts/extensions/votingReputation/VotingReputation.sol
		else
			check_and_dependencies $file $file
		fi
	fi
done

exit $STATUS
