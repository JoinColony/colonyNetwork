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

pragma solidity 0.8.25;

import { IWormhole } from "../../lib/wormhole/ethereum/contracts/interfaces/IWormhole.sol";
import { IColonyNetwork } from "../colonyNetwork/IColonyNetwork.sol";
import { IColonyBridge } from "./IColonyBridge.sol";
import { CallWithGuards } from "../common/CallWithGuards.sol";
import { DSAuth } from "../../lib/dappsys/auth.sol";

contract WormholeBridgeForColony is DSAuth, IColonyBridge, CallWithGuards {
  address colonyNetwork;
  IWormhole public wormhole;

  // ChainId => colonyBridge
  mapping(uint256 => address) colonyBridges;

  // Maps evm chain id to wormhole chain id
  mapping(uint256 => uint16) public evmChainIdToWormholeChainId;

  modifier onlyColonyNetwork() {
    require(msg.sender == colonyNetwork, "wormhole-bridge-only-colony-network");
    _;
  }

  function setChainIdMapping(
    uint256[] calldata evmChainIds,
    uint16[] calldata wormholeChainIds
  ) public auth {
    require(
      evmChainIds.length == wormholeChainIds.length,
      "colony-bridge-chainid-mapping-length-mismatch"
    );
    for (uint256 i = 0; i < evmChainIds.length; i++) {
      evmChainIdToWormholeChainId[evmChainIds[i]] = wormholeChainIds[i];
    }
  }

  function supportedEvmChainId(uint256 _evmChainId) public view returns (bool) {
    return evmChainIdToWormholeChainId[_evmChainId] != 0;
  }

  function setWormholeAddress(address _wormhole) public auth {
    wormhole = IWormhole(_wormhole);
  }

  function setColonyNetworkAddress(address _colonyNetwork) public auth {
    colonyNetwork = _colonyNetwork;
  }

  function getColonyNetworkAddress() public view returns (address) {
    return colonyNetwork;
  }

  function setColonyBridgeAddress(uint256 evmChainId, address _bridgeAddress) public auth {
    require(evmChainId <= type(uint128).max, "colony-bridge-chainid-too-large");
    uint16 requestedWormholeChainId = evmChainIdToWormholeChainId[evmChainId];
    colonyBridges[requestedWormholeChainId] = _bridgeAddress;
  }

  function getColonyBridgeAddress(uint256 evmChainId) public view returns (address) {
    uint16 requestedWormholeChainId = evmChainIdToWormholeChainId[evmChainId];
    return colonyBridges[requestedWormholeChainId];
  }

  function wormholeAddressToEVMAddress(
    bytes32 _wormholeFormatAddress
  ) public pure returns (address) {
    return address(uint160(uint256(_wormholeFormatAddress)));
  }

  function receiveMessage(bytes memory _vaa) public {
    // VAAs are the primitives used on wormhole (Verified Action Approvals)
    // See https://docs.wormhole.com/wormhole/explore-wormhole/vaa for more details
    // Note that the documentation sometimes also calls them VMs (as does IWormhole)
    // I believe VM stands for 'Verified Message'
    (IWormhole.VM memory wormholeMessage, bool valid, string memory reason) = wormhole
      .parseAndVerifyVM(_vaa);

    // Check the vaa was valid
    require(valid, reason);

    // Check came from a known colony bridge
    require(
      wormholeAddressToEVMAddress(wormholeMessage.emitterAddress) ==
        colonyBridges[wormholeMessage.emitterChainId],
      "colony-bridge-bridged-tx-only-from-colony-bridge"
    );

    // We ignore sequence numbers - bridging out of order is okay, because we have our own way of handling that

    // Make the call requested to the colony network
    (bool success, bytes memory returndata) = callWithGuards(
      colonyNetwork,
      wormholeMessage.payload
    );

    // Note that this is not a require because returndata might not be a string, and if we try
    // to decode it we'll get a revert.
    if (!success) {
      revert(abi.decode(returndata, (string)));
    }
  }

  function sendMessage(
    uint256 evmChainId,
    bytes memory payload
  ) public onlyColonyNetwork returns (bool) {
    require(supportedEvmChainId(evmChainId), "colony-bridge-not-known-chain");
    // This returns a sequence, but we don't care about it
    // The first sequence ID is, I believe 0, so all return values are potentially valid
    // slither-disable-next-line unused-return
    try wormhole.publishMessage(0, payload, 0) {
      return true;
    } catch {
      return false;
    }
  }
}
