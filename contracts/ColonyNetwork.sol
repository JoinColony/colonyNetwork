import "Colony.sol";
contract ColonyNetwork {

   mapping (uint => Colony) colonies;
   address public owner;
   uint numColonies;

   function ColonyNetwork() {
        owner = msg.sender;
   }
	// Creates a colony
  // Creating a new contract returns the address of the contract to the creator contract
   function createColony() returns (address colonyAddress)
   {
     colonies[numColonies] = new Colony();
     numColonies++;
     return colonies[numColonies];
   }

   function () {
      throw;
   }
}
