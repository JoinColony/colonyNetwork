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
  mapping(bytes32 => uint8[]) roles;
  // [_extensionId][version] => resolver
  mapping(bytes32 => mapping(uint256 => address)) resolvers;
  // [_extensionId][colony][domainId] => address
  mapping(bytes32 => mapping(address => mapping(uint256 => address payable))) installations;

  event ExtensionAdded(bytes32 indexed extensionId, uint256 version);
  event ExtensionInstalled(bytes32 indexed extensionId, uint256 version, address indexed colony, uint256 indexed domainId);
  event ExtensionUpgraded(bytes32 indexed extensionId, uint256 version, address indexed colony, uint256 indexed domainId);
  event ExtensionUninstalled(bytes32 indexed extensionId, address indexed colony, uint256 indexed domainId);

  constructor(address _colonyNetworkAddress) public {
    colonyNetwork = IColonyNetwork(_colonyNetworkAddress);
  }

  function addExtension(bytes32 _extensionId, address _resolver, uint8[] memory _roles)
    public
  {
    require(msg.sender == address(colonyNetwork), "extension-manager-not-network");
    require(_resolver != address(0x0), "extension-manager-bad-resolver");

    uint256 version = getResolverVersion(_resolver);
    require(version == 1 || _roles.length == 0, "extension-manager-nonempty-roles");
    require(version == 1 || resolvers[_extensionId][version - 1] != address(0x0), "extension-manager-bad-version");
    require(resolvers[_extensionId][version] == address(0x0), "extension-manager-already-added");

    resolvers[_extensionId][version] = _resolver;
    if (version == 1) { roles[_extensionId] = _roles; }

    emit ExtensionAdded(_extensionId, version);
  }

  function installExtension(
    bytes32 _extensionId,
    uint256 _version,
    address _colony,
    uint256 _rootChildSkillIndex,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  )
    public
  {
    require(authorized(_colony, _permissionDomainId, _childSkillIndex, _domainId), "extension-manager-unauthorized");

    require(
      resolvers[_extensionId][_version] != address(0x0),
      "extension-manager-bad-version"
    );
    require(
      installations[_extensionId][_colony][_domainId] == address(0x0),
      "extension-manager-already-installed"
    );

    EtherRouter extension = new EtherRouter();
    installations[_extensionId][_colony][_domainId] = address(extension);

    assignRoles(_colony, _rootChildSkillIndex, _domainId, _extensionId, true);

    extension.setResolver(resolvers[_extensionId][_version]);
    ColonyExtension(address(extension)).install(_colony);

    emit ExtensionInstalled(_extensionId, _version, _colony, _domainId);
  }

  function upgradeExtension(
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

    address payable extension = installations[_extensionId][_colony][_domainId];
    require(extension != address(0x0), "extension-manager-not-installed");

    uint256 newVersion = ColonyExtension(extension).version() + 1;
    require(resolvers[_extensionId][newVersion] != address(0x0), "extension-manager-bad-version");

    EtherRouter(extension).setResolver(resolvers[_extensionId][newVersion]);
    ColonyExtension(extension).finishUpgrade();

    assert(ColonyExtension(extension).version() == newVersion);

    emit ExtensionUpgraded(_extensionId, newVersion, _colony, _domainId);
  }

  function uninstallExtension(
    bytes32 _extensionId,
    address payable _colony,
    uint256 _rootChildSkillIndex,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  )
    public
  {
    require(authorized(_colony, _permissionDomainId, _childSkillIndex, _domainId), "extension-manager-unauthorized");

    require(
      installations[_extensionId][_colony][_domainId] != address(0x0),
      "extension-manager-not-installed"
    );

    assignRoles(_colony, _rootChildSkillIndex, _domainId, _extensionId, false);

    ColonyExtension extension = ColonyExtension(installations[_extensionId][_colony][_domainId]);
    installations[_extensionId][_colony][_domainId] = address(0x0);
    extension.uninstall();

    emit ExtensionUninstalled(_extensionId, _colony, _domainId);
  }

  function getResolver(bytes32 _extensionId, uint256 _version)
    public
    view
    returns (address)
  {
    return resolvers[_extensionId][_version];
  }

  function getExtension(bytes32 _extensionId, address _colony, uint256 _domainId)
    public
    view
    returns (address)
  {
    return installations[_extensionId][_colony][_domainId];
  }

  function authorized(address _colony, uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId)
    internal
    view
    returns (bool)
  {
    return IColony(_colony).userCanSetRoles(msg.sender, _permissionDomainId, _childSkillIndex, _domainId);
  }

  bytes4 constant VERSION_SIG = bytes4(keccak256("version()"));

  function getResolverVersion(address _resolver) internal returns (uint256) {
    address extension = Resolver(_resolver).lookup(VERSION_SIG);
    return ColonyExtension(extension).version();
  }

  function assignRoles(
    address _colony,
    uint256 _rootChildSkillIndex,
    uint256 _domainId,
    bytes32 _extensionId,
    bool _setTo
  )
    internal
  {
    IColony colony = IColony(_colony);
    address extension = installations[_extensionId][_colony][_domainId];
    uint8[] storage extensionRoles = roles[_extensionId];

    for (uint256 i; i < extensionRoles.length; i++) {
      if (extensionRoles[i] == uint8(ColonyDataTypes.ColonyRole.Root)) {
        require(_domainId == 1, "extension-manager-bad-domain");
        colony.setRootRole(extension, _setTo);
      } else if (extensionRoles[i] == uint8(ColonyDataTypes.ColonyRole.Arbitration)) {
        colony.setArbitrationRole(1, _rootChildSkillIndex, extension, _domainId, _setTo);
      } else if (extensionRoles[i] == uint8(ColonyDataTypes.ColonyRole.Architecture)) {
        colony.setArchitectureRole(1, _rootChildSkillIndex, extension, _domainId, _setTo);
      } else if (extensionRoles[i] == uint8(ColonyDataTypes.ColonyRole.Funding)) {
        colony.setFundingRole(1, _rootChildSkillIndex, extension, _domainId, _setTo);
      } else if (extensionRoles[i] == uint8(ColonyDataTypes.ColonyRole.Administration)) {
        colony.setAdministrationRole(1, _rootChildSkillIndex, extension, _domainId, _setTo);
      }
    }
  }
}
