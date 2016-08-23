import "EternalStorage.sol";


library ColonyLibrary {

	// Manages records for colonies stored in the format:
	// sha3(bytes32 colonyName) -> uint index , e.g. 'Antz Colony' -> 138
	// sha3(uint index) -> address colony address, e.g. 138 -> 0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661

	function coloniesCount(address _storageContract) constant returns (uint256)
	{
		return EternalStorage(_storageContract).getUIntValue(sha3("ColoniesCount"));
	}

	function addColony(address _storageContract, bytes32 _key, address colony)
	{
		var idx = EternalStorage(_storageContract).getUIntValue(sha3(_key));
		// Check if a colony with that key (and index) already exists.
		// Colony indexes are 1 based.
		if(idx != 0) { throw; }

		var count = EternalStorage(_storageContract).getUIntValue(sha3("ColoniesCount"));
		var newId = count + 1;

		EternalStorage(_storageContract).setUIntValue(sha3(_key), newId);
		EternalStorage(_storageContract).setAddressValue(sha3("colony:", newId), colony);
		EternalStorage(_storageContract).setUIntValue(sha3("ColoniesCount"), newId);
	}

	function getColony(address _storageContract, bytes32 _key) constant returns(address)
	{
		var idx = EternalStorage(_storageContract).getUIntValue(sha3(_key));
		return EternalStorage(_storageContract).getAddressValue(sha3("colony:", idx));
	}

	function getColonyAt(address _storageContract, uint256 _idx) constant returns(address)
	{
		return EternalStorage(_storageContract).getAddressValue(sha3("colony:", _idx));
	}

	function getColonyIndex(address _storageContract, bytes32 _key) constant returns(uint256)
	{
			return EternalStorage(_storageContract).getUIntValue(sha3(_key));
	}

	function upgradeColony(address _storageContract, bytes32 _key, address colonyNew)
	{
		var idx = EternalStorage(_storageContract).getUIntValue(sha3(_key));
		EternalStorage(_storageContract).setAddressValue(sha3("colony:", idx), colonyNew);
	}
}
