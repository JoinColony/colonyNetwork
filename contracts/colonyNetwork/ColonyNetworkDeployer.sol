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
pragma experimental "ABIEncoderV2";

import "./../common/EtherRouter.sol";
import "./../colony/ColonyAuthority.sol";
import "./../colony/IColony.sol";
import "./ColonyNetworkStorage.sol";
import "./IColonyNetwork.sol";


contract ColonyNetworkDeployer is ColonyNetworkStorage {

  function createMetaColony(address _tokenAddress) public
  stoppable
  auth
  {
    require(metaColony == address(0x0), "colony-meta-colony-exists-already");

    metaColony = createColony(_tokenAddress, currentColonyVersion, "", "");

    // Add the special mining skill
    reputationMiningSkillId = IColonyNetwork(address(this)).addSkill(skillCount - 1);

    emit MetaColonyCreated(metaColony, _tokenAddress, skillCount);
  }

  /// @notice @deprecated only deploys version 3 colonies.
  function createColony(address _tokenAddress) public
  stoppable
  returns (address)
  {
    return createColony(_tokenAddress, 3, "", "");
  }

  /// @notice @deprecated only deploys version 4 colonies.
  function createColony(
    address _tokenAddress,
    uint256 _version, // solhint-disable-line no-unused-vars
    string memory _colonyName,
    string memory _orbitdb, // solhint-disable-line no-unused-vars
    bool _useExtensionManager // solhint-disable-line no-unused-vars
  ) public stoppable returns (address)
  {
    return createColony(_tokenAddress, 4, _colonyName, "");
  }

  function createColony(
    address _tokenAddress,
    uint256 _version,
    string memory _colonyName
  ) public stoppable returns (address)
  {
    return createColony(_tokenAddress, _version, _colonyName, "");
  }

  function createColony(
    address _tokenAddress,
    uint256 _version,
    string memory _colonyName,
    string memory _metadata
  ) public stoppable returns (address)
  {
    uint256 version = (_version == 0) ? currentColonyVersion : _version;
    address colonyAddress = deployColony(_tokenAddress, version);

    if (bytes(_colonyName).length > 0) {
      IColony(colonyAddress).registerColonyLabel(_colonyName, "");
    }

    if (keccak256(abi.encodePacked(_metadata)) != keccak256(abi.encodePacked(""))) {
      IColony(colonyAddress).editColony(_metadata);
    }

    setFounderPermissions(colonyAddress);

    return colonyAddress;
  }

  function deployColony(address _tokenAddress, uint256 _version) internal returns (address) {
    require(_tokenAddress != address(0x0), "colony-token-invalid-address");
    require(colonyVersionResolver[_version] != address(0x00), "colony-network-invalid-version");

    EtherRouter etherRouter = new EtherRouter();
    IColony colony = IColony(address(etherRouter));

    address resolverForColonyVersion = colonyVersionResolver[_version]; // ignore-swc-107
    etherRouter.setResolver(resolverForColonyVersion); // ignore-swc-113

    // Creating new instance of colony's authority
    ColonyAuthority colonyAuthority = new ColonyAuthority(address(colony));

    DSAuth dsauth = DSAuth(etherRouter);
    dsauth.setAuthority(colonyAuthority);

    colonyAuthority.setOwner(address(etherRouter));

    // Initialise the domain tree with defaults by just incrementing the skillCount
    skillCount += 1;
    colonyCount += 1;
    colonies[colonyCount] = address(colony);
    _isColony[address(colony)] = true;

    colony.initialiseColony(address(this), _tokenAddress);

    emit ColonyAdded(colonyCount, address(etherRouter), _tokenAddress);

    return address(etherRouter);
  }

  function setFounderPermissions(address _colonyAddress) internal {
    require(DSAuth(_colonyAddress).owner() == address(this), "colony-network-not-colony-owner");

    // Assign all permissions in root domain
    IColony colony = IColony(_colonyAddress);
    colony.setRecoveryRole(msgSender());
    colony.setRootRole(msgSender(), true);
    colony.setArbitrationRole(1, UINT256_MAX, msgSender(), 1, true);
    colony.setArchitectureRole(1, UINT256_MAX, msgSender(), 1, true);
    colony.setFundingRole(1, UINT256_MAX, msgSender(), 1, true);
    colony.setAdministrationRole(1, UINT256_MAX, msgSender(), 1, true);

    // Colony will not have owner
    DSAuth dsauth = DSAuth(_colonyAddress);
    dsauth.setOwner(address(0x0));
  }
}
