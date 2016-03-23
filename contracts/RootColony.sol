import "Colony.sol";
contract RootColony {

   mapping (uint => Colony) private colonies;
   uint coloniesNum;

   address public owner;

   function RootColony() {
        owner = msg.sender;
   }

   // Creates a colony
   function createColony(uint256 _totalSupply, string _symbol, string _name) returns (uint)
   {
     colonies[coloniesNum] = new Colony(_totalSupply, _symbol, _name);
     coloniesNum ++;
     return coloniesNum;
   }

   function getColony(uint coloniesNum) constant returns (address)
   {
     return colonies[coloniesNum];
   }
}
