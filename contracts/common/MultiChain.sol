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

pragma solidity 0.7.3;



contract MultiChain {
  function getChainId() public view returns (uint256) {
    uint256 id;
    assembly {
        id := chainid()
    }
    return id;
  }

  // Prefixes of 265669 indicate a private forked version of the network
  // used for testing

  function isXdai() internal view returns (bool) {
    uint256 chainId = getChainId();
    return (chainId == 100 || chainId == 265669100);
  }

  function isMainnet() internal view returns (bool) {
    uint256 chainId = getChainId();
    return (chainId == 1 || chainId == 2656691);
  }

  function isGoerli() internal view returns (bool) {
    uint256 chainId = getChainId();
    return (chainId == 5 || chainId == 2656695);
  }
}
