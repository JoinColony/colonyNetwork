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
pragma experimental ABIEncoderV2;

import "./../common/BasicMetaTransaction.sol";
import "./ColonyExtension.sol";

abstract contract ColonyExtensionMeta is ColonyExtension, BasicMetaTransaction {

  mapping (address => uint256) metatransactionNonces;

  function getMetatransactionNonce(address _user) override public view returns (uint256 nonce) {
    return metatransactionNonces[_user];
  }

  function incrementMetatransactionNonce(address _user) override internal {
    metatransactionNonces[_user] += 1;
  }

  uint256 placeholder00;
  uint256 placeholder01;
  uint256 placeholder02;
  uint256 placeholder03;
  uint256 placeholder04;
  uint256 placeholder05;
  uint256 placeholder06;
  uint256 placeholder07;
  uint256 placeholder08;
  uint256 placeholder09;
  uint256 placeholder10;
  uint256 placeholder11;
  uint256 placeholder12;
  uint256 placeholder13;
  uint256 placeholder14;
  uint256 placeholder15;
  uint256 placeholder16;
  uint256 placeholder17;
  uint256 placeholder18;
  uint256 placeholder19;
  uint256 placeholder20;
  uint256 placeholder21;
  uint256 placeholder22;
  uint256 placeholder23;
  uint256 placeholder24;
  uint256 placeholder25;
  uint256 placeholder26;
  uint256 placeholder27;
  uint256 placeholder28;
  uint256 placeholder29;
  uint256 placeholder30;
  uint256 placeholder31;
}
