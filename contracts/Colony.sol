contract Colony {
	struct User
	{
			bool admin;  // if true, that person is an admin
	}

	struct Proposal
	{
			string name; //Short name
			string summary; //IPFS hash of the brief
			bool accepted; //Whether the work has been accepted
			uint contributed; //Amount of ETH contributed to the proposal
	}


	// A dynamically-sized array of `Proposal` structs.
	Proposal[] public proposals;
 	// This declares a state variable that
	// stores a `User` struct for each possible address.
 	mapping(address => User) public users;

	function Colony() {
		users[msg.sender].admin=true;
	}

	//Contribute ETH to a proposal
	function contribute(uint256 proposalId) {
		var proposal = proposals[proposalId];
		if (proposal.accepted != false) // check for non-existing proposal or completed proposal
				throw;
		proposal.contributed += msg.value;
	}

	function getUserInfo(address userAddress) constant returns (bool admin){
		admin=users[userAddress].admin;
	}

	//Make a proposal for some work to be done
  function makeProposal(string name, string summary){
    proposals.push(Proposal({
        name: name,
        summary:summary,
        accepted: false,
        contributed: 0
    }));
  }

  function updateProposal(uint256 proposalId, string name, string summary){
	    proposals[proposalId].name = name;
	    proposals[proposalId].summary = summary;
  }


  function getProposal(uint256 proposalId) constant returns (string name, string summary, bool accepted, uint contributed) {
  	var proposal = proposals[proposalId];
	name = proposal.name;
	summary = proposal.summary;
	accepted = proposal.accepted;
	contributed = proposal.contributed;
  }


  function getNProposals() returns (uint) {
  	return proposals.length;
  }

  //Mark a proposal as completed, pay a user
  function completeAndPayProposal(uint256 proposalId, address paymentAddress){
  		if (proposals[proposalId].accepted==true || proposalId<0 || proposalId >= proposals.length || users[msg.sender].admin==false)
  			throw;
		var proposal = proposals[proposalId];
		proposal.accepted = true;
		paymentAddress.send(proposal.contributed);
  }

	function () {
			// This function gets executed if a
			// transaction with invalid data is sent to
			// the contract or just ether without data.
			// We revert the send so that no-one
			// accidentally loses money when using the
			// contract.
			throw;
	}

}
