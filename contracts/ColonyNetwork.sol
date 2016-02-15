// Forwarding contract for the network of Colonies. 
contract ColonyNetwork {

    uint nextColonyId;
    mapping(address => Colony) private colonies;
    
    address owner;
    
    function ColonyMasterNetwork() {
		owner = msg.sender;
	}
	
    // Create a colony
    function createColony() returns (Colony colonyAddress)
    {
        return new Colony();
    }
    
    function () {
			throw;
	}
}