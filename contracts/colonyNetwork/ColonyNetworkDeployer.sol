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

pragma solidity 0.8.27;
pragma experimental "ABIEncoderV2";
import { EtherRouter } from "./../common/EtherRouter.sol";
import { Resolver } from "./../common/Resolver.sol";
import { ColonyAuthority } from "./../colony/ColonyAuthority.sol";
import { IColony } from "./../colony/IColony.sol";
import { ColonyNetworkStorage } from "./ColonyNetworkStorage.sol";
import { IColonyNetwork } from "./IColonyNetwork.sol";
import { MetaTxToken } from "./../metaTxToken/MetaTxToken.sol";
import { DSAuth, DSAuthority } from "./../../lib/dappsys/auth.sol";
import { ICreateX } from "./../../lib/createx/src/ICreateX.sol";
import { EtherRouterCreate3 } from "./../common/EtherRouterCreate3.sol";
import { IColonyBridge } from "./../bridging/IColonyBridge.sol";
import { DomainTokenReceiver } from "./../common/DomainTokenReceiver.sol";
import { DomainReceiverManagement } from "./../common/DomainReceiverManagement.sol";

contract ColonyNetworkDeployer is ColonyNetworkStorage, DomainReceiverManagement {
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

  function createProxyColony(
    uint256 _destinationChainId,
    bytes32 _salt
  ) public stoppable calledByColony {
    // TODO: Check if the colony is allowed to use the salt
    bytes memory payload = abi.encodeWithSignature("createProxyColonyFromBridge(bytes32)", _salt);
    require(
      IColonyBridge(colonyBridgeAddress).sendMessage(_destinationChainId, address(this), payload),
      "colony-network-create-proxy-colony-failed"
    );
  }

  /**
   * @dev Generates pseudo-randomly a salt value using a diverse selection of block and
   * transaction properties.
   * @return salt The 32-byte pseudo-random salt value.
   */
  function getColonyCreationSalt() public view returns (bytes32 salt) {
    // We only want Colony Networks to be able to deploy to the same address,
    // so we use the permissioned deploy protection feature of CreateX, and set
    // the first 160 bits of the salt to the address of this contract.

    salt = bytes32(uint256(uint160(address(this)))) << 96;
    bytes32 additionalSalt;
    // This portion of the function has been adapted from the CreateX library licensed under AGPL-3.0-only
    // NB it is only pseudo-random but that is sufficient for our purposes
    // The fact we are doing this means that a caller cannot make two colonies in the same transaction
    unchecked {
      additionalSalt = keccak256(
        abi.encode(
          // We don't use `block.number - 256` (the maximum value on the EVM) to accommodate
          // any chains that may try to reduce the amount of available historical block hashes.
          // We also don't subtract 1 to mitigate any risks arising from consecutive block
          // producers on a PoS chain. Therefore, we use `block.number - 32` as a reasonable
          // compromise, one we expect should work on most chains, which is 1 epoch on Ethereum
          // mainnet. Please note that if you use this function between the genesis block and block
          // number 31, the block property `blockhash` will return zero, but the returned salt value
          // `salt` will still have a non-zero value due to the hashing characteristic and the other
          // remaining properties.
          blockhash(block.number - 32),
          block.coinbase,
          block.number,
          block.timestamp,
          block.prevrandao,
          block.chainid,
          msgSender()
        )
      );
    }

    // We use the first 88 bits of the additional salt to add entropy in the last 88 bits of the salt
    salt = salt | (additionalSalt >> 168);
    // We have set the first 160 bits, and the last 88 bits of the salt
    // Note that this leaves byte 21 of the salt as zero (0x00), which disables cross-chain
    // redeployment protection in createX.
    // This is intentional, as we want to allow the same Colony to be deployed on different chains
  }

  function setDomainTokenReceiverResolver(address _resolver) public stoppable auth {
    domainReceiverResolverAddress = _resolver;
  }

  function getDomainTokenReceiverResolver() public view override stoppable returns (address) {
    return domainReceiverResolverAddress;
  }

<<<<<<< HEAD
  function idempotentDeployDomainTokenReceiver(
    uint256 _domainId
  ) public stoppable calledByColony returns (address domainTokenReceiverAddress) {
    // Calculate the address the domain should be receiving funds at
    domainTokenReceiverAddress = getDomainTokenReceiverAddress(msgSender(), _domainId);

    if (!isContract(domainTokenReceiverAddress)) {
      // Then deploy the contract
      bytes32 salt = getDomainTokenReceiverDeploySalt(msgSender(), _domainId);
      address deployedAddress = deployEtherRouterViaCreateX(salt);
      require(
        deployedAddress == domainTokenReceiverAddress,
        "colony-network-domain-receiver-deploy-wrong-address"
      );
    }

    // Check it's got the right resolver
    try EtherRouter(payable(domainTokenReceiverAddress)).resolver() returns (Resolver resolver) {
      if (address(resolver) != domainReceiverResolverAddress) {
        EtherRouter(payable(domainTokenReceiverAddress)).setResolver(domainReceiverResolverAddress);
      }
    } catch {
      revert("colony-network-domain-receiver-not-etherrouter");
    }

    // Check it's set up correctly

    if (DomainTokenReceiver(domainTokenReceiverAddress).getColonyAddress() != msgSender()) {
      DomainTokenReceiver(domainTokenReceiverAddress).setColonyAddress(msgSender());
    }

    return domainTokenReceiverAddress;
  }

  function getDomainTokenReceiverAddress(
    address _colony,
    uint256 _domainId
  ) public view returns (address) {
    bytes32 salt = getDomainTokenReceiverDeploySalt(_colony, _domainId);

    // To get the correct address, we have to mimic the _guard functionality of CreateX
    bytes32 guardedSalt = keccak256(abi.encode(bytes32(uint256(uint160(address(this)))), salt));
    return ICreateX(CREATEX_ADDRESS).computeCreate3Address(guardedSalt);
  }

  function getDomainTokenReceiverDeploySalt(
    address _colony,
    uint256 _domainId
  ) internal view returns (bytes32) {
    // Calculate the address the domain should be receiving funds at
    // We only want Colony Networks to be able to deploy to the same address,
    // so we use the permissioned deploy protection feature of CreateX, and set
    // the first 160 bits of the salt to the address of this contract.

    bytes32 salt = bytes32(uint256(uint160(address(this)))) << 96;

    bytes32 additionalSalt = keccak256(abi.encode(_colony, _domainId));
    // We use the first 88 bits of the additional salt, which is a function of the colony and domainId,
    // to add entropy in the last 88 bits of the salt
    salt = salt | (additionalSalt >> 168);
    // We have set the first 160 bits, and the last 88 bits of the salt
    // Note that this leaves byte 21 of the salt as zero (0x00), which disables cross-chain
    // redeployment protection in createX.
    // This is intentional, as we want to allow the same receiver to be deployed on different chains
    return salt;
||||||| parent of 125a5a92 (First pass at cross-chain domain-level token swaps)
  function checkDomainTokenReceiverDeployed(
    uint256 _domainId
  ) public calledByColony returns (address domainTokenReceiverAddress) {
    // Calculate the address the domain should be receiving funds at
    domainTokenReceiverAddress = getDomainTokenReceiverAddress(msgSender(), _domainId);

    if (!isContract(domainTokenReceiverAddress)) {
      // Then deploy the contract
      bytes32 salt = getDomainTokenReceiverDeploySalt(msgSender(), _domainId);
      ICreateX(CREATEX_ADDRESS).deployCreate3AndInit(
        salt,
        type(EtherRouterCreate3).creationCode,
        abi.encodeWithSignature("setOwner(address)", (address(this))),
        ICreateX.Values(0, 0)
      );
    }

    // Check it's got the right resolver
    try EtherRouter(payable(domainTokenReceiverAddress)).resolver() returns (Resolver resolver) {
      if (address(resolver) != domainReceiverResolverAddress) {
        EtherRouter(payable(domainTokenReceiverAddress)).setResolver(domainReceiverResolverAddress);
      }
    } catch {
      revert("colony-network-domain-receiver-not-etherrouter");
    }

    // Check it's set up correctly

    if (DomainTokenReceiver(domainTokenReceiverAddress).getColonyAddress() != msgSender()) {
      DomainTokenReceiver(domainTokenReceiverAddress).setColonyAddress(msgSender());
    }

    return domainTokenReceiverAddress;
  }

  function isContract(address addr) internal view returns (bool) {
    uint256 size;
    assembly {
      size := extcodesize(addr)
    }
    return size > 0;
  }

  function getDomainTokenReceiverAddress(
    address _colony,
    uint256 _domainId
  ) public view returns (address) {
    bytes32 salt = getDomainTokenReceiverDeploySalt(_colony, _domainId);

    // To get the correct address, we have to mimic the _guard functionality of CreateX
    bytes32 guardedSalt = keccak256(abi.encode(bytes32(uint256(uint160(address(this)))), salt));
    return ICreateX(CREATEX_ADDRESS).computeCreate3Address(guardedSalt);
  }

  function getDomainTokenReceiverDeploySalt(
    address _colony,
    uint256 _domainId
  ) internal view returns (bytes32) {
    // Calculate the address the domain should be receiving funds at
    // We only want Colony Networks to be able to deploy to the same address,
    // so we use the permissioned deploy protection feature of CreateX, and set
    // the first 160 bits of the salt to the address of this contract.

    bytes32 salt = bytes32(uint256(uint160(address(this)))) << 96;

    bytes32 additionalSalt = keccak256(abi.encode(_colony, _domainId));
    // We use the first 88 bits of the additional salt, which is a function of the colony and domainId,
    // to add entropy in the last 88 bits of the salt
    salt = salt | (additionalSalt >> 168);
    // We have set the first 160 bits, and the last 88 bits of the salt
    // Note that this leaves byte 21 of the salt as zero (0x00), which disables cross-chain
    // redeployment protection in createX.
    // This is intentional, as we want to allow the same receiver to be deployed on different chains
    return salt;
=======
  function msgSenderIsColony() internal view override returns (bool) {
    require(_isColony[msgSender()], "colony-caller-must-be-colony");
    assert(msgSender() == msg.sender);
    return true;
>>>>>>> 125a5a92 (First pass at cross-chain domain-level token swaps)
  }

  function isStopped() internal view override returns (bool) {
    return recoveryMode;
  }

  function deployColony(address _tokenAddress, uint256 _version) internal returns (address) {
    require(_tokenAddress != address(0x0), "colony-token-invalid-address");
    require(colonyVersionResolver[_version] != address(0x00), "colony-network-invalid-version");

    // This is a psuedo-random salt value used when a user creates a colony themselves. When a colony wants
    // to deploy to the same address on another chain, it will provide the same salt value as was generated
    // when it was created via a cross-chain call (to an as-yet unwritten function).
    bytes32 salt = getColonyCreationSalt();
    // EtherRouter etherRouter = new EtherRouter();
    address colonyAddress = deployEtherRouterViaCreateX(salt);

    IColony colony = IColony(colonyAddress);

    address resolverForColonyVersion = colonyVersionResolver[_version]; // ignore-swc-107
    EtherRouter etherRouter = EtherRouter(payable(colonyAddress));
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

  function deployEtherRouterViaCreateX(bytes32 _salt) internal returns (address) {
    EtherRouter etherRouter = EtherRouter(
      payable(
        ICreateX(CREATEX_ADDRESS).deployCreate3AndInit(
          _salt,
          type(EtherRouterCreate3).creationCode,
          abi.encodeWithSignature("setOwner(address)", (address(this))),
          ICreateX.Values(0, 0)
        )
      )
    );
    return address(etherRouter);
  }
}
