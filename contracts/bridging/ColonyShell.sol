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
pragma experimental ABIEncoderV2;

import { BasicMetaTransaction } from "./../common/BasicMetaTransaction.sol";
import { CallWithGuards } from "../common/CallWithGuards.sol";
import { DSAuth } from "./../../lib/dappsys/auth.sol";
import { ERC20Extended } from "./../common/ERC20Extended.sol";
import { Multicall } from "./../common/Multicall.sol";
import { IColonyNetwork } from "./../colonyNetwork/IColonyNetwork.sol";

contract ColonyShell is DSAuth, BasicMetaTransaction, Multicall, CallWithGuards {
  // Address of the Resolver contract used by EtherRouter for lookups and routing
  address resolver; // Storage slot 2 (from DSAuth there is authority and owner at storage slots 0 and 1 respectively)

  mapping(address => uint256) metatransactionNonces;

  function getMetatransactionNonce(address _user) public view override returns (uint256 _nonce) {
    return metatransactionNonces[_user];
  }

  function incrementMetatransactionNonce(address _user) internal override {
    metatransactionNonces[_user] += 1;
  }

  // Events

  event ColonyFundsClaimed(address token, uint256 balance);
  event TransferMade(address token, address user, uint256 amount);

  // Public functions

  function claimColonyShellFunds(address _token) public {
    uint256 balance = (_token == address(0x0))
      ? address(this).balance
      : ERC20Extended(_token).balanceOf(address(this));

    IColonyNetwork(owner).sendClaimColonyShellFunds(_token, balance);

    emit ColonyFundsClaimed(_token, balance);
  }

  function transfer(address _token, address _user, uint256 _amount) public auth {
    require(ERC20Extended(_token).transfer(_user, _amount), "colony-shell-transfer-failed");

    emit TransferMade(_token, _user, _amount);
  }
}
