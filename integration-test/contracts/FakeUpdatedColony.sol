
import "Modifiable.sol";
import "ITaskDB.sol";
import "IRootColonyResolver.sol";
import "ITokenLedger.sol";

contract FakeUpdatedColony is Modifiable {

  // Event to raise when a Task is completed and paid
  event TaskCompletedAndPaid (address _from, address indexed _to, uint256 indexed _ethValue, uint256 indexed _tokensValue);

  modifier onlyOwner {
    if ( !this.getUserInfo(msg.sender)) throw;
    _
  }

	struct User
	{
		bool admin;  // if true, that person is an admin
	}

  IRootColonyResolver public rootColonyResolver;
  ITokenLedger public tokenLedger;
  ITaskDB public taskDB;

 	// This declares a state variable that
	// stores a `User` struct for each possible address.
 	mapping(address => User) public users;

  function FakeUpdatedColony(
    address rootColonyResolverAddress_,
    address _tokenLedgerAddress,
    address _tasksDBAddress)
  {
    users[tx.origin].admin = true;
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    tokenLedger = ITokenLedger(_tokenLedgerAddress);
    taskDB = ITaskDB(_tasksDBAddress);
  }

  function isUpdated()
  constant returns(bool)
  {
    return true;
  }

  /// @notice registers a new RootColonyResolver contract.
  /// Used to keep the reference of the RootColony.
  /// @param rootColonyResolverAddress_ the RootColonyResolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  onlyOwner
  throwIfAddressIsInvalid(rootColonyResolverAddress_)
  {
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
  }

  /// @notice registers a new ITaskDB contract
  /// @param _tasksDBAddress the address of the ITaskDB
  function registerTaskDB(address _tasksDBAddress)
  onlyOwner
  throwIfAddressIsInvalid(_tasksDBAddress)
  {
    taskDB = ITaskDB(_tasksDBAddress);
  }

  function getRootColony()
  constant returns(address)
  {
    return rootColonyResolver.rootColonyAddress();
  }

  /// @notice set the colony tokens symbol
  /// @param symbol_ the symbol of the colony tokens
  function setTokensSymbol(bytes4 symbol_)
  refundEtherSentByAccident
  onlyOwner
  {
    tokenLedger.setTokensSymbol(symbol_);
  }

  /// @notice set the colony tokens title
  /// @param title_ the title of the colony tokens
  function setTokensTitle(bytes32 title_)
  refundEtherSentByAccident
  onlyOwner
  {
    tokenLedger.setTokensTitle(title_);
  }

	function getUserInfo(address userAddress)
  constant returns (bool admin)
  {
		return users[userAddress].admin;
	}
}
