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

import { MetaTransactionMsgSender } from "./MetaTransactionMsgSender.sol";
import { DomainTokenReceiver } from "./DomainTokenReceiver.sol";
import { ICreateX } from "./../../lib/createx/src/ICreateX.sol";
import { EtherRouterCreate3 } from "./EtherRouterCreate3.sol";
import { EtherRouter } from "./EtherRouter.sol";
import { Resolver } from "./Resolver.sol";
import { IsContract } from "./IsContract.sol";

abstract contract DomainReceiverManagement is MetaTransactionMsgSender, IsContract {
  address constant CREATEX_ADDRESS = 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed;

  function getDomainTokenReceiverResolver() public view virtual returns (address);
  function msgSenderIsColony() internal view virtual returns (bool);

  function checkDomainTokenReceiverDeployed(
    uint256 _domainId
  ) public returns (address domainTokenReceiverAddress) {
    require(msgSenderIsColony(), "colony-domain-receiver-management-not-colony");

    // Calculate the address the domain should be receiving funds at
    domainTokenReceiverAddress = getDomainTokenReceiverAddress(msgSender(), _domainId);

    if (!isContract(domainTokenReceiverAddress)) {
      // Then deploy the contract
      bytes32 salt = getDomainTokenReceiverDeploySalt(msgSender(), _domainId);
      address newContract = ICreateX(CREATEX_ADDRESS).deployCreate3AndInit(
        salt,
        type(EtherRouterCreate3).creationCode,
        abi.encodeWithSignature("setOwner(address)", (address(this))),
        ICreateX.Values(0, 0)
      );
      require(
        newContract == domainTokenReceiverAddress,
        "colony-network-domain-receiver-deploy-wrong-address"
      );
    }

    // Check it's got the right resolver
    try EtherRouter(payable(domainTokenReceiverAddress)).resolver() returns (Resolver resolver) {
      if (address(resolver) != getDomainTokenReceiverResolver()) {
        EtherRouter(payable(domainTokenReceiverAddress)).setResolver(
          getDomainTokenReceiverResolver()
        );
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
  }
}
