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

import { IWormhole } from "../../lib/wormhole/ethereum/contracts/interfaces/IWormhole.sol";
import { IColonyNetwork } from "../colonyNetwork/IColonyNetwork.sol";
import { IColonyBridge } from "./IColonyBridge.sol";
import { DSAuth } from "../../lib/dappsys/auth.sol";

contract WormholeBridgeForColony is DSAuth, IColonyBridge {
  address colonyNetwork;
  // ChainId => colonyBridge
  mapping(uint256 => address) colonyBridges;

  mapping(uint256 => uint16) public evmChainIdToWormholeChainIdMapping;
  IWormhole public wormhole;

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
      evmChainIdToWormholeChainIdMapping[evmChainIds[i]] = wormholeChainIds[i];
    }
  }

  function supportedEvmChainId(uint256 _evmChainId) public view returns (bool) {
    return evmChainIdToWormholeChainIdMapping[_evmChainId] != 0;
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

  function setColonyBridgeAddress(uint256 evmChainId, address _colonyNetwork) public auth {
    require(evmChainId <= type(uint128).max, "colony-bridge-chainid-too-large");
    uint16 requestedWormholeChainId = evmChainIdToWormholeChainIdMapping[evmChainId];
    colonyBridges[requestedWormholeChainId] = _colonyNetwork;
  }

  function getColonyBridgeAddress(uint256 evmChainId) public view returns (address) {
    uint16 requestedWormholeChainId = evmChainIdToWormholeChainIdMapping[evmChainId];
    return colonyBridges[requestedWormholeChainId];
  }

  function wormholeFormatAddressToEthereumAddress(
    bytes32 _wormholeFormatAddress
  ) public pure returns (address) {
    return address(uint160(uint256(_wormholeFormatAddress)));
  }

  function receiveMessage(bytes memory _vaa) public {
    (IWormhole.VM memory wormholeMessage, bool valid, string memory reason) = wormhole
      .parseAndVerifyVM(_vaa);

    // Check the vaa was valid
    require(valid, reason);

    // Check came from a known colony bridge
    require(
      wormholeFormatAddressToEthereumAddress(wormholeMessage.emitterAddress) ==
        colonyBridges[wormholeMessage.emitterChainId],
      "colony-bridge-bridged-tx-only-from-colony-bridge"
    );

    // We ignore sequence numbers - bridging out of order is okay, because we have our own way of handling that

    // Do the thing

    (bool success, bytes memory returndata) = address(colonyNetwork).call(wormholeMessage.payload);
    if (!success) {
      // Stolen shamelessly from
      // https://ethereum.stackexchange.com/questions/83528/how-can-i-get-the-revert-reason-of-a-call-in-solidity-so-that-i-can-use-it-in-th
      // If the _res length is less than 68, then the transaction failed silently (without a revert message)
      if (returndata.length >= 68) {
        assembly {
          // Slice the sighash.
          returndata := add(returndata, 0x04)
        }
        require(false, abi.decode(returndata, (string))); // All that remains is the revert string
      }
      require(false, "require-execute-call-reverted-with-no-error");
    }

    require(success, "wormhole-bridge-receive-message-failed");
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
