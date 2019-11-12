/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "../ColonyDataTypes.sol";
import "../IColonyNetwork.sol";
import "./ColonyExtension.sol";


contract ExtensionManager {
  IColonyNetwork colonyNetwork;

  // [_extensionId] => roles
  mapping(bytes32 => bytes32) roles;
  // [_extensionId][version] => resolver
  mapping(bytes32 => mapping(uint256 => address)) resolvers;
  // [_extensionId][colony] => address
  mapping(bytes32 => mapping(address => address payable)) installations;

  event ExtensionAdded(bytes32 indexed extensionId, uint256 version);
  event ExtensionInstalled(bytes32 indexed extensionId, uint256 version, address indexed colony);

  event ExtensionUpgraded(bytes32 indexed extensionId, uint256 version, address indexed colony);
  event ExtensionUninstalled(bytes32 indexed extensionId, address indexed colony);

  event ExtensionEnabled(bytes32 indexed extensionId, address indexed colony, uint256 indexed domainId);
  event ExtensionDisabled(bytes32 indexed extensionId, address indexed colony, uint256 indexed domainId);

  constructor(address _colonyNetworkAddress) public {
    colonyNetwork = IColonyNetwork(_colonyNetworkAddress);
  }

  function addExtension(bytes32 _extensionId, address _resolver, bytes32 _roles)
    public
  {
    require(msg.sender == address(colonyNetwork), "extension-manager-not-network");
    require(_resolver != address(0x0), "extension-manager-bad-resolver");

    uint256 version = getResolverVersion(_resolver);
    require(version == 1 || _roles == 0, "extension-manager-nonempty-roles");
    require(version == 1 || resolvers[_extensionId][version - 1] != address(0x0), "extension-manager-bad-version");
    require(resolvers[_extensionId][version] == address(0x0), "extension-manager-already-added");

    resolvers[_extensionId][version] = _resolver;
    if (version == 1) { roles[_extensionId] = _roles; }

    emit ExtensionAdded(_extensionId, version);
  }

  function installExtension(bytes32 _extensionId, uint256 _version, address _colony)
    public
  {
    require(resolvers[_extensionId][_version] != address(0x0), "extension-manager-bad-version");
    require(installations[_extensionId][_colony] == address(0x0), "extension-manager-already-installed");
    require(root(_colony) || resolvers[_extensionId][_version + 1] == address(0x0), "extension-manager-only-latest-version");

    EtherRouter extension = new EtherRouter();
    installations[_extensionId][_colony] = address(extension);

    extension.setResolver(resolvers[_extensionId][_version]);
    ColonyExtension(address(extension)).install(_colony);

    emit ExtensionInstalled(_extensionId, _version, _colony);
  }

  function upgradeExtension(bytes32 _extensionId, address _colony)
    public
  {
    require(root(_colony), "extension-manager-unauthorized");
    require(installations[_extensionId][_colony] != address(0x0), "extension-manager-not-installed");

    address payable extension = installations[_extensionId][_colony];
    uint256 newVersion = ColonyExtension(extension).version() + 1;
    require(resolvers[_extensionId][newVersion] != address(0x0), "extension-manager-bad-version");

    EtherRouter(extension).setResolver(resolvers[_extensionId][newVersion]);
    ColonyExtension(extension).finishUpgrade();
    assert(ColonyExtension(extension).version() == newVersion);

    emit ExtensionUpgraded(_extensionId, newVersion, _colony);
  }

  function uninstallExtension(bytes32 _extensionId, address _colony)
    public
  {
    require(root(_colony), "extension-manager-unauthorized");
    require(installations[_extensionId][_colony] != address(0x0), "extension-manager-not-installed");

    ColonyExtension extension = ColonyExtension(installations[_extensionId][_colony]);
    installations[_extensionId][_colony] = address(0x0);
    extension.uninstall();

    emit ExtensionUninstalled(_extensionId, _colony);
  }

  function enableExtension(
    bytes32 _extensionId,
    address _colony,
    uint256 _rootChildSkillIndex,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  )
    public
  {
    require(authorized(_colony, _permissionDomainId, _childSkillIndex, _domainId), "extension-manager-unauthorized");

    address extension = installations[_extensionId][_colony];
    bytes32 userRoles = roles[_extensionId];

    IColony(_colony).setUserRoles(1, _rootChildSkillIndex, extension, _domainId, userRoles, true);

    emit ExtensionEnabled(_extensionId, _colony, _domainId);
  }

  function disableExtension(
    bytes32 _extensionId,
    address _colony,
    uint256 _rootChildSkillIndex,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  )
    public
  {
    require(authorized(_colony, _permissionDomainId, _childSkillIndex, _domainId), "extension-manager-unauthorized");

    address extension = installations[_extensionId][_colony];
    bytes32 userRoles = roles[_extensionId];

    IColony(_colony).setUserRoles(1, _rootChildSkillIndex, extension, _domainId, userRoles, false);

    emit ExtensionDisabled(_extensionId, _colony, _domainId);
  }

  function getRoles(bytes32 _extensionId)
    public
    view
    returns (bytes32)
  {
    return roles[_extensionId];
  }

  function getResolver(bytes32 _extensionId, uint256 _version)
    public
    view
    returns (address)
  {
    return resolvers[_extensionId][_version];
  }

  function getExtension(bytes32 _extensionId, address _colony)
    public
    view
    returns (address)
  {
    return installations[_extensionId][_colony];
  }

  function authorized(address _colony, uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId)
    internal
    view
    returns (bool)
  {
    return IColony(_colony).userCanSetRoles(msg.sender, _permissionDomainId, _childSkillIndex, _domainId);
  }

  function root(address _colony) internal view returns (bool) {
    return IColony(_colony).hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root);
  }

  bytes4 constant VERSION_SIG = bytes4(keccak256("version()"));

  function getResolverVersion(address _resolver) internal returns (uint256) {
    address extension = Resolver(_resolver).lookup(VERSION_SIG);
    return ColonyExtension(extension).version();
  }
}
