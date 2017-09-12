pragma solidity ^0.4.15;

import "../lib/dappsys/auth.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";


contract ColonyNetwork is DSAuth {
  uint256 _colonyCount;
  uint256 public currentColonyVersion;
  mapping (uint => address) _coloniesIndex;
  mapping (bytes32 => address) _colonies;
  // Maps colony contract versions to respective resolvers
  mapping (uint => address) _colonyVersionResolver;

  function createColony(bytes32 name) {
    var token = new Token();
    var etherRouter = new EtherRouter();
    var resolver = _colonyVersionResolver[currentColonyVersion];
    etherRouter.setResolver(resolver);

    var colony = IColony(etherRouter);
    colony.setToken(token);
    var authority = new Authority(colony);

    var dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(authority);
    // Transfer ownership to colony creator
    dsauth.setOwner(msg.sender);
    authority.setOwner(msg.sender);
    token.setOwner(colony);
    _colonyCount += 1;
    _coloniesIndex[_colonyCount] = colony;
    _colonies[name] = colony;
  }

  function addColonyVersion(uint _version, address _resolver)
  auth
  {
    _colonyVersionResolver[_version] = _resolver;
    if(_version > currentColonyVersion) {
      currentColonyVersion = _version;
    }
  }

  // Returns the address of a Colony by index
  function getColony(bytes32 _name)
  constant returns (address)
  {
    return _colonies[_name];
  }

  function getColonyAt(uint _idx)
  constant returns (address)
  {
    return _coloniesIndex[_idx];
  }

  /// @notice this function returns the amount of colonies created
  /// @return the amount of colonies created
  function countColonies()
  constant returns (uint256)
  {
    return _colonyCount;
  }

  function upgradeColony(bytes32 _name, uint _newVersion) {
    address etherRouter = _colonies[_name];
    IColony c = IColony(etherRouter);
    uint oldVersion = c.version();
    require(_newVersion > oldVersion);
    address newResolver = _colonyVersionResolver[_newVersion];
    require(newResolver != 0x0);
    EtherRouter e = EtherRouter(etherRouter);
    e.setResolver(newResolver);
  }

  function ()
  payable
  { }
}
