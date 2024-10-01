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
pragma experimental ABIEncoderV2;

import { CallWithGuards } from "../common/CallWithGuards.sol";
import { DSAuth } from "./../../lib/dappsys/auth.sol";
import { ERC20Extended } from "./../common/ERC20Extended.sol";
import { Multicall } from "./../common/Multicall.sol";
import { IColonyNetwork } from "./../colonyNetwork/IColonyNetwork.sol";
import { ProxyColonyNetwork } from "./ProxyColonyNetwork.sol";
import { DomainTokenReceiver } from "./../common/DomainTokenReceiver.sol";
import { BasicMetaTransaction } from "./../common/BasicMetaTransaction.sol";

contract ProxyColony is DSAuth, Multicall, CallWithGuards, BasicMetaTransaction {
  // Address of the Resolver contract used by EtherRouter for lookups and routing
  address resolver; // Storage slot 2 (from DSAuth there is authority and owner at storage slots 0 and 1 respectively)

  mapping(address => uint256) metatransactionNonces;

  // Token address => known balance
  mapping(address => uint256) tokenBalances;

  // Events

  modifier onlyColonyBridge() {
    require(ProxyColonyNetwork(owner).colonyBridgeAddress() == msgSender(), "colony-only-bridge");
    _;
  }

  event DomainFundsClaimed(address token, uint256 _domainId, uint256 balance);
  event TransferMade(address token, address user, uint256 amount);

  // Public functions

  function claimTokens(address _token) public {
    uint256 balance = (_token == address(0x0))
      ? address(this).balance
      : ERC20Extended(_token).balanceOf(address(this));

    require(balance >= tokenBalances[_token], "colony-shell-token-bookkeeping-error");
    uint256 difference = balance - tokenBalances[_token];

    tokenBalances[_token] = balance;

    bytes memory payload = abi.encodeWithSignature(
      "recordClaimedFundsFromBridge(uint256,address,uint256,uint256)",
      block.chainid,
      _token,
      1,
      difference
    );
    ProxyColonyNetwork(owner).bridgeMessage(payload);

    emit DomainFundsClaimed(_token, 1, balance);
  }

  function claimTokensForDomain(address _token, uint256 _domainId) public {
    address domainTokenReceiverAddress = ProxyColonyNetwork(owner).checkDomainTokenReceiverDeployed(
      _domainId
    );

    uint256 balance = (_token == address(0x0))
      ? address(domainTokenReceiverAddress).balance
      : ERC20Extended(_token).balanceOf(address(domainTokenReceiverAddress));

    DomainTokenReceiver(domainTokenReceiverAddress).transferToColony(_token);

    bytes memory payload = abi.encodeWithSignature(
      "recordClaimedFundsFromBridge(uint256,address,uint256,uint256)",
      block.chainid,
      _token,
      _domainId,
      balance
    );

    ProxyColonyNetwork(owner).bridgeMessage(payload);

    emit DomainFundsClaimed(_token, _domainId, balance);
  }

  // TODO: secure this function
  function transferFromBridge(
    address _token,
    address _recipient,
    uint256 _amount
  ) public onlyColonyBridge {
    tokenBalances[_token] -= _amount;

    if (_token == address(0x0)) {
      payable(_recipient).transfer(_amount);
    } else {
      require(ERC20Extended(_token).transfer(_recipient, _amount), "colony-shell-transfer-failed");
    }

    emit TransferMade(_token, _recipient, _amount);
  }

  function makeArbitraryTransactions(
    address[] memory _targets,
    bytes[] memory _payloads
  ) public onlyColonyBridge {
    require(_targets.length == _payloads.length, "colony-targets-and-payloads-length-mismatch");
    address bridgeAddress = ProxyColonyNetwork(owner).colonyBridgeAddress();
    for (uint256 i; i < _targets.length; i += 1) {
      // TODO: Stop, or otherwise handle, approve / transferFrom
      require(_targets[i] != bridgeAddress, "colony-cannot-target-bridge");
      require(_targets[i] != owner, "colony-cannot-target-network");
      // TODO: Allowing calling ourselves is okay for now, but as we add functionality might not be?
      (bool success, bytes memory returndata) = callWithGuards(_targets[i], _payloads[i]);

      // Note that this is not a require because returndata might not be a string, and if we try
      // to decode it we'll get a revert.
      if (!success) {
        revert(abi.decode(returndata, (string)));
      }
    }
  }

  // Overloading functions from BasicMetaTransaction
  function getMetatransactionNonce(address _user) public view override returns (uint256 nonce) {
    return metatransactionNonces[_user];
  }

  // NB if implementing this functionality in a contract with recovery mode,
  // you MUST prevent the metatransaction nonces from being editable with recovery mode.
  function incrementMetatransactionNonce(address _user) internal override {
    metatransactionNonces[_user] += 1;
  }
}
