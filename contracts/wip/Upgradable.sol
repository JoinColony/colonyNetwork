
import "Ownable.sol";
contract Upgradable is Ownable {

  uint8 majorVersion;
  uint8 minorVersion;
  uint8 patchVersion;
  bytes32 _KEY_;

  /// @notice set key value for the contract
  /// @param _key the key to be used to enroll on contract locator
  function setKey(bytes32 _key)
    onlyOwner
  {
    _KEY_ = _key;
  }

  /// @notice set contract version according to SemVer
  /// @param _major the major version from SemVer, used when there are imcompatible/breaking changes
  /// @param _minor the minor version from SemVer, used when features were added in a backwards-compatible way
  /// @param _patch the patch version from SemVer, used when bugs were fixed in a backwards-compatible way
  function setVersion(uint8 _major, uint8 _minor, uint8 _patch)
    onlyOwner
  {
    majorVersion = _major;
    minorVersion = _minor;
    patchVersion = _patch;
  }

  /// @notice returns the contract key used by contract locator
  /// @return The key from the contract
  function getContractKey() constant returns (bytes32) {
    return _KEY_;
  }
}
