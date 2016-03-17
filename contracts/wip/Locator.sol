
import "Killable.sol";

contract Locator is Killable {
  function register (bytes32 _key, address _contractAddress, address _owner, uint8 _major, uint8 _minor, uint8 _patch);
  function update(bytes32 _key, address _contractAddress, address _owner, uint8 _major, uint8 _minor, uint8 _patch);
  function unregister (bytes32 _key);
  function resolve(bytes32 _key) constant returns(address contractAddress);
  function use(bytes32 _key);
  function release(bytes32 _key);
  function getContractInfo(bytes32 _key)
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
  );
}
