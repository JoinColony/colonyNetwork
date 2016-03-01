import "Colony.sol";
contract RootColony {

   mapping (uint => Colony) private colonies;
   uint coloniesNum;

   address public owner;

   function RootColony() {
        owner = msg.sender;
   }

   // Creates a colony
   function createColony() returns (uint)
   {
     colonies[coloniesNum] = new Colony();
     coloniesNum ++;
     return coloniesNum;
   }

   function getColony(uint coloniesNum) constant returns (address)
   {
     return colonies[coloniesNum];
   }

   function () {
      throw;
   }
}
