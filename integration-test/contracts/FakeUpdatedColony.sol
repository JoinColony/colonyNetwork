import "Modifiable.sol";
import "IUpgradable.sol";
import "TaskLibrary.sol";
import "IRootColonyResolver.sol";
import "ITokenLedger.sol";

contract FakeUpdatedColony is Modifiable, IUpgradable  {

  // Function only present in this updated Colony contract
  function isUpdated()
  constant returns(bool) {
      return true;
    }

  modifier onlyAdminsOrigin {
    if (!this.getUserInfo(tx.origin)) throw;
    _
  }

  modifier onlyAdmins {
    if (!this.getUserInfo(msg.sender)) throw;
    _
  }

  struct User
  {
    bool admin;  // if true, that person is an admin
    bool _exists;
  }

  IRootColonyResolver public rootColonyResolver;
  ITokenLedger public tokenLedger;

  using TaskLibrary for address;
  address public eternalStorage;

  // This declares a state variable that
  // stores a `User` struct for each possible address.
  mapping(address => User) users;
  uint public adminsCount;
  // keeping track of how many tokens are assigned to tasks by the colony itself (i.e. self-funding tasks).
  mapping(uint256 => uint256) reserved_tokens;
  uint256 public reservedTokensWei = 0;

  function FakeUpdatedColony(
    address rootColonyResolverAddress_,
    address _tokenLedgerAddress,
    address _oldColonyAddress,
    address _eternalStorage)
  {
    users[tx.origin] = User({admin: true, _exists: true});
    adminsCount = 1;
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    tokenLedger = ITokenLedger(_tokenLedgerAddress);
    if (_oldColonyAddress!=0x0){ //i.e. if it was supplied.
      reservedTokensWei = FakeUpdatedColony(_oldColonyAddress).reservedTokensWei();
    }

    eternalStorage = _eternalStorage;
  }

  /// @notice registers a new RootColonyResolver contract used to keep the reference of the RootColony.
  /// @param rootColonyResolverAddress_ the RootColonyResolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  onlyAdmins
  throwIfAddressIsInvalid(rootColonyResolverAddress_)
  {
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
  }

  /// @notice adds a new admin user to the colony
  /// @param newAdminAddress the address of the new admin user
  function addAdmin(address newAdminAddress)
  onlyAdmins
  {
    if(users[newAdminAddress]._exists && users[newAdminAddress].admin)
      throw;

    users[newAdminAddress] = User({admin: true, _exists: true});
    adminsCount += 1;
  }

  /// @notice removes an admin from the colony
  /// @param adminAddress the address of the admin to be removed
  function removeAdmin(address adminAddress)
  onlyAdmins
  {
    if(!users[adminAddress]._exists) throw;
    if(users[adminAddress]._exists && !users[adminAddress].admin) throw;
    if(adminsCount == 1) throw;

    users[adminAddress].admin = false;
    adminsCount -= 1;
  }

  /// @notice contribute ETH to a task
  /// @param taskId the task ID
  function contributeEthToTask(uint256 taskId)
  onlyAdmins
  {
    eternalStorage.contributeEthToTask(taskId, msg.value);
  }

  /// @notice contribute tokens from an admin to fund a task
  /// @param taskId the task ID
  /// @param tokens the amount of tokens to fund the task
  function contributeTokensToTask(uint256 taskId, uint256 tokens)
  onlyAdmins
  {
    var tokensInWei = tokens * 1000000000000000000;
    // When a user funds a task, the actually is a transfer of tokens ocurring from their address to the colony's one.
    tokenLedger.transferFrom(msg.sender, this, tokensInWei);
    reserved_tokens[taskId] += tokensInWei;
    reservedTokensWei += tokensInWei;

    eternalStorage.contributeTokensWeiToTask(taskId, tokensInWei);
  }

  /// @notice contribute tokens from the colony pool to fund a task
  /// @param taskId the task ID
  /// @param tokens the amount of tokens to fund the task
  function contributeTokensFromPool(uint256 taskId, uint256 tokens)
  onlyAdmins
  {
    //When tasks are funded from the pool of unassigned tokens, no transfer takes place - we just mark them as
    //assigned.
    var tokensInWei = tokens * 1000000000000000000;
    if (reservedTokensWei + tokensInWei > tokenLedger.balanceOf(this))
      throw;
    reserved_tokens[taskId] += tokensInWei;
    reservedTokensWei += tokensInWei;

    eternalStorage.contributeTokensWeiToTask(taskId, tokensInWei);
  }

  /// @notice this function is used to generate Colony tokens
  /// @param _amount The amount of tokens to be generated
  function generateColonyTokens(uint256 _amount)
  onlyAdmins
  refundEtherSentByAccident
  {
    tokenLedger.generateTokensWei(_amount * 1000000000000000000);
  }

  function getTaskCount() constant returns (uint256)
  {
    return eternalStorage.count();
  }

  /// @notice this function adds a task to the task DB.
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    string _name,
    string _summary
  )
  onlyAdmins
  throwIfIsEmptyString(_name)
  {
      eternalStorage.makeTask(_name, _summary);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id)
  onlyAdmins
  {
    eternalStorage.acceptTask(_id);
  }

  /// @notice this function is used to update task data.
  /// @param _id the task id
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function updateTask(
    uint256 _id,
    string _name,
    string _summary
  )
  onlyAdmins
  throwIfIsEmptyString(_name)
  {
    eternalStorage.updateTask(_id, _name, _summary);
  }

  /// @notice set the colony tokens symbol
  /// @param symbol_ the symbol of the colony tokens
  function setTokensSymbol(bytes4 symbol_)
  refundEtherSentByAccident
  onlyAdmins
  {
    tokenLedger.setTokensSymbol(symbol_);
  }

  /// @notice set the colony tokens title
  /// @param title_ the title of the colony tokens
  function setTokensTitle(bytes32 title_)
  refundEtherSentByAccident
  onlyAdmins
  {
    tokenLedger.setTokensTitle(title_);
  }

  /// @notice returns user info based in a given address
  /// @param userAddress the address to be verified
  /// @return a boolean value indicating if the user is an admin
  function getUserInfo(address userAddress)
  constant returns (bool admin)
  {
    return users[userAddress].admin;
  }

  /// @notice mark a task as completed, pay the user who completed it and root colony fee
  /// @param taskId the task ID to be completed and paid
  /// @param paymentAddress the address of the user to be paid
  function completeAndPayTask(uint256 taskId, address paymentAddress)
  onlyAdmins
  {
    eternalStorage.acceptTask(taskId);
    var (taskEth, taskTokens) = eternalStorage.getTaskBalance(taskId);

    if (taskEth > 0)
    {
      //ColonyPaymentProvider.SettleTaskFees(taskEth, paymentAddress, rootColonyResolver.rootColonyAddress());

      // Pay the task Ether and Tokens value -5% to task completor
      var payoutEth = (taskEth * 95)/100;
      var feeEth = taskEth - payoutEth;
      paymentAddress.send(payoutEth);
      // Pay root colony 5% fee
      var rootColony = rootColonyResolver.rootColonyAddress();
      rootColony.send(feeEth);
    }

    if (taskTokens > 0)
    {
      var payout = ((taskTokens * 95)/100);
      var fee = taskTokens - payout;
      tokenLedger.transfer(paymentAddress, payout);
      tokenLedger.transfer(rootColonyResolver.rootColonyAddress(), fee);

      reserved_tokens[taskId] -= taskTokens;
      reservedTokensWei -= taskTokens;
    }
  }

  /// @notice upgrade the colony migrating its data to another colony instance
  /// @param newColonyAddress_ the address of the new colony instance
  function upgrade(address newColonyAddress_)
  onlyAdminsOrigin
  {
    var tokensBalance = tokenLedger.balanceOf(this);
    if(tokensBalance > 0){
      tokenLedger.transfer(newColonyAddress_, tokensBalance);
    }

    tokenLedger.changeOwner(newColonyAddress_);
    Ownable(eternalStorage).changeOwner(newColonyAddress_);

    selfdestruct(newColonyAddress_);
  }
}
