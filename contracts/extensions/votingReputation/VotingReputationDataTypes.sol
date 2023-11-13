// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.23;
import { ColonyDataTypes } from "./../../colony/ColonyDataTypes.sol";

// prettier-ignore
interface VotingReputationDataTypes {
  // Data structures

  enum ExtensionState { Deployed, Active, Deprecated }

  enum MotionState { Null, Staking, Submit, Reveal, Closed, Finalizable, Finalized, Failed }

  struct Motion {
    uint64[3] events; // For recording motion lifecycle timestamps (STAKE, SUBMIT, REVEAL)
    bytes32 rootHash;
    uint256 domainId;
    uint256 skillId;
    uint256 skillRep;
    uint256 repSubmitted;
    uint256 paidVoterComp;
    uint256[2] pastVoterComp; // [nay, yay]
    uint256[2] stakes; // [nay, yay]
    uint256[2] votes; // [nay, yay]
    bool escalated;
    bool finalized;
    address altTarget;
    bytes4 sig;
    bytes action;
  }

  struct ActionSummary {
    bytes4 sig;
    uint256 domainSkillId;
    uint256 expenditureId;
  }

  // Events
  event MotionCreated(uint256 indexed motionId, address creator, uint256 indexed domainId);
  event MotionStaked(uint256 indexed motionId, address indexed staker, uint256 indexed vote, uint256 amount);
  event MotionVoteSubmitted(uint256 indexed motionId, address indexed voter);
  event MotionVoteRevealed(uint256 indexed motionId, address indexed voter, uint256 indexed vote);
  event MotionFinalized(uint256 indexed motionId, bytes action, bool executed);
  event MotionEscalated(uint256 indexed motionId, address escalator, uint256 indexed domainId, uint256 indexed newDomainId);
  event MotionRewardClaimed(uint256 indexed motionId, address indexed staker, uint256 indexed vote, uint256 amount);
  event MotionEventSet(uint256 indexed motionId, uint256 eventIndex);
}
