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

  uint256 constant NUM_INFLUENCES = 1;

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("VotingToken");
  }

  /// @notice Return the version number
  /// @return The version number
  function version() public pure override returns (uint256) {
    return 1;
  }

  // [motionId] => lockId
  mapping (uint256 => uint256) lockIds;

  // Public

  /// @notice Get the user influence in the motion
  /// @param _motionId The id of the motion
  /// @param _user The user in question
  function getInfluence(uint256 _motionId, address _user)
    public
    view
    returns (uint256[] memory influence)
  {
    influence = new uint256[](NUM_INFLUENCES);
    influence[0] = add(
      tokenLocking.getUserLock(token, _user).balance,
      add(stakes[_motionId][_user][NAY], stakes[_motionId][_user][YAY])
    );
  }

  function postSubmit(uint256 _motionId, address _user) internal override {}

  function postReveal(uint256 _motionId, address _user) internal override {
    if (lockIds[_motionId] == 0) {
      // This is the first reveal that has taken place in this motion.
      // We lock the token for everyone to avoid double-counting,
      lockIds[_motionId] = colony.lockToken();
    }

    colony.unlockTokenForUser(_user, lockIds[_motionId]);
  }

  function postClaim(uint256 _motionId, address _user) internal override {
    uint256 lockCount = tokenLocking.getUserLock(token, _user).lockCount;

    // Lock may have already been released during reveal
    if (lockCount < lockIds[_motionId]) {
      colony.unlockTokenForUser(_user, lockIds[_motionId]);
    }
  }

  /// @notice Create a motion in the root domain
  /// @param _altTarget The contract to which we send the action (0x0 for the colony)
  /// @param _action A bytes array encoding a function call
  function createMotion(address _altTarget, bytes memory _action)
    public
    notDeprecated
  {
    createMotionInternal(1, UINT256_MAX, _altTarget, _action, NUM_INFLUENCES);
    motions[motionCount].maxVotes[0] = ERC20Extended(token).totalSupply();
  }

  /// @notice Stake on a motion
  /// @param _motionId The id of the motion
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the motion is occurring
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @param _amount The amount of tokens being staked
  function stakeMotion(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _vote,
    uint256 _amount
  )
    public
  {
    uint256[] memory influence = getInfluence(_motionId, msg.sender);
    internalStakeMotion(_motionId, _permissionDomainId, _childSkillIndex, _vote, _amount, influence);
  }

  /// @notice Submit a vote secret for a motion
  /// @param _motionId The id of the motion
  /// @param _voteSecret The hashed vote secret
  function submitVote(uint256 _motionId, bytes32 _voteSecret)
    public
  {
    uint256[] memory influence = getInfluence(_motionId, msg.sender);
    internalSubmitVote(_motionId, _voteSecret, influence);
  }

  function revealVote(uint256 _motionId, bytes32 _salt, uint256 _vote)
    public
  {
    uint256[] memory influence = getInfluence(_motionId, msg.sender);
    internalRevealVote(_motionId, _salt, _vote, influence);
  }

  function getLockId(uint256 _motionId) public view returns (uint256) {
    return lockIds[_motionId];
  }

}
