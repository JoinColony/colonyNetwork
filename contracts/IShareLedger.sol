import "Modifiable.sol";
import "Destructible.sol";
contract IShareLedger is Destructible, Modifiable {

    uint256 total_supply;
    bytes32 public title;
    bytes4 public symbol;

    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer(address indexed _from, address indexed _to, uint256 indexed _value);
    event Approval(address indexed _owner, address indexed _spender, uint256 indexed _value);

    /// @notice set share ledger symbol
    /// @param _symbol the symbol of the Colony Share
    function setSharesSymbol(bytes4 _symbol);

    /// @notice set the share ledger title
    /// @param _title the title of the Colony Share
    function setSharesTitle(bytes32 _title);

    /// @return total amount of tokens
    function totalSupply() constant returns (uint256 supply) {}

    /// @param _owner The address from which the balance will be retrieved
    /// @return The balance
    function balanceOf(address _owner) constant returns (uint256 balance) {}

    /// @notice send `_value` token to `_to` from `msg.sender`
    /// @param _to The address of the recipient
    /// @param _value The amount of token to be transferred
    function transfer(address _to, uint256 _value)  {}

    /// @notice send `_value` token to `_to` from `_from` on the condition it is approved by `_from`
    /// @param _from The address of the sender
    /// @param _to The address of the recipient
    /// @param _value The amount of token to be transferred
    function transferFrom(address _from, address _to, uint256 _value) {}

    /// @notice `msg.sender` approves `_addr` to spend `_value` tokens
    /// @param _spender The address of the account able to transfer the tokens
    /// @param _value The amount of wei to be approved for transfer
    function approve(address _spender, uint256 _value) {}

    /// @param _owner The address of the account owning tokens
    /// @param _spender The address of the account able to transfer the tokens
    /// @return Amount of remaining tokens allowed to spent
    function allowance(address _owner, address _spender) constant returns (uint256 remaining) {}

    function generateShares(uint256 _amount) {}

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
