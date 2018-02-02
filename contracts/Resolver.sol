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

import "../lib/dappsys/auth.sol";


contract Resolver is DSAuth {
  struct Pointer { address destination; uint outsize; }
  mapping (bytes4 => Pointer) public pointers;

  function register(string signature, address destination, uint outsize) public
  auth
  {
    pointers[stringToSig(signature)] = Pointer(destination, outsize);
  }

  // Public API
  function lookup(bytes4 sig) public view returns(address, uint) {
    return (destination(sig), outsize(sig));
  }

  // Helpers
  function destination(bytes4 sig) public view returns(address) {
    return pointers[sig].destination;
  }

  function outsize(bytes4 sig) public view returns(uint) {
    if (pointers[sig].destination != 0) {
      // Stored destination and outsize
      return pointers[sig].outsize;
    } else {
      // Default
      return 32;
    }
  }

  function stringToSig(string signature) public pure returns(bytes4) {
    return bytes4(keccak256(signature));
  }
}
