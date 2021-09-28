LATEST_RELEASE=`curl --silent "https://api.github.com/repos/joinColony/colonyNetwork/releases/latest" | grep -Po '"tag_name": "\K.*?(?=")'`

# Are there changes in the colony contract?
N=`git diff --cached --name-only $LATEST_RELEASE contracts/colony/ | wc -l`

version_from_commit() {
	COMMIT=$1;
	FILE=$2;
	VERSION="$(git show $COMMIT:$FILE | grep 'function version() public pure returns (uint256 colonyVersion) { return ' | sed 's/function version() public pure returns (uint256 colonyVersion) { return //' | sed 's/; }//' | sed 's/ //g')"
	echo $VERSION
}

if [ $N -ne 0 ]; then
	# We need to check if we've bumped the version
	# What version does the latest release have
	oldVersion="$(version_from_commit $LATEST_RELEASE 'contracts/colony/Colony.sol')"

	# What version does the staged version have?
	newVersion="$(version_from_commit '' 'contracts/colony/Colony.sol')"

	if [ $newVersion -eq $oldVersion ]; then
		echo "Version not bumped for Colony.sol when it should be"
		exit 1;
	fi
fi

# Now the same for the extensions
for file in $(git diff --cached --name-only | grep -E 'contracts/extensions/')
do
	if [ $file = "contracts/extensions/ColonyExtension.sol" ]; then
		continue
	fi

	oldVersion="$(version_from_commit $LATEST_RELEASE $file)"

	# What version does the staged version have?
	newVersion="$(version_from_commit '' $file)"

	if [ $newVersion -eq $oldVersion ]; then
		echo "Version not bumped for $file when it should be"
		exit 1;
	fi

done