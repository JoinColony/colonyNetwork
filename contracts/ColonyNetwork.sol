pragma solidity ^0.4.15;

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/roles.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";


contract ColonyNetwork is DSAuth {
  address resolver;
  uint256 public colonyCount;
  uint256 public currentColonyVersion;
  mapping (uint => address) _coloniesIndex;
  mapping (bytes32 => address) _colonies;
  // Maps colony contract versions to respective resolvers
  mapping (uint => address) public colonyVersionResolver;

  function createColony(bytes32 name) {
    var token = new Token();
    var etherRouter = new EtherRouter();
    var resolver = colonyVersionResolver[currentColonyVersion];
    etherRouter.setResolver(resolver);

    var colony = IColony(etherRouter);
    colony.setToken(token);
    token.setOwner(colony);

    var authority = new Authority(colony);
    var dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(authority);
    authority.setRootUser(msg.sender, true);
    authority.setOwner(msg.sender);

    colonyCount += 1;
    _coloniesIndex[colonyCount] = colony;
    _colonies[name] = colony;
  }

  function addColonyVersion(uint _version, address _resolver)
  auth
  {
    colonyVersionResolver[_version] = _resolver;
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

  function upgradeColony(bytes32 _name, uint _newVersion) {
    address etherRouter = _colonies[_name];
    // Check the calling user is authorised
    DSAuth auth = DSAuth(etherRouter);
    DSAuthority authority = auth.authority();
    require(authority.canCall(msg.sender, etherRouter, 0x0e1f20b4));
    // Upgrades can only go up in version
    IColony colony = IColony(etherRouter);
    uint currentVersion = colony.version();
    require(_newVersion > currentVersion);
    // Requested version has to be registered
    address newResolver = colonyVersionResolver[_newVersion];
    require(newResolver != 0x0);
    EtherRouter e = EtherRouter(etherRouter);
    e.setResolver(newResolver);
  }

  function ()
  payable
  { }
}
