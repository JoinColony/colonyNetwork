import "Resolver.sol";

contract BetterAddress {
  Resolver resolver;

  function BetterAddress() {
    resolver = new Resolver();
  }

  function() {
    var (destination, outsize) = resolver.lookup(msg.sig);
    assembly {
      calldatacopy(mload(0x40), 0, calldatasize)
      let r := callcode(1000000, destination, 0, mload(0x40), calldatasize, mload(0x40), outsize)
      return(mload(0x40), outsize)
    }
  }
}
