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

import { BasicMetaTransaction } from "./../common/BasicMetaTransaction.sol";
import { CallWithGuards } from "../common/CallWithGuards.sol";
import { DSAuth } from "./../../lib/dappsys/auth.sol";
import { ERC20Extended } from "./../common/ERC20Extended.sol";
import { Multicall } from "./../common/Multicall.sol";
import { IColonyNetwork } from "./../colonyNetwork/IColonyNetwork.sol";
import { EtherRouterCreate3 } from "./../common/EtherRouterCreate3.sol";
import { ICreateX } from "./../../lib/createx/src/ICreateX.sol";
import { EtherRouter } from "./../common/EtherRouter.sol";
import { IColonyBridge } from "./IColonyBridge.sol";

contract ProxyColonyNetwork is DSAuth, Multicall, CallWithGuards {
  address resolver; // Storage slot 2 (from DSAuth there is authority and owner at storage slots 0 and 1 respectively)

  address constant CREATEX_ADDRESS = 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed;

  address public colonyBridgeAddress;
  uint256 public homeChainId;
  address public proxyColonyResolverAddress;
  mapping(address => bool) public shellColonies;

  /// @notice Event logged when the colony network has data about a bridge contract set.
  /// @param bridgeAddress The address of the bridge contract that will be interacted with
  event BridgeSet(address bridgeAddress);

  modifier onlyColony() {
    require(shellColonies[msgSender()], "colony-network-caller-must-be-proxy-colony");
    _;
  }

  modifier onlyColonyBridge() {
    require(msgSender() == colonyBridgeAddress, "colony-network-caller-must-be-colony-bridge");
    _;
  }

  modifier ownerOrBridge() {
    require(
      msgSender() == colonyBridgeAddress || msgSender() == owner,
      "colony-network-caller-must-be-owner-or-bridge"
    );
    _;
  }

  function setColonyBridgeAddress(address _bridgeAddress) public ownerOrBridge {
    // TODO: Move this somewhere else to guard against unsupported chainids
    // require(_chainId <= type(uint128).max, "colony-network-chainid-too-large");

    colonyBridgeAddress = _bridgeAddress;
    // TODO: Move this to where the first

    emit BridgeSet(_bridgeAddress);
  }

  function setProxyColonyResolverAddress(address _resolver) public auth {
    proxyColonyResolverAddress = _resolver;
  }

  function setHomeChainId(uint256 _homeChainId) public auth {
    homeChainId = _homeChainId;
  }

  function createProxyColonyFromBridge(bytes32 _salt) public onlyColonyBridge {
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

    shellColonies[address(etherRouter)] = true;

    etherRouter.setResolver(proxyColonyResolverAddress); // ignore-swc-113
  }

  function bridgeMessage(bytes memory _payload) public onlyColony {
    require(
      IColonyBridge(colonyBridgeAddress).sendMessage(homeChainId, msg.sender, _payload),
      "colony-network-bridge-message-failed"
    );
  }
}
