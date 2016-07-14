import "Modifiable.sol";
import "Destructible.sol";
contract ITokenLedger is Destructible, Modifiable {

    uint256 public totalSupply;
    bytes32 public title;
    bytes4 public symbol;

    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer(address indexed _from, address indexed _to, uint256 indexed _value);
    event Approval(address indexed _owner, address indexed _spender, uint256 indexed _value);

    /// @notice set token ledger symbol
    /// @param _symbol the symbol of the Colony Token
    function setTokensSymbol(bytes4 _symbol);

    /// @notice set the token ledger title
    /// @param _title the title of the Colony Token
    function setTokensTitle(bytes32 _title);

    /// @param _owner The address from which the balance will be retrieved
    /// @return The balance
    function balanceOf(address _owner) constant returns (uint256 balance);

    /// @notice send `_value` token to `_to` from `msg.sender`
    /// @param _to The address of the recipient
    /// @param _value The amount of token wei to be transferred
    /// @return Whether the transfer was successful or not
    function transfer(address _to, uint256 _value) returns (bool success);

    /// @notice send `_value` token to `_to` from `_from` on the condition it is approved by `_from`
    /// @param _from The address of the sender
    /// @param _to The address of the recipient
    /// @param _value The amount of token wei to be transferred
    /// @return Whether the transfer was successful or not
    function transferFrom(address _from, address _to, uint256 _value) returns (bool success);

    /// @notice `msg.sender` approves `_addr` to spend `_value` tokens
    /// @param _spender The address of the account able to transfer the tokens
    /// @param _value The amount of wei to be approved for transfer
    function approve(address _spender, uint256 _value);

    /// @param _owner The address of the account owning tokens
    /// @param _spender The address of the account able to transfer the tokens
    /// @return Amount of remaining tokens wei allowed to spent
    function allowance(address _owner, address _spender) constant returns (uint256 remaining);

    /// @notice generates new tokens wei for the colony
    /// @param _amount The amount of tokens wei to generate
    function generateTokensWei(uint256 _amount);

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
