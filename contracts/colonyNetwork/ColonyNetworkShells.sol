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

import { IColony } from "./../colony/IColony.sol";
import { Multicall } from "./../common/Multicall.sol";
import { ColonyNetworkStorage } from "./ColonyNetworkStorage.sol";
import { ShellColony } from "./../bridging/ShellColony.sol";

contract ColonyNetworkShells is ColonyNetworkStorage, Multicall {
  // To shells

  function sendDeployShellColony(bytes32 _salt) public calledByColony {
    bytes memory payload = abi.encodeWithSignature("deployShellColony(bytes32)", _salt);

    require(callThroughBridgeWithGuards(payload), "colony-network-shell-deploy-failed");
  }

  function ShellColonyTransfer(
    address _colony,
    address _token,
    address _user,
    uint256 _amount
  ) public onlyColonyBridge {
    ShellColony(_colony).transfer(_token, _user, _amount);
  }

  function sendShellColonyTransfer(
    address _token,
    address _user,
    uint256 _amount
  ) public calledByColony {
    bytes memory payload = abi.encodeWithSignature(
      "ShellColonyTransfer(address,address,address,uint256)",
      msgSender(),
      _token,
      _user,
      _amount
    );

    require(callThroughBridgeWithGuards(payload), "colony-network-shell-transfer-failed");
  }

  // From shells

  function sendClaimShellColonyFunds(address _token, uint256 _balance) public calledByColony {
    bytes memory payload = abi.encodeWithSignature(
      "claimShellColonyFunds(address,address,uint256)",
      msgSender(),
      _token,
      _balance
    );

    require(callThroughBridgeWithGuards(payload), "colony-network-shell-claim-failed");
  }
}
