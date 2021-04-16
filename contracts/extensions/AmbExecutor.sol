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

// ignore-file-swc-108

// https://docs.tokenbridge.net/amb-bridge/how-to-develop-xchain-apps-by-amb
//   #receive-a-method-call-from-the-amb-bridge
interface IAmb {
  function messageSender() external view returns (address);
  function messageSourceChainId() external view returns (bytes32);
  function messageId() external view returns (bytes32);
}

interface IAmbExecutor {
  enum Operation { Call, DelegateCall }

  function executeTransaction(address _to, uint256 _value, bytes memory _action, Operation _op) external;
}

contract AmbExecutor is ColonyExtension, IAmbExecutor {

  // Storage

  IAmb amb;
  address sender;
  bytes32 chainId;

  // messageId => isExecuted
  mapping(bytes32 => bool) executedTxs;

  // Modifiers

  modifier onlyRoot() {
    require(
      colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root),
      "amb-executor-caller-not-root"
    );
    _;
  }

  // Public

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("AmbExecutor");
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

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {} // solhint-disable-line no-empty-blocks

  /// @notice Called when deprecating (or undeprecating) the extension
  /// @param _deprecated Whether to deprecate or not
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }

  /// @notice Initialise the AmbExecutor extension
  /// @param _amb Address of the AMB contract
  /// @param _sender Address of the authorized sender contract on the other side of the bridge
  /// @param _chainId Address of the authorized chainId from which sender can initiate transactions
  function initialise(IAmb _amb, address _sender, bytes32 _chainId) public onlyRoot {
    amb = _amb;
    sender = _sender;
    chainId = _chainId;
  }

  /// @notice Called by the AMB to execute a transaction
  /// @param _to Target of the transaction
  /// @param _value Ether value of transaction (not used)
  /// @param _action Data of the transaction
  /// @param _op Operation type of transaction (not used)
  function executeTransaction(address _to, uint256 _value, bytes memory _action, Operation _op)
    public
    override
    notDeprecated
  {
    require(msg.sender == address(amb), "amb-executor-bad-caller");
    require(amb.messageSender() == sender, "amb-executor-bad-sender");
    require(amb.messageSourceChainId() == chainId, "amb-executor-bad-chainid");
    require(!executedTxs[amb.messageId()], "amb-executor-already-executed");

    executedTxs[amb.messageId()] = true;
    require(colony.makeArbitraryTransaction(_to, _action), "amb-executor-execution-failed");
  }
}
