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


contract RequireExecuteCall {
  function executeCall(address target, bytes memory action) public {
    bool success;
    bytes memory returndata;
    (success, returndata) = target.call(action);
    if (!success){
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
  }
}