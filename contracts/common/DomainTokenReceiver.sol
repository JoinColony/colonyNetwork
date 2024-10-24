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

pragma solidity 0.8.27; // ignore-swc-103
import { ERC20Extended } from "./ERC20Extended.sol";
import { DSAuth } from "./../../lib/dappsys/auth.sol";

contract DomainTokenReceiver is DSAuth {
  address resolver; // Storage slot 2 (from DSAuth there is authority and owner at storage slots 0 and 1 respectively)

  address colony;

  function getColonyAddress() public view returns (address) {
    return colony;
  }

  function setColonyAddress(address _colony) public auth {
    require(colony == address(0), "domain-token-receiver-colony-already-set");
    colony = _colony;
  }

  function transferToColony(address tokenAddress) public {
    // Transfer the token to the colony.
    if (tokenAddress == address(0)) {
      // slither-disable-next-line arbitrary-send-eth
      payable(colony).transfer(address(this).balance);
      return;
    } else {
      uint256 balanceToTransfer = ERC20Extended(tokenAddress).balanceOf(address(this));
      require(
        ERC20Extended(tokenAddress).transfer(colony, balanceToTransfer),
        "domain-token-receiver-transfer-failed"
      );
    }
  }
}
