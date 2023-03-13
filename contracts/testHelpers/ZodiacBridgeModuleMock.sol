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

interface IAvatar {
  function execTransactionFromModule(
    address to,
    uint256 value,
    bytes memory data,
    uint8 operation
  ) external returns (bool success);
}

contract ZodiacBridgeModuleMock {
  event SafeTransactionExecuted(bool success);

  address avatar;
  constructor (address _avatar) {
    avatar = _avatar;
  }

  function executeTransaction(address _target, uint256 _value, bytes memory _data, uint8 _operation) public {
    require(_operation == 0, "operation-must-be-zero");
    bool success = IAvatar(avatar).execTransactionFromModule(_target, _value, _data, _operation);
    emit SafeTransactionExecuted(success);
  }
}
