import "Modifiable.sol";
import "IUpgradable.sol";
import "TaskLibrary.sol";
import "IRootColonyResolver.sol";
import "ITokenLedger.sol";
import "Ownable.sol";

contract Colony is Modifiable, IUpgradable  {

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

  // EternalStorage address passed to TaskLibrary library for management of tasks
  using TaskLibrary for address;
  address public eternalStorage;

  // This declares a state variable that
  // stores a `User` struct for each possible address.
  mapping(address => User) users;
  uint public adminsCount;

  function Colony(
    address rootColonyResolverAddress_,
    address _tokenLedgerAddress,
    address _eternalStorage)
  {
    users[tx.origin] = User({admin: true, _exists: true});
    adminsCount = 1;
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    tokenLedger = ITokenLedger(_tokenLedgerAddress);
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

  /// @notice gets the reserved colony tokens for funding tasks
  /// This is to understand the amount of 'unavailable' tokens due to them been promised to be paid once a task completes.
  /// @return a uint value indicating if the amount of reserved colony tokens
  function reservedTokensWei() constant returns (uint256)
  {
    return eternalStorage.getReservedTokensWei();
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
  /// @param tokensWei the amount of tokens wei to fund the task
  function contributeTokensWeiToTask(uint256 taskId, uint256 tokensWei)
  onlyAdmins
  {
    // When a user funds a task, the actually is a transfer of tokens ocurring from their address to the colony's one.
    tokenLedger.transferFrom(msg.sender, this, tokensWei);
    eternalStorage.contributeTokensWeiToTask(taskId, tokensWei, false);
  }

  /// @notice contribute tokens from the colony pool to fund a task
  /// @param taskId the task ID
  /// @param tokensWei the amount of tokens wei to fund the task
  function contributeTokensWeiFromPool(uint256 taskId, uint256 tokensWei)
  onlyAdmins
  {
    //When tasks are funded from the pool of unassigned tokens, no transfer takes place - we just mark them as
    //assigned.
    var reservedTokensWei = eternalStorage.getReservedTokensWei();

    if (reservedTokensWei + tokensWei > tokenLedger.balanceOf(this))
      throw;

    eternalStorage.contributeTokensWeiToTask(taskId, tokensWei, true);
  }

  /// @notice this function is used to generate Colony tokens
  /// @param tokensWei The amount of tokens wei to be generated
  function generateColonyTokensWei(uint256 tokensWei)
  onlyAdmins
  refundEtherSentByAccident
  {
    tokenLedger.generateTokensWei(tokensWei);
  }

  function getTaskCount() constant returns (uint256)
  {
    return eternalStorage.getTaskCount();
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
    //  ColonyPaymentProvider.SettleTaskFees(taskEth, paymentAddress, rootColonyResolver.rootColonyAddress());

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

      var reservedTokensWei = eternalStorage.getReservedTokensWei();
      eternalStorage.setReservedTokensWei(reservedTokensWei - taskTokens);
      eternalStorage.removeReservedTokensWeiForTask(taskId);
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
