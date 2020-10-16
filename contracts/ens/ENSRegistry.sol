pragma solidity 0.7.3;

import "./ENS.sol";

// ignore-file-swc-101 This is due to ConsenSys/truffle-security#245 and the bad-line reporting associated with it
// (It's really the abi.encodepacked in setSubnodeOwner.


/// @title Modified ENS registry contract.
/// @notice https://github.com/ensdomains/ens/blob/master/contracts/ENSRegistry.sol
contract ENSRegistry is ENS {
  struct Record {
    address owner;
    address resolver;
    uint64 ttl;
  }

  mapping (bytes32 => Record) internal records;

  // Permits modifications only by the owner of the specified node, or if unowned.
  modifier onlyOwner(bytes32 node) {
    address currentOwner = records[node].owner;
    require(currentOwner == address(0x0) || currentOwner == msg.sender, "colony-ens-non-owner-access");
    _;
  }

  /// @dev Constructs a new ENS registrar.
  constructor() public {
    records[0x0].owner = msg.sender;
  }

  /// @dev Transfers ownership of a node to a new address.
  /// @param node The node to transfer ownership of.
  /// @param owner The address of the new owner.
  function setOwner(bytes32 node, address owner) public override onlyOwner(node) {
    emit Transfer(node, owner);
    records[node].owner = owner;
  }

  /// @dev Transfers ownership of a subnode keccak256(node, label) to a new address. May only be called by the owner of the parent node.
  /// @param node The parent node.
  /// @param label The hash of the label specifying the subnode.
  /// @param owner The address of the new owner.
  function setSubnodeOwner(bytes32 node, bytes32 label, address owner) public override onlyOwner(node) {
    require(records[node].owner != address(0x0), "unowned-node");
    bytes32 subnode = keccak256(abi.encodePacked(node, label));
    emit NewOwner(node, label, owner);
    records[subnode].owner = owner;
  }

  /// @dev Sets the resolver address for the specified node.
  /// @param node The node to update.
  /// @param resolver The address of the resolver.
  function setResolver(bytes32 node, address resolver) public override onlyOwner(node) {
    emit NewResolver(node, resolver);
    records[node].resolver = resolver;
  }

  /// @dev Sets the TTL for the specified node.
  /// @param node The node to update.
  /// @param ttl The TTL in seconds.
  function setTTL(bytes32 node, uint64 ttl) public override onlyOwner(node) {
    emit NewTTL(node, ttl);
    records[node].ttl = ttl;
  }

  /// @dev Returns the address that owns the specified node.
  /// @param node The specified node.
  /// @return address of the owner.
  function owner(bytes32 node) public view override returns (address) {
    return records[node].owner;
  }

  /// @dev Returns the address of the resolver for the specified node.
  /// @param node The specified node.
  /// @return address of the resolver.
  function resolver(bytes32 node) public view override returns (address) {
    return records[node].resolver;
  }

  /// @dev Returns the TTL of a node, and any records associated with it.
  /// @param node The specified node.
  /// @return ttl of the node.
  function ttl(bytes32 node) public view override returns (uint64) {
    return records[node].ttl;
  }

}
