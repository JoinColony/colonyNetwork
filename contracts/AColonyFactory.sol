
contract AColonyFactory {

  mapping(bytes32 => address) public colonies;
  address public rootColonyResolver;

  function createColony(address _owner, bytes32 _key, uint256 _initialSharesSupply);
}
