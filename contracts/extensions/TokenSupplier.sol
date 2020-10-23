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

import "./ColonyExtension.sol";


contract TokenSupplier is ColonyExtension {

  uint256 constant PERIOD = 1 days;

  // Events

  event TokenSupplyCeilingSet(uint256 tokenSupplyCeiling);
  event TokenIssuanceRateSet(uint256 tokenIssuanceRate);
  event TokensIssued(uint256 numTokens);


  // Storage

  uint256 public tokenSupply;
  uint256 public tokenSupplyCeiling;
  uint256 public tokenIssuanceRate;
  uint256 public lastPinged;

  // Modifiers

  modifier root() {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "token-supplier-not-root");
    _;
  }

  // Public

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
  function initialise(uint256 _tokenSupplyCeiling, uint256 _tokenIssuanceRate) public root {
    require(lastPinged == 0, "token-supplier-already-initialised");

    tokenSupplyCeiling = _tokenSupplyCeiling;
    tokenIssuanceRate = _tokenIssuanceRate;
    lastPinged = block.timestamp;
  }

  /// @notice Update the tokenSupplyCeiling, cannot set below current tokenSupply
  /// @param _tokenSupplyCeiling Total amount of tokens to issue
  function setTokenSupplyCeiling(uint256 _tokenSupplyCeiling) public root {
    tokenSupplyCeiling = max(_tokenSupplyCeiling, tokenSupply);

    emit TokenSupplyCeilingSet(tokenSupplyCeiling);
  }

  /// @notice Update the tokenIssuanceRate
  /// @param _tokenIssuanceRate Number of tokens to issue per day
  function setTokenIssuanceRate(uint256 _tokenIssuanceRate) public root {
    tokenIssuanceRate = _tokenIssuanceRate;

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
