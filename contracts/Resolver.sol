pragma solidity ^0.4.15;

import "../lib/dappsys/auth.sol";


contract Resolver is DSAuth {
  struct Pointer { address destination; uint outsize; }
  mapping (bytes4 => Pointer) public pointers;

  function Resolver() {
  }

  function register(string signature, address destination, uint outsize)
  auth
  {
    pointers[stringToSig(signature)] = Pointer(destination, outsize);
  }

  // Public API
  function lookup(bytes4 sig) returns(address, uint) {
    return (destination(sig), outsize(sig));
  }

  // Helpers
  function destination(bytes4 sig) returns(address) {
    return pointers[sig].destination;
  }

  function outsize(bytes4 sig) returns(uint) {
    if (pointers[sig].destination != 0) {
      // Stored destination and outsize
      return pointers[sig].outsize;
    } else {
      // Default
      return 32;
    }
  }

  function stringToSig(string signature) returns(bytes4) {
    return bytes4(keccak256(signature));
  }
}
