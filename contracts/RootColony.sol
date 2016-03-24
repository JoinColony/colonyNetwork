import "Colony.sol";
contract RootColony {

   mapping (uint => Colony) private colonies;
   uint coloniesNum;

   address public owner;

   function RootColony() {
        owner = msg.sender;
   }

   // Creates a colony
   function createColony(uint256 _totalSharesSupply) returns (uint)
   {
     var colony = new Colony(_totalSharesSupply);
     colonies[coloniesNum] = colony;
     coloniesNum ++;
     return coloniesNum;
   }

   function getColony(uint coloniesNum) constant returns (address)
   {
     return colonies[coloniesNum];
   }
}
