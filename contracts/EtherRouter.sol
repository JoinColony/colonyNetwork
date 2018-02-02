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

import "./Resolver.sol";
import "../lib/dappsys/auth.sol";


contract EtherRouter is DSAuth {
  Resolver public resolver;

  function() payable external {
    if (msg.sig == 0x0) {
      return;
    }
    // Contracts that want to receive Ether with a plain "send" have to implement
    // a fallback function with the payable modifier. Contracts now throw if no payable
    // fallback function is defined and no function matches the signature.
    // However, 'send' only provides 2300 gas, which is not enough for EtherRouter
    // so we shortcut it here.
    //
    // Note that this means we can never have a fallback function that 'does' stuff.
    // but those only really seem to be ICOs, to date. To be explicit, there is a hard
    // decision to be made here. Either:
    // 1. Contracts that use 'send' or 'transfer' cannot send money to Colonies/ColonyNetwork
    // 2. We commit to never using a fallback function that does anything.
    //
    // If we wish to have such a fallback function for a Colony, it could be in a separate
    // contract.

    uint r;

    // Get routing information for the called function
    var (destination, outsize) = resolver.lookup(msg.sig);

    // Make the call
    assembly {
      calldatacopy(mload(0x40), 0, calldatasize)
      r := delegatecall(sub(gas, 700), destination, mload(0x40), calldatasize, mload(0x40), outsize)
    }

    // Check the call is successful
    require(r == 1);

    // Pass on the return value
    assembly {
      return(mload(0x40), outsize)
    }
  }

  function setResolver(address _resolver) public
  auth
  {
    resolver = Resolver(_resolver);
  }
}
