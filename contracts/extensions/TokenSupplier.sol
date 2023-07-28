/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.8.21;
pragma experimental ABIEncoderV2;

import "./../common/BasicMetaTransaction.sol";
import "./../common/ERC20Extended.sol";
import "./ColonyExtension.sol";


contract TokenSupplier is ColonyExtension, BasicMetaTransaction {

  uint256 constant ISSUANCE_PERIOD = 1 days;

  // Events

  event TokenSupplyCeilingSet(uint256 tokenSupplyCeiling);
  event TokenIssuanceRateSet(uint256 tokenIssuanceRate);
  event TokensIssued(uint256 numTokens);

  // Storage

  address token;
  uint256 tokenSupplyCeiling;
  uint256 tokenIssuanceRate;
  uint256 lastIssue;
  uint256 lastRateUpdate;

  mapping(address => uint256) metatransactionNonces;

  /// @notice Gets the next nonce for a meta-transaction
  /// @param userAddress The user's address
  /// @return nonce The nonce
  function getMetatransactionNonce(address userAddress) override public view returns (uint256 nonce){
    return metatransactionNonces[userAddress];
  }

  function incrementMetatransactionNonce(address user) override internal {
    metatransactionNonces[user]++;
  }

  // Modifiers

  modifier initialised() {
    require(lastIssue > 0, "token-supplier-not-initialised");
    _;
  }

  // Public

  /// @notice Returns the identifier of the extension
  /// @return _identifier The extension's identifier
  function identifier() public override pure returns (bytes32 _identifier) {
    return keccak256("TokenSupplier");
  }

  /// @notice Returns the version of the extension
  /// @return _version The extension's version number
  function version() public override pure returns (uint256 _version) {
    return 6;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    token = colony.getToken();
  }

  /// @notice Called when upgrading the extension (currently a no-op)
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension
  /// @param _deprecated Indicates whether the extension should be deprecated or undeprecated
  function deprecate(bool _deprecated) public override auth {}

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(payable(address(colony)));
  }

  /// @notice Initialise the extension, must be called before any tokens can be issued
  /// @param _tokenSupplyCeiling Total amount of tokens to issue
  /// @param _tokenIssuanceRate Number of tokens to issue per day
  function initialise(uint256 _tokenSupplyCeiling, uint256 _tokenIssuanceRate) public {
    require(isRoot(), "token-supplier-caller-not-root");
    require(lastIssue == 0, "token-supplier-already-initialised");
    require(_tokenSupplyCeiling > ERC20Extended(token).totalSupply(), "token-supplier-ceiling-too-low");

    tokenSupplyCeiling = _tokenSupplyCeiling;
    tokenIssuanceRate = _tokenIssuanceRate;
    lastIssue = block.timestamp;
    lastRateUpdate = block.timestamp;

    emit ExtensionInitialised();
  }

  /// @notice Update the tokenSupplyCeiling, cannot set below current tokenSupply
  /// @param _tokenSupplyCeiling Total amount of tokens to issue
  function setTokenSupplyCeiling(uint256 _tokenSupplyCeiling) public initialised {
    require(isRoot(), "token-supplier-caller-not-root");
    require(_tokenSupplyCeiling > ERC20Extended(token).totalSupply(), "token-supplier-ceiling-too-low");

    tokenSupplyCeiling = _tokenSupplyCeiling;

    emit TokenSupplyCeilingSet(tokenSupplyCeiling);
  }

  /// @notice Update the tokenIssuanceRate
  /// @param _tokenIssuanceRate Number of tokens to issue per day
  // slither-disable-next-line reentrancy-no-eth
  function setTokenIssuanceRate(uint256 _tokenIssuanceRate) public initialised  {
    require(
      isRoot() || (
        isRootFunding() &&
        block.timestamp - lastRateUpdate >= 4 weeks &&
        _tokenIssuanceRate <= tokenIssuanceRate + tokenIssuanceRate / 10 &&
        _tokenIssuanceRate >= tokenIssuanceRate - tokenIssuanceRate / 10
      ), "token-supplier-caller-not-authorized"
    );

    // Issue any outstanding tokens under the previous rate and update timestamp
    issueTokens();
    lastIssue = block.timestamp;

    tokenIssuanceRate = _tokenIssuanceRate;
    lastRateUpdate = block.timestamp;

    emit TokenIssuanceRateSet(tokenIssuanceRate);
  }

  /// @notice Issue the appropriate amount of tokens
  function issueTokens() public initialised {
    uint256 tokenSupply = ERC20Extended(token).totalSupply();

    uint256 newSupply = min(
      (tokenSupplyCeiling > tokenSupply) ? (tokenSupplyCeiling - tokenSupply) : 0,
      wmul(tokenIssuanceRate, wdiv((block.timestamp - lastIssue), ISSUANCE_PERIOD))
    );

    assert(newSupply == 0 || (tokenSupply + newSupply) <= tokenSupplyCeiling);

    // Don't update lastIssue if we aren't actually issuing tokens
    if (newSupply > 0) {
      lastIssue = block.timestamp;
      colony.mintTokens(newSupply);

      emit TokensIssued(newSupply);
    }
  }

  /// @notice Get the token supply ceiling
  /// @return supplyCeiling The token supply ceiling
  function getTokenSupplyCeiling() public view returns (uint256 supplyCeiling) {
    return tokenSupplyCeiling;
  }

  /// @notice Get the token issuance rate
  /// @return issuanceRate The token issuance rate
  function getTokenIssuanceRate() public view returns (uint256 issuanceRate) {
    return tokenIssuanceRate;
  }

  /// @notice Get the time of the last token minting event
  /// @return lastPinged The timestamp of the last ping
  function getLastPinged() public view returns (uint256 lastPinged) {
    return lastIssue;
  }

  /// @notice Get the time of the last change in issuance rate
  /// @return lastUpdate The timestamp of the last update
  function getLastRateUpdate() public view returns (uint256 lastUpdate) {
    return lastRateUpdate;
  }

  // Internal functions

  function isRoot() internal view returns (bool) {
    return colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root);
  }

  function isRootFunding() internal view returns (bool) {
    return colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Funding);
  }

}
