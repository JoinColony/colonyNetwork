pragma solidity ^0.4.0;

import "EternalStorage.sol";


library ColonyLibrary {

	// Manages records for colonies stored in the format:
	// keccak256(bytes32 colonyName) -> uint index , e.g. 'Antz Colony' -> 138
	// keccak256(uint index) -> address colony address, e.g. 138 -> 0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661

	function coloniesCount(address _storageContract)
	constant returns (uint256)
	{
		return EternalStorage(_storageContract).getUIntValue(keccak256("ColoniesCount"));
	}

	function addColony(address _storageContract, bytes32 _key, address colony) {
		var idx = EternalStorage(_storageContract).getUIntValue(keccak256(_key));
		// Check if a colony with that key (and index) already exists.
		// Colony indexes are 1 based.
		if(idx != 0) { throw; }

		var count = EternalStorage(_storageContract).getUIntValue(keccak256("ColoniesCount"));
		var newId = count + 1;

		EternalStorage(_storageContract).setUIntValue(keccak256(_key), newId);
		EternalStorage(_storageContract).setAddressValue(keccak256("colony:", newId), colony);
		EternalStorage(_storageContract).setUIntValue(keccak256("ColoniesCount"), newId);
	}

	function getColony(address _storageContract, bytes32 _key)
	constant returns(address)
	{
		var idx = EternalStorage(_storageContract).getUIntValue(keccak256(_key));
		return EternalStorage(_storageContract).getAddressValue(keccak256("colony:", idx));
	}

	function getColonyAt(address _storageContract, uint256 _idx)
	constant returns(address)
	{
		return EternalStorage(_storageContract).getAddressValue(keccak256("colony:", _idx));
	}

	function getColonyIndex(address _storageContract, bytes32 _key)
	constant returns(uint256)
	{
			return EternalStorage(_storageContract).getUIntValue(keccak256(_key));
	}

	function upgradeColony(address _storageContract, bytes32 _key, address colonyNew) {
		var idx = EternalStorage(_storageContract).getUIntValue(keccak256(_key));
		EternalStorage(_storageContract).setAddressValue(keccak256("colony:", idx), colonyNew);
	}
}
