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

import "./../common/ERC20Extended.sol";
import "./VotingBase.sol";


contract VotingToken is VotingBase {

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("VotingToken");
  }

  /// @notice Return the version number
  /// @return The version number
  function version() public pure override returns (uint256) {
    return 1;
  }

  // [motionId][user] => tokenBalance
  mapping (uint256 => mapping (address => uint256)) influences;

  // [motionId] => lockId
  mapping (uint256 => uint256) locks;

  // Public

  function setInfluence(uint256 _motionId) public {
    require(
      getMotionState(_motionId) == MotionState.Staking ||
      getMotionState(_motionId) == MotionState.Submit,
      "voting-token-cannot-set-influence"
    );

    uint256 balance = tokenLocking.getUserLock(token, msg.sender).balance;
    influences[_motionId][msg.sender] = balance;
  }

  /// @param _motionId The id of the motion
  function getInfluence(uint256 _motionId, address _user) public view override returns (uint256) {
    return influences[_motionId][_user];
  }

  function postReveal(uint256 _motionId, address _user) internal override {
    colony.unlockTokenForUser(_user, locks[_motionId]);
  }

  function postClaim(uint256 _motionId, address _user) internal override {
    uint256 lockCount = tokenLocking.getUserLock(token, _user).lockCount;

    // Lock may have already been released during reveal
    if (lockCount < locks[_motionId]) {
      colony.unlockTokenForUser(_user, locks[_motionId]);
    }
  }

  /// @notice Create a motion in the root domain
  /// @param _altTarget The contract to which we send the action (0x0 for the colony)
  /// @param _action A bytes array encoding a function call
  function createRootMotion(address _altTarget, bytes memory _action)
    public
  {
    createMotion(_altTarget, _action, 1);
    motions[motionCount].maxVotes = ERC20Extended(token).totalSupply();
    locks[motionCount] = colony.lockToken();
  }

  function getLock(uint256 _motionId) public view returns (uint256) {
    return locks[_motionId];
  }

}
