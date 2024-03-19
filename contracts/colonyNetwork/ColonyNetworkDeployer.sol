// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.23;
pragma experimental "ABIEncoderV2";

import { EtherRouter } from "./../common/EtherRouter.sol";
import { ColonyAuthority } from "./../colony/ColonyAuthority.sol";
import { IColony } from "./../colony/IColony.sol";
import { ColonyNetworkStorage } from "./ColonyNetworkStorage.sol";
import { IColonyNetwork } from "./IColonyNetwork.sol";
import { MetaTxToken } from "./../metaTxToken/MetaTxToken.sol";
import { DSAuth, DSAuthority } from "./../../lib/dappsys/auth.sol";

contract ColonyNetworkDeployer is ColonyNetworkStorage {
  function createMetaColony(address _tokenAddress) public stoppable auth {
    require(metaColony == address(0x0), "colony-meta-colony-exists-already");

    metaColony = createColony(_tokenAddress, currentColonyVersion, "", "");

    // The mining skill used to be created here, but with the move to
    // multi-chain, it now happens in initialiseReputationMining

    emit MetaColonyCreated(metaColony, _tokenAddress, skillCount);
  }

  /// @notice @deprecated only deploys version 3 colonies.
  function createColony(address _tokenAddress) public stoppable returns (address) {
    return createColony(_tokenAddress, 3, "", "");
  }

  /// @notice @deprecated only deploys version 4 colonies.
  function createColony(
    address _tokenAddress,
    uint256 _version, // solhint-disable-line no-unused-vars
    string memory _colonyName,
    string memory _orbitdb, // solhint-disable-line no-unused-vars
    bool _useExtensionManager // solhint-disable-line no-unused-vars
  ) public stoppable returns (address) {
    return createColony(_tokenAddress, 4, _colonyName, "");
  }

  function createColony(
    address _tokenAddress,
    uint256 _version,
    string memory _colonyName
  ) public stoppable returns (address) {
    return createColony(_tokenAddress, _version, _colonyName, "");
  }

  function createColony(
    address _tokenAddress,
    uint256 _version,
    string memory _colonyName,
    string memory _metadata
  ) public stoppable returns (address) {
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

  function createColonyForFrontend(
    address _tokenAddress,
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    uint256 _version,
    string memory _colonyName,
    string memory _metadata
  ) public stoppable returns (address token, address colony) {
    // Create Token
    MetaTxToken token;
    if (_tokenAddress == address(0x0)) {
      token = MetaTxToken(
        IColonyNetwork(address(this)).deployTokenViaNetwork(_name, _symbol, _decimals)
      );
      emit TokenDeployed(address(token));
    } else {
      token = MetaTxToken(_tokenAddress);
    }

    // Create Colony
    address colonyAddress = createColony(address(token), _version, _colonyName, _metadata);

    // Extra token bookkeeping if we deployed it
    if (_tokenAddress == address(0x0)) {
      // Deploy Authority
      address[] memory allowedToTransfer = new address[](1);
      allowedToTransfer[0] = tokenLocking;
      address tokenAuthorityAddress = IColonyNetwork(address(this)).deployTokenAuthority(
        address(token),
        colonyAddress,
        allowedToTransfer
      );
      // Set Authority
      token.setAuthority(DSAuthority(tokenAuthorityAddress));
      token.setOwner(msgSender());
    }

    return (address(token), colonyAddress);
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

    colonyCount += 1;
    colonies[colonyCount] = address(colony);
    _isColony[address(colony)] = true;

    // Initialise the domain tree with defaults by just incrementing the skillCount
    skillCount += 1;

    // If we're not mining chain, then bridge the skill
    IColonyNetwork(address(this)).bridgeSkillIfNotMiningChain(skillCount);

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
