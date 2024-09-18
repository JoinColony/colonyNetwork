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

import { ColonyExtensionMeta } from "./../extensions/ColonyExtensionMeta.sol";
import { IColony } from "../colony/IColony.sol";
import { ERC20Extended } from "../common/ERC20Extended.sol";

contract LiFiFacetProxyMock {
  event SwapTokens(
    uint256 _fromChainId,
    address _fromToken,
    uint256 _toChainId,
    address _toToken,
    address _toAddress,
    uint256 _amount
  );

  function swapTokensMock(
    uint256 _fromChainId,
    address _fromToken,
    uint256 _toChainId,
    address _toToken,
    address _toAddress,
    uint256 _amount
  ) external payable {
    if (_fromToken == address(0)) {
      require(msg.value == _amount, "LiFiFacetProxyMock-ether-amount-mismatch");
    } else {
      require(
        ERC20Extended(_fromToken).transferFrom(msg.sender, address(this), _amount),
        "LiFiFacetProxyMock-transferFrom-failed"
      );
    }

    // And then emit an event that... maybe some dev utility will listen for?
    emit SwapTokens(_fromChainId, _fromToken, _toChainId, _toToken, _toAddress, _amount);
  }

  fallback() external payable {
    revert("LiFiFacetProxyMock-unimplemented-function");
  }

  receive() external payable {
    revert("LiFiFacetProxyMock-unimplemented-function-2");
  }
}
