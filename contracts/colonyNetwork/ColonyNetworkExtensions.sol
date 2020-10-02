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

  function addExtensionToNetwork(bytes32 _extensionId, address _resolver)
    public
    stoppable
    calledByMetaColony
  {
    require(_resolver != address(0x0), "colony-network-extension-bad-resolver");

    uint256 version = getResolverVersion(_resolver);
    require(extensionResolvers[_extensionId][version] == address(0x0), "colony-network-extension-already-set");
    require(
      version == 1 || extensionResolvers[_extensionId][version - 1] != address(0x0),
      "colony-network-extension-bad-version"
    );

    extensionResolvers[_extensionId][version] = _resolver;

    emit ExtensionAddedToNetwork(_extensionId, version);
  }

  function installExtension(bytes32 _extensionId, uint256 _version)
    public
    stoppable
    calledByColony
  {
    require(extensionResolvers[_extensionId][_version] != address(0x0), "colony-network-extension-bad-version");
    require(extensionInstallations[_extensionId][msg.sender] == address(0x0), "colony-network-extension-already-installed");

    EtherRouter extension = new EtherRouter();
    extensionInstallations[_extensionId][msg.sender] = address(extension);
    extensionIdentifiers[address(extension)][msg.sender] = _extensionId;

    extension.setResolver(extensionResolvers[_extensionId][_version]);
    ColonyExtension(address(extension)).install(msg.sender);

    emit ExtensionInstalled(_extensionId, msg.sender, _version);
  }

  function upgradeExtension(bytes32 _extensionId, uint256 _newVersion)
    public
    stoppable
    calledByColony
  {
    require(extensionInstallations[_extensionId][msg.sender] != address(0x0), "colony-network-extension-not-installed");

    address payable extension = extensionInstallations[_extensionId][msg.sender];
    require(_newVersion == ColonyExtension(extension).version() + 1, "colony-network-extension-bad-increment");
    require(extensionResolvers[_extensionId][_newVersion] != address(0x0), "colony-network-extension-bad-version");

    EtherRouter(extension).setResolver(extensionResolvers[_extensionId][_newVersion]);
    ColonyExtension(extension).finishUpgrade();
    assert(ColonyExtension(extension).version() == _newVersion);

    emit ExtensionUpgraded(_extensionId, msg.sender, _newVersion);
  }

  function deprecateExtension(bytes32 _extensionId, bool _deprecated)
    public
    stoppable
    calledByColony
  {
    ColonyExtension(extensionInstallations[_extensionId][msg.sender]).deprecate(_deprecated);

    emit ExtensionDeprecated(_extensionId, msg.sender, _deprecated);
  }

  function uninstallExtension(bytes32 _extensionId)
    public
    stoppable
    calledByColony
  {
    require(extensionInstallations[_extensionId][msg.sender] != address(0x0), "colony-network-extension-not-installed");

    address extension = extensionInstallations[_extensionId][msg.sender];
    delete extensionInstallations[_extensionId][msg.sender];
    delete extensionIdentifiers[extension][msg.sender];

    ColonyExtension(extension).uninstall();

    emit ExtensionUninstalled(_extensionId, msg.sender);
  }

  // Public view functions

  function getExtensionResolver(bytes32 _extensionId, uint256 _version)
    public
    view
    returns (address)
  {
    return extensionResolvers[_extensionId][_version];
  }

  function getExtensionInstallation(bytes32 _extensionId, address _colony)
    public
    view
    returns (address)
  {
    return extensionInstallations[_extensionId][_colony];
  }

  function getExtensionIdentifier(address _extension, address _colony)
    public
    view
    returns (bytes32)
  {
    return extensionIdentifiers[_extension][_colony];
  }

  // Internal functions

  bytes4 constant VERSION_SIG = bytes4(keccak256("version()"));

  function getResolverVersion(address _resolver) internal returns (uint256) {
    address extension = Resolver(_resolver).lookup(VERSION_SIG);
    return ColonyExtension(extension).version();
  }
}
