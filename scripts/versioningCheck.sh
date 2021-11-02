LATEST_RELEASE=`curl --silent "https://api.github.com/repos/joinColony/colonyNetwork/releases/latest" | grep -Po '"tag_name": "\K.*?(?=")'`

# Are there changes in the colony contract?
N=`git diff --cached --name-only $LATEST_RELEASE contracts/colony/ | wc -l`

version_from_commit() {
	COMMIT=$1;
	FILE=$2;
	VERSION="$(git show $COMMIT:$FILE | grep 'function version() public pure returns (uint256 colonyVersion) { return ' | sed 's/function version() public pure returns (uint256 colonyVersion) { return //' | sed 's/; }//' | sed 's/ //g')"
	echo $VERSION
}

version_from_commit_extensions() {
	COMMIT=$1;
	FILE=$2;
	VERSION="$(git show $COMMIT:$FILE | grep -A1 'function version() public' | tail -n 1 | sed 's/return //g' | sed 's/;//g' )"
	echo $VERSION
}

STATUS=0

if [ $N -ne 0 ]; then
	# We need to check if we've bumped the version
	# What version does the latest release have
	oldVersion="$(version_from_commit $LATEST_RELEASE 'contracts/colony/Colony.sol')"

	# What version does the staged version have?
	newVersion="$(version_from_commit '' 'contracts/colony/Colony.sol')"

	if [ $newVersion -eq $oldVersion ]; then
		echo "Version not bumped for Colony.sol when it should be"
		STATUS=1;
	fi
fi

# Now the same for the extensions
for file in $(git diff --cached --name-only $LATEST_RELEASE | grep -E 'contracts/extensions/')
do
	if [ $file = "contracts/extensions/ColonyExtension.sol" ]; then
		continue
	fi

	if [ $file = "contracts/extensions/ColonyExtensionMeta.sol" ]; then
		continue
	fi

	oldVersion="$(version_from_commit_extensions $LATEST_RELEASE $file)"

	# What version does the staged version have?
	newVersion="$(version_from_commit_extensions '' $file)"

	if [ $newVersion -eq $oldVersion ]; then
		echo "Version not bumped for $file when it should be"
		STATUS=1;
	fi

done

exit $STATUS