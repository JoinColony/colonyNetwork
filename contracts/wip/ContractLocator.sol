
import "Locator.sol";
import "AbstractFactory.sol";

contract ContractLocator is Locator {

  struct ContractRecord {
    address contractOwner;
    bytes32 key; //Contract ID based on its name or URL
    address contractAddress; //Contract address
    uint referenceCount; //Used to keep track of contracts using this record
    uint lastModified; //Last modified date
    uint8 majorVersion; //Store version of the contract
    uint8 minorVersion; //Store version of the contract
    uint8 patchVersion; //Store version of the contract
    uint createdAt; //Date of creation
  }

  mapping(bytes32 => ContractRecord) catalog;
  bytes32 constant _CONTRACT_LOCATOR_ = "CONTRACT_LOCATOR";

  event ContractAdded(bytes32 indexed key, address indexed contractAddress, uint8 major, uint8 minor, uint8 patch);
  event ContractRemoved(bytes32 indexed key, address indexed contractAddress, uint8 major, uint8 minor, uint8 patch);
  event ContractUpdated(bytes32 indexed key, address indexed contractAddress, uint8 major, uint8 minor, uint8 patch);

  modifier throwIfKeyIsEmpty(bytes32 _key) {
    if(_key == "") throw;
    _
  }

  modifier throwIfAddressIsInvalid(address _contractAddress) {
    if(_contractAddress == 0x0) throw;
    _
  }

  modifier throwIfContractIsRegistered(bytes32 _key) {
    if(catalog[_key].contractAddress != 0x0) throw;
    _
  }

  modifier throwIfContractNotRegistered(bytes32 _key) {
    if(catalog[_key].contractAddress == 0x0) throw;
    _
  }

  modifier throwIfContractIsInUse(bytes32 _key)
  {
    if(catalog[_key].referenceCount > 0) throw;
    _
  }

  modifier throwIfContractVersionIsInvalid(uint8 _major, uint8 _minor, uint8 _patch)
  {
    if(_major < 0) throw;
    if(_minor < 0) throw;
    if(_patch < 0) throw;
    _
  }

  /// @notice raise an error if user sends ether by accident
  modifier refundEtherSentByAccident()
  {
      if(msg.value > 0) throw;
      _
  }

  /// @notice register a new contract address
  /// @param _key contract identification key, that's how it will be found later
  /// @param _contractAddress the contract address of the contract
  /// @param _major the major version from SemVer, used when there are imcompatible/breaking changes
  /// @param _minor the minor version from SemVer, used when features were added in a backwards-compatible way
  /// @param _patch the patch version from SemVer, used when bugs were fixed in a backwards-compatible way
  function register (bytes32 _key, address _contractAddress, address _owner, uint8 _major, uint8 _minor, uint8 _patch)
    refundEtherSentByAccident
    throwIfContractIsRegistered(_key)
    throwIfKeyIsEmpty(_key)
    throwIfAddressIsInvalid(_contractAddress)
    throwIfAddressIsInvalid(_owner)
    throwIfContractVersionIsInvalid(_major, _minor, _patch)
  {
    catalog[_key] = ContractRecord({
        key            : _key,
        contractOwner  : _owner,
        referenceCount : 0,
        contractAddress: _contractAddress,
        lastModified   : now,
        createdAt      : now,
        majorVersion   : _major,
        minorVersion   : _minor,
        patchVersion   : _patch
    });

    ContractAdded(_key, _contractAddress, _major, _minor, _patch);
  }

  /// @notice update contract address and lastModified date
  /// @param _key contract identification key, that's how it will be found later
  /// @param _contractAddress contract updated address
  /// @param _major the major version from SemVer, used when there are imcompatible/breaking changes
  /// @param _minor the minor version from SemVer, used when features were added in a backwards-compatible way
  /// @param _patch the patch version from SemVer, used when bugs were fixed in a backwards-compatible way
  function update(bytes32 _key, address _contractAddress, address _owner, uint8 _major, uint8 _minor, uint8 _patch)
    refundEtherSentByAccident
    throwIfKeyIsEmpty(_key)
    throwIfAddressIsInvalid(_contractAddress)
    throwIfAddressIsInvalid(_owner)
    throwIfContractVersionIsInvalid(_major, _minor, _patch)
  {
    if(catalog[_key].contractAddress != 0x0 && catalog[_key].contractOwner == msg.sender)
    {
      var contractRecord = catalog[_key];
      contractRecord.lastModified = now;
      contractRecord.contractOwner = _owner;
      contractRecord.contractAddress = _contractAddress;
      contractRecord.majorVersion = _major;
      contractRecord.minorVersion = _minor;
      contractRecord.patchVersion = _patch;

      catalog[_key] = contractRecord;

      ContractUpdated(_key, _contractAddress, _major, _minor, _patch);
    }
    else
    {
      register(_key, _contractAddress, _owner, _major, _minor, _patch);
    }
  }

  /// @notice remove contract from records
  /// @param _key contract identification key
  function unregister(bytes32 _key)
    onlyOwner
    refundEtherSentByAccident
    throwIfContractNotRegistered(_key)
    throwIfKeyIsEmpty(_key)
    throwIfContractIsInUse(_key)
  {
    var contractRecord = catalog[_key];

    delete catalog[_key];
    ContractRemoved(_key, contractRecord.contractAddress, contractRecord.majorVersion, contractRecord.minorVersion, contractRecord.patchVersion);
  }

  /// @return contract record info
  function resolve(bytes32 _key)
    refundEtherSentByAccident
    throwIfKeyIsEmpty(_key)
    constant returns(address contractAddress)
  {
    var contractRecord = catalog[_key];
    contractAddress = contractRecord.contractAddress;
  }

  /// @notice increases reference count for the given address
  /// @param _key contract key registered in the contract catalog
  function use(bytes32 _key)
    refundEtherSentByAccident
    throwIfKeyIsEmpty(_key)
    throwIfContractNotRegistered(_key)
  {
    if(catalog[_key].referenceCount + 1 < catalog[_key].referenceCount) throw;
    catalog[_key].referenceCount += 1;
  }

  /// @notice decrease reference count for the given address
  /// @param _key contract key registered in the contract catalog
  function release(bytes32 _key)
    refundEtherSentByAccident
    throwIfKeyIsEmpty(_key)
    throwIfContractNotRegistered(_key)
  {
    if(catalog[_key].referenceCount == 0) throw;
    catalog[_key].referenceCount -= 1;
  }

  /// @notice returns how many references to this contract were done
  /// @param _key contract key, used to verify if the contract exists
  function getReferenceCount(bytes32 _key)
    refundEtherSentByAccident
    throwIfKeyIsEmpty(_key)
    throwIfContractNotRegistered(_key)
    constant returns (uint)
  {
    return catalog[_key].referenceCount;
  }

  /// @return contract record info
  function getContractInfo(bytes32 _key)
    refundEtherSentByAccident
    throwIfKeyIsEmpty(_key)
    throwIfContractNotRegistered(_key)
    constant returns
    (
      address contractAddress,
      address contractOwner,
      uint referenceCount,
      uint lastModified,
      uint createdAt,
      uint8 major,
      uint8 minor,
      uint8 patch
    )
  {
    var contractRecord = catalog[_key];
    contractAddress = contractRecord.contractAddress;
    contractOwner = contractRecord.contractOwner;
    referenceCount = contractRecord.referenceCount;
    lastModified = contractRecord.lastModified;
    createdAt = contractRecord.createdAt;
    major = contractRecord.majorVersion;
    minor = contractRecord.minorVersion;
    patch = contractRecord.patchVersion;
  }

	function () {
    throw;
	}
}
