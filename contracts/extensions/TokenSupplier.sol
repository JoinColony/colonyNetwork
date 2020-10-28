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

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./../colonyNetwork/IColonyNetwork.sol";
import "./ColonyExtension.sol";


contract TokenSupplier is ColonyExtension {

  uint256 constant PERIOD = 1 days;
  bytes32 constant VOTING_REPUTATION = keccak256("VotingReputation");
  bytes32 constant VOTING_HYBRID = keccak256("VotingHybrid");

  // Events

  event TokenSupplyCeilingSet(uint256 tokenSupplyCeiling);
  event TokenIssuanceRateSet(uint256 tokenIssuanceRate);
  event TokensIssued(uint256 numTokens);

  // Storage

  uint256 public tokenSupply;
  uint256 public tokenSupplyCeiling;
  uint256 public tokenIssuanceRate;
  uint256 public lastPinged;
  uint256 public lastRateUpdate;

  // Modifiers

  modifier isRoot() {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "token-supplier-not-root");
    _;
  }

  modifier isContract() {
    uint256 size;
    address msgSender = msg.sender;
    assembly { size := extcodesize(msgSender) }
    require(size > 0, "token-supplier-caller-must-be-contract");
    _;
  }

  // Public

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("TokenSupplier");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 1;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
  }

  /// @notice Called when upgrading the extension (currently a no-op)
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension (currently a no-op)
  function deprecate(bool _deprecated) public override auth {}

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }

  /// @notice Initialise the extension, must be called before any tokens can be issued
  /// @param _tokenSupplyCeiling Total amount of tokens to issue
  /// @param _tokenIssuanceRate Number of tokens to issue per day
  function initialise(uint256 _tokenSupplyCeiling, uint256 _tokenIssuanceRate) public isRoot {
    require(lastPinged == 0, "token-supplier-already-initialised");

    tokenSupplyCeiling = _tokenSupplyCeiling;
    tokenIssuanceRate = _tokenIssuanceRate;
    lastPinged = block.timestamp;
    lastRateUpdate = block.timestamp;
  }

  /// @notice Update the tokenSupplyCeiling, cannot set below current tokenSupply
  /// @param _tokenSupplyCeiling Total amount of tokens to issue
  function setTokenSupplyCeiling(uint256 _tokenSupplyCeiling) public isRoot isContract {
    try ColonyExtension(msg.sender).identifier() returns (bytes32 extensionId) {
      IColonyNetwork colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
      address installation = colonyNetwork.getExtensionInstallation(extensionId, address(colony));
      require(installation == msg.sender, "token-supplier-not-managed-extension");
      require(extensionId == VOTING_HYBRID, "token-supplier-cannot-set-value");
    } catch {
      require(false, "token-supplier-no-identifier");
    }

    tokenSupplyCeiling = max(_tokenSupplyCeiling, tokenSupply);

    emit TokenSupplyCeilingSet(tokenSupplyCeiling);
  }

  /// @notice Update the tokenIssuanceRate
  /// @param _tokenIssuanceRate Number of tokens to issue per day
  function setTokenIssuanceRate(uint256 _tokenIssuanceRate) public isRoot isContract {
    try ColonyExtension(msg.sender).identifier() returns (bytes32 extensionId) {
      IColonyNetwork colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
      address installation = colonyNetwork.getExtensionInstallation(extensionId, address(colony));
      require(installation == msg.sender, "token-supplier-not-managed-extension");
      require(
        extensionId == VOTING_HYBRID || (
          extensionId == VOTING_REPUTATION &&
          block.timestamp - lastRateUpdate >= 4 weeks &&
          _tokenIssuanceRate <= add(tokenIssuanceRate, tokenIssuanceRate / 10) &&
          _tokenIssuanceRate >= sub(tokenIssuanceRate, tokenIssuanceRate / 10)
        ),
        "token-supplier-cannot-set-value"
      );
    } catch {
      require(false, "token-supplier-no-identifier");
    }

    tokenIssuanceRate = _tokenIssuanceRate;
    lastRateUpdate = block.timestamp;

    emit TokenIssuanceRateSet(tokenIssuanceRate);
  }

  /// @notice Issue the appropriate amount of tokens
  function issueTokens() public {
    require(lastPinged > 0, "token-supplier-not-initialised");

    uint256 newSupply = min(
      tokenSupplyCeiling - tokenSupply,
      wmul(tokenIssuanceRate, wdiv((block.timestamp - lastPinged), PERIOD))
    );

    require(newSupply > 0, "token-supplier-nothing-to-issue");

    tokenSupply = add(tokenSupply, newSupply);
    lastPinged = block.timestamp;

    assert(tokenSupply <= tokenSupplyCeiling);

    colony.mintTokens(newSupply);

    emit TokensIssued(newSupply);
  }

}
