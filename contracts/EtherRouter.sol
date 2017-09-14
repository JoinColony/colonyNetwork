pragma solidity ^0.4.15;
import "./Resolver.sol";
import "../lib/dappsys/auth.sol";


contract EtherRouter is DSAuth {
  Resolver public resolver;

  function() payable {
    uint r;

    // Get routing information for the called function
    var (destination, outsize) = resolver.lookup(msg.sig);

    // Make the call
    assembly {
      calldatacopy(mload(0x40), 0, calldatasize)
      r := delegatecall(sub(gas, 700), destination, mload(0x40), calldatasize, mload(0x40), outsize)
    }

    // Throw if the call failed
    assert(r == 1);

    // Pass on the return value
    assembly {
      return(mload(0x40), outsize)
    }
  }

  function setResolver(address _resolver)
  auth
  {
    resolver = Resolver(_resolver);
  }
}
