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

pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


library SafeMath {
  function safeToAddInt(int a, int b) public pure returns (bool) {
    return (b >= 0 && a + b >= a) || (b < 0 && a + b < a);
  }

  function safeToSubInt(int a, int b) public pure returns (bool) {
    return (b >= 0 && a - b <= a) || (b < 0 && a - b > a);
  }

  function safeToMulInt(int a, int b) public pure returns (bool) {
    return (b == 0) || (a * b / b == a);
  }

  function addInt(int a, int b) public pure returns (int) {
    require(safeToAddInt(a, b));
    return a + b;
  }

  function subInt(int a, int b) public pure returns (int) {
    require(safeToSubInt(a, b));
    return a - b;
  }

  function mulInt(int a, int b) public pure returns (int) {
    require(safeToMulInt(a, b));
    return a * b;
  }
}