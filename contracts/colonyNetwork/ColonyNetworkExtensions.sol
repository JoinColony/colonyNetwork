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

import "../colony/ColonyDataTypes.sol";
import "../colonyNetwork/IColonyNetwork.sol";
import "../extensions/ColonyExtension.sol";
import "./ColonyNetworkStorage.sol";


contract ColonyNetworkExtensions is ColonyNetworkStorage {

  // Public functions

  function addExtension(bytes32 _extensionId, address _resolver, bytes32 _roles)
    public
    stoppable
    calledByMetaColony
  {
    require(_resolver != address(0x0), "extension-manager-bad-resolver");

    uint256 version = getResolverVersion(_resolver);
    require(version == 1 || _roles == 0, "extension-manager-nonempty-roles");
    require(version == 1 || resolvers[_extensionId][version - 1] != address(0x0), "extension-manager-bad-version");

    resolvers[_extensionId][version] = _resolver;
    if (version == 1) { roles[_extensionId] = _roles; }

    emit ExtensionAdded(_extensionId, version);
  }

  function installExtension(bytes32 _extensionId, uint256 _version, address _colony)
    public
    stoppable
  {
    require(resolvers[_extensionId][_version] != address(0x0), "extension-manager-bad-version");
    require(installations[_extensionId][_colony] == address(0x0), "extension-manager-already-installed");
    require(root(_colony), "extension-manager-unauthorized");

    EtherRouter extension = new EtherRouter();
    installations[_extensionId][_colony] = address(extension);

    extension.setResolver(resolvers[_extensionId][_version]);
    ColonyExtension(address(extension)).install(_colony);

    emit ExtensionInstalled(_extensionId, _version, _colony);
  }

  function upgradeExtension(bytes32 _extensionId, address _colony, uint256 _newVersion)
    public
    stoppable
  {
    require(root(_colony), "extension-manager-unauthorized");
    require(installations[_extensionId][_colony] != address(0x0), "extension-manager-not-installed");

    address payable extension = installations[_extensionId][_colony];
    require(_newVersion == ColonyExtension(extension).version() + 1, "extension-manager-bad-increment");
    require(resolvers[_extensionId][_newVersion] != address(0x0), "extension-manager-bad-version");

    EtherRouter(extension).setResolver(resolvers[_extensionId][_newVersion]);
    ColonyExtension(extension).finishUpgrade();
    assert(ColonyExtension(extension).version() == _newVersion);

    emit ExtensionUpgraded(_extensionId, _newVersion, _colony);
  }

  function uninstallExtension(bytes32 _extensionId, address _colony)
    public
    stoppable
  {
    require(root(_colony), "extension-manager-unauthorized");
    require(installations[_extensionId][_colony] != address(0x0), "extension-manager-not-installed");

    ColonyExtension extension = ColonyExtension(installations[_extensionId][_colony]);
    installations[_extensionId][_colony] = address(0x0);
    extension.uninstall();

    emit ExtensionUninstalled(_extensionId, _colony);
  }

  // Public view functions

  function getExtensionRoles(bytes32 _extensionId)
    public
    view
    returns (bytes32)
  {
    return roles[_extensionId];
  }

  function getExtensionResolver(bytes32 _extensionId, uint256 _version)
    public
    view
    returns (address)
  {
    return resolvers[_extensionId][_version];
  }

  function getExtensionInstallation(bytes32 _extensionId, address _colony)
    public
    view
    returns (address)
  {
    return installations[_extensionId][_colony];
  }

  // Internal functions

  function root(address _colony) internal view returns (bool) {
    return IColony(_colony).hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root);
  }

  bytes4 constant VERSION_SIG = bytes4(keccak256("version()"));

  function getResolverVersion(address _resolver) internal returns (uint256) {
    address extension = Resolver(_resolver).lookup(VERSION_SIG);
    return ColonyExtension(extension).version();
  }
}
