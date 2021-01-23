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
import "./VotingReputation.sol";
import "./VotingToken.sol";


contract VotingHybrid is ColonyExtension {

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("VotingHybrid");
  }

  /// @notice Return the version number
  /// @return The version number
  function version() public pure override returns (uint256) {
    return 1;
  }

  /// @notice Install the extension
  /// @param _colony Base colony for the installation
  function install(address _colony) public override {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    IColonyNetwork colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    votingReputationAddress = colonyNetwork.getExtensionInstallation(keccak256("VotingReputation"), _colony);
    votingTokenAddress = colonyNetwork.getExtensionInstallation(keccak256("VotingToken"), _colony);
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {} // solhint-disable-line no-empty-blocks

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }

  // Storage

  address votingReputationAddress;
  address votingTokenAddress;

  uint256 motionCount;
  mapping (uint256 => Motion) motions;

  struct Motion {
    bool reputationApproved;
    bool tokenApproved;
    bool finalized;
    address altTarget;
    bytes action;
  }

  // Public functions

  /// @notice Create a motion in the root domain
  /// @param _altTarget The contract to which we send the action (0x0 for the colony)
  /// @param _action A bytes array encoding a function call
  /// @param _key Reputation tree key for the root domain
  /// @param _value Reputation tree value for the root domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function createRootMotion(
    address _altTarget,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    motionCount += 1;
    motions[motionCount].altTarget = _altTarget;
    motions[motionCount].action = _action;

    bytes memory approvalAction = createApprovalAction(motionCount);

    VotingReputation(votingReputationAddress).createRootMotion(address(this), approvalAction, _key, _value, _branchMask, _siblings);
    VotingToken(votingTokenAddress).createRootMotion(address(this), approvalAction);
  }

  function approveMotion(uint256 _motionId) public {
    Motion storage motion = motions[_motionId];

    if (msg.sender == votingReputationAddress) {
      motion.reputationApproved = true;
    } else if (msg.sender == votingTokenAddress) {
      motion.tokenApproved = true;
    }

    if (motion.reputationApproved && motion.tokenApproved && !motion.finalized) {
      motion.finalized = true;
      executeCall(_motionId, motion.action);
    }
  }

  // Internal functions

  function executeCall(uint256 motionId, bytes memory action) internal returns (bool success) {
    address altTarget = motions[motionId].altTarget;
    address to = (altTarget == address(0x0)) ? address(colony) : altTarget;

    assembly {
              // call contract at address a with input mem[in…(in+insize))
              //   providing g gas and v wei and output area mem[out…(out+outsize))
              //   returning 0 on error (eg. out of gas) and 1 on success

              // call(g,   a,  v, in,                insize,        out, outsize)
      success := call(gas(), to, 0, add(action, 0x20), mload(action), 0, 0)
    }
  }

  function createApprovalAction(uint256 motionId)
    public
    returns (bytes memory)
  {
    // See https://solidity.readthedocs.io/en/develop/abi-spec.html#use-of-dynamic-types
    //  for documentation on how the action `bytes` is encoded
    // In brief, the first byte32 is the length of the array. Then we have
    //   4 bytes of function signature, following by an arbitrary number of
    //   additional byte32 arguments. 32 in hex is 0x20, so every increment
    //   of 0x20 represents advancing one byte, 4 is the function signature.
    // So: 0x[length][sig][args...]

    bytes memory approvalAction = new bytes(4 + 32); // 36 bytes
    bytes4 functionSignature = bytes4(keccak256("approveMotion(uint256)"));

    assembly {
        mstore(add(approvalAction, 0x20), functionSignature)
        mstore(add(approvalAction, 0x24), motionId)
    }

    return approvalAction;
  }

}
