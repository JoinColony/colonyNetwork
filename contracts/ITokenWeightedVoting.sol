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

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

// Are all functions neccessary?

/// @notice Creates a new Poll
/// @param description The poll description or question to vote on
function createPoll(string description) returns (bool);

/// @notice For a poll with id 'pollId', adds a new voting option
/// Note: Once poll has status of 'open', no options can be added to it
/// @param pollOptionDescription The option description, e.g. "Yes" vote
function addPollOption(uint256 pollId, string pollOptionDescription) returns (bool);

/// @notice Opens the poll for voting with immediate effect, for the given duration
/// @param pollDuration hours from now (effectively the opening time), the poll remains open for voting
function openPoll(uint256 pollId, uint256 pollDuration) returns (bool);

/// @notice Resolves the poll voting results
/// Note: Any votes which haven't been resolved will not count in the final poll results resolved here
function resolvePoll(uint256 pollId) returns (bool);

/// @notice Submits a vote to a poll which is open
/// We expect the user to give us the correct position of their voting secret in the two linked lists
function submitVote(
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId)
    returns (bool);

function revealVote(
    uint256 pollId,
    uint256 idx,
    bytes32 salt,
    uint256 voteWeight)
    returns (bool);

function addVoteSecret(
    address userAddress,
    uint256 pollCloseTime,
    uint256 pollId,
    bytes32 secret,
    uint256 prevTimestamp,
    uint256 prevPollId)
    private returns (bool);

function removeVoteSecret(
    address userAddress,
    uint256 pollCloseTime,
    uint256 pollId)
    private returns(bool);

/// @notice Checks if an address is 'locked' due to any present unresolved votes
function isAddressLocked(address userAddress) view returns (bool);
