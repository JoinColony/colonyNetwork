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

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "../colony/ColonyDataTypes.sol";
import "../colonyNetwork/IColonyNetwork.sol";
import "../extensions/ColonyExtension.sol";
import "./ColonyNetworkStorage.sol";


contract ColonyNetworkExtensions is ColonyNetworkStorage {

  // Public functions

  function addExtensionToNetwork(bytes32 _extensionId, address _resolver)
    public
    stoppable
    calledByMetaColony
  {
    require(_resolver != address(0x0), "colony-network-extension-bad-resolver");

    bytes32 extensionId = getExtensionId(_resolver);
    require(_extensionId == extensionId, "colony-network-extension-bad-identifier");

    uint256 version = getResolverVersion(_resolver);
    require(resolvers[_extensionId][version] == address(0x0), "colony-network-extension-already-set");

    resolvers[_extensionId][version] = _resolver;

    emit ExtensionAddedToNetwork(_extensionId, version);
  }

  function installExtension(bytes32 _extensionId, uint256 _version)
    public
    stoppable
    calledByColony
    returns (address)
  {
    require(resolvers[_extensionId][_version] != address(0x0), "colony-network-extension-bad-version");

    EtherRouter extension = new EtherRouter();

    // Install in old installations mapping if version 7 or below
    if (IColony(msg.sender).version() <= 7) {
      require(installations[_extensionId][msg.sender] == address(0x0), "colony-network-extension-already-installed");
      installations[_extensionId][msg.sender] = address(extension);

      emit ExtensionInstalled(_extensionId, address(extension), _version);
    } else {
      multiInstallations[address(extension)] = msg.sender;

      emit ExtensionInstalled(_extensionId, address(extension), msg.sender, _version);
    }

    extension.setResolver(resolvers[_extensionId][_version]);
    ColonyExtension(address(extension)).install(msg.sender);


    return address(extension);
  }

  // Deprecated
  function upgradeExtension(bytes32 _extensionId, uint256 _newVersion)
    public
    stoppable
    calledByColony
  {
    require(installations[_extensionId][msg.sender] != address(0x0), "colony-network-extension-not-installed");

    address payable extension = installations[_extensionId][msg.sender];
    require(_newVersion == ColonyExtension(extension).version() + 1, "colony-network-extension-bad-increment");
    require(resolvers[_extensionId][_newVersion] != address(0x0), "colony-network-extension-bad-version");

    EtherRouter(extension).setResolver(resolvers[_extensionId][_newVersion]);
    ColonyExtension(extension).finishUpgrade();
    assert(ColonyExtension(extension).version() == _newVersion);

    emit ExtensionUpgraded(_extensionId, msg.sender, _newVersion);
  }

  function upgradeExtension(address _extension, uint256 _newVersion)
    public
    stoppable
    calledByColony
  {
    require(multiInstallations[_extension] == msg.sender, "colony-network-extension-not-installed");

    bytes32 extensionId = ColonyExtension(_extension).identifier();

    require(_newVersion == ColonyExtension(_extension).version() + 1, "colony-network-extension-bad-increment");
    require(resolvers[extensionId][_newVersion] != address(0x0), "colony-network-extension-bad-version");

    EtherRouter(payable(_extension)).setResolver(resolvers[extensionId][_newVersion]);
    ColonyExtension(_extension).finishUpgrade();

    assert(ColonyExtension(_extension).version() == _newVersion);

    emit ExtensionUpgraded(_extension, msg.sender, _newVersion);
  }

  // Deprecated
  function deprecateExtension(bytes32 _extensionId, bool _deprecated)
    public
    stoppable
    calledByColony
  {
    ColonyExtension(installations[_extensionId][msg.sender]).deprecate(_deprecated);

    emit ExtensionDeprecated(_extensionId, msg.sender, _deprecated);
  }

  function deprecateExtension(address _extension, bool _deprecated)
    public
    stoppable
    calledByColony
  {
    ColonyExtension(_extension).deprecate(_deprecated);

    emit ExtensionDeprecated(_extension, msg.sender, _deprecated);
  }

  // Deprecated
  function uninstallExtension(bytes32 _extensionId)
    public
    stoppable
    calledByColony
  {
    require(installations[_extensionId][msg.sender] != address(0x0), "colony-network-extension-not-installed");

    ColonyExtension extension = ColonyExtension(installations[_extensionId][msg.sender]);
    delete installations[_extensionId][msg.sender];
    extension.uninstall();

    emit ExtensionUninstalled(_extensionId, msg.sender);
  }

  function uninstallExtension(address _extension)
    public
    stoppable
    calledByColony
  {
    require(multiInstallations[_extension] == msg.sender, "colony-network-extension-not-installed");

    delete multiInstallations[_extension];
    ColonyExtension(_extension).uninstall();

    emit ExtensionUninstalled(_extension, msg.sender);
  }

  function migrateToMultiExtension(bytes32 _extensionId)
    public
    stoppable
    calledByColony
  {
    require(installations[_extensionId][msg.sender] != address(0x0), "colony-network-extension-not-installed");

    multiInstallations[installations[_extensionId][msg.sender]] = payable(msg.sender);

    delete installations[_extensionId][msg.sender];
  }

  // Public view functions

  function getExtensionResolver(bytes32 _extensionId, uint256 _version)
    public
    view
    returns (address)
  {
    return resolvers[_extensionId][_version];
  }

  function getExtensionColony(address _extension)
    public
    view
    returns (address)
  {
    return multiInstallations[_extension];
  }

  function getExtensionInstallation(bytes32 _extensionId, address _colony)
    public
    view
    returns (address)
  {
    return installations[_extensionId][_colony];
  }

  // Internal functions

  bytes4 constant IDENTIFIER_SIG = bytes4(keccak256("identifier()"));

  function getExtensionId(address _resolver) internal returns (bytes32) {
    address extension = Resolver(_resolver).lookup(IDENTIFIER_SIG);
    return ColonyExtension(extension).identifier();
  }

  bytes4 constant VERSION_SIG = bytes4(keccak256("version()"));

  function getResolverVersion(address _resolver) internal returns (uint256) {
    address extension = Resolver(_resolver).lookup(VERSION_SIG);
    return ColonyExtension(extension).version();
  }
}
