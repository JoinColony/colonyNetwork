pragma solidity ^0.4.15;


contract Resolver {
  struct Pointer { address destination; uint outsize; }
  mapping (bytes4 => Pointer) public pointers;

  function Resolver(address destination) {
    pointers[stringToSig("symbol")] = Pointer(destination, 32);
    pointers[stringToSig("decimals")] = Pointer(destination, 32);
    pointers[stringToSig("name")] = Pointer(destination, 32);
    pointers[stringToSig("totalSupply()")] = Pointer(destination, 32);
    pointers[stringToSig("balanceOf(address)")] = Pointer(destination, 32);
    pointers[stringToSig("allowance(address,address)")] = Pointer(destination, 32);
    pointers[stringToSig("transfer(address,uint256)")] = Pointer(destination, 32);
    pointers[stringToSig("transferFrom(address,address,uint256)")] = Pointer(destination, 32);
    pointers[stringToSig("approve(address,uint256)")] = Pointer(destination, 32);
    pointers[stringToSig("mint(uint128)")] = Pointer(destination, 0);
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
