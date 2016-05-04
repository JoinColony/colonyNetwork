import "Modifiable.sol";
import "Destructible.sol";
contract ITaskDB is Destructible, Modifiable {

  /// @notice this function returns the number of tasks in the DB
  /// @return the number of tasks in DB
  function count() constant returns(uint256);

  /// @notice this task is useful when we need to know if a task exists
  /// @param _id the task id
  /// @return true - if the task if is valid, false - if the task id is invalid
  function hasTask(uint256 _id) constant returns(bool);

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return a flag indicating if the task was accepted or not
  function isTaskAccepted(uint256 _id)
  constant returns(bool);

  /// @notice this function returns if a task was accepted
  /// @param _id the task id
  /// @return the amount of ether and the amount of tokens wei unding a task
  function getTaskBalance(uint256 _id)
  constant returns(uint256 _ether, uint256 _tokensWei);

  /// @notice this function returns the attributes of a task
  /// @param _id the task id
  /// @return the name, a flag indicating if the task was accepted or not,
  /// a hash pointing to the summary of a task (IPFS hash)
  function getTask(uint256 _id)
  constant returns(
    string _name,
    string _summary,
    bool _accepted,
    uint256 _eth,
    uint256 _tokensWei
  );

  /// @notice this function adds a task to the task DB. Any ETH sent will be
  /// considered as a contribution to the task
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    string _name,
    string _summary
  );

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id);

  /// @notice this function takes ETH and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount to contribute
  function contributeEth(uint256 _id, uint256 _amount);

  /// @notice this function takes an amount of tokens and add it to the task funds.
  /// @param _id the task id
  /// @param _amount the amount of tokens wei to contribute
  function contributeTokensWei(uint256 _id, uint256 _amount);

  /// @notice this function is used to update task data.
  /// @param _id the task id
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function updateTask(
    uint256 _id,
    string _name,
    string _summary
  );
}
