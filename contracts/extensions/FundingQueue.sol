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

pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/math.sol";
import "./../colony/IColony.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../common/ERC20Extended.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../tokenLocking/ITokenLocking.sol";


contract FundingQueue is DSMath, PatriciaTreeProofs {

  // Constants
  uint256 constant HEAD = 0;
  uint256 constant UINT256_MAX = (2 ** 256) - 1;
  uint256 constant STAKE_PCT = WAD / 1000; // 0.1%
  uint256 constant COMPOUNDING_FREQUENCY = 168;
  uint256 constant BASE_DECAY_RATE = 691719225406032925; // TODO: use RAYs?
  // From Wolfram Alpha:           0.691719225406032924664669179186644...

  //  BASE_DECAY_RATE is determined via the following equation:
  //   r = (z ** (1/n) - 1) * n
  //
  //  With the following variables:
  //   z = target decay rate (currently: -0.5 per week, see whitepaper)
  //   n = COMPOUNDING_FREQUENCY (currently: 168, i.e. hours per week)
  //   r = -BASE_DECAY_RATE
  //
  //  Basically, we take a target decay rate (-0.5 per week), and a compounding
  //   frequency (1 hour), and figure out what "interest rate" is needed to
  //   achieve that (about -0.69). This is necessary because more frequent
  //   compounding requires a higher decay rate to keep weekly decay constant.
  //  This equation was derived by taking the regular compound interest
  //   formula, z = (1 + r/n) ** nt, setting t = 1, and solving for r = f(z,n).
  //  To keep everything uint, we store the negative and use `sub()` later.

  // Initialization data
  IColony colony;
  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();

    proposals[HEAD].totalSupport = UINT256_MAX; // Initialize queue
  }

  // Data structures
  enum ProposalState { Inactive, Active, Completed, Cancelled }

  struct Proposal {
    ProposalState state;
    address creator;
    address token;
    uint256 domainId;
    uint256 domainTotalRep;
    uint256 fromPot;
    uint256 toPot;
    uint256 totalRequested;
    uint256 totalPaid;
    uint256 lastUpdated;
    uint256 totalSupport;
  }

  // Storage
  uint256 proposalCount;
  mapping (uint256 => Proposal) proposals;
  mapping (uint256 => mapping (address => uint256)) supporters;
  mapping (uint256 => uint256) queue; // proposalId => nextProposalId

  // Public functions

  function createBasicProposal(
    uint256 _domainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _totalRequested,
    address _token
  )
    public
  {
    uint256 fromDomain = colony.getDomainFromFundingPot(_fromPot);
    uint256 toDomain = colony.getDomainFromFundingPot(_toPot);

    uint256 domainSkillId = colony.getDomain(_domainId).skillId;
    uint256 fromSkillId = colony.getDomain(fromDomain).skillId;
    uint256 toSkillId = colony.getDomain(toDomain).skillId;

    require(
      domainSkillId == fromSkillId ||
      fromSkillId == colonyNetwork.getChildSkillId(domainSkillId, _fromChildSkillIndex),
      "funding-queue-bad-inheritence-from"
    );
    require(
      domainSkillId == toSkillId ||
      toSkillId == colonyNetwork.getChildSkillId(domainSkillId, _toChildSkillIndex),
      "funding-queue-bad-inheritence-to"
    );

    proposalCount++;
    proposals[proposalCount] = Proposal(
      ProposalState.Inactive, msg.sender, _token, _domainId, 0, _fromPot, _toPot, _totalRequested, 0, now, 0
    );
    queue[proposalCount] = proposalCount; // Initialize as a disconnected self-edge
  }

  function cancelProposal(uint256 _id, uint256 _prevId) public {
    Proposal storage proposal = proposals[_id];

    require(proposal.state != ProposalState.Cancelled, "funding-queue-already-cancelled");
    require(proposal.state != ProposalState.Completed, "funding-queue-already-completed");
    require(proposal.creator == msg.sender, "funding-queue-not-creator");
    require(queue[_prevId] == _id, "funding-queue-bad-prev-id");

    proposal.state = ProposalState.Cancelled;

    queue[_prevId] = queue[_id];
    delete queue[_id];

    // uint256 stake = wmul(proposal.domainTotalRep, STAKE_PCT);
    // colony.deobligateStake(msg.sender, proposal.domainId, stake);
  }

  function stakeProposal(
    uint256 _id,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Proposal storage proposal = proposals[_id];

    require(proposal.state == ProposalState.Inactive, "funding-queue-not-inactive");
    require(proposal.creator == msg.sender, "funding-queue-not-creator");

    proposal.state = ProposalState.Active;
    proposal.domainTotalRep = checkReputation(_id, address(0x0), _key, _value, _branchMask, _siblings);

    // uint256 stake = wmul(proposal.domainTotalRep, STAKE_PCT);
    // colony.obligateStake(msg.sender, proposal.domainId, stake);
  }

  function backBasicProposal(
    uint256 _id,
    uint256 _currPrevId,
    uint256 _newPrevId,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Proposal storage proposal = proposals[_id];

    require(proposal.state == ProposalState.Active, "funding-queue-proposal-not-active");
    require(_id != _newPrevId, "funding-queue-cannot-insert-after-self"); // NOTE: this may be redundant
    require(supporters[_id][msg.sender] == 0, "funding-queue-already-supported");

    uint256 userReputation = checkReputation(_id, msg.sender, _key, _value, _branchMask, _siblings);
    proposal.totalSupport = add(proposal.totalSupport, userReputation);
    supporters[_id][msg.sender] = userReputation;

    // Remove the proposal from its current position, if exists
    require(queue[_currPrevId] == _id, "funding-queue-bad-prev-id");
    queue[_currPrevId] = queue[_id];

    // Insert into the right location
    uint256 nextId = queue[_newPrevId];
    // Does this proposal have less or equal support than the previous proposal?
    require(
      proposals[_newPrevId].totalSupport >= proposal.totalSupport,
      "funding-queue-excess-support"
    );
    // Does this proposal have more support than the next proposal?
    require(
      nextId == HEAD || proposals[nextId].totalSupport < proposal.totalSupport,
      "funding-queue-insufficient-support"
    );
    queue[_newPrevId] = _id; // prev proposal => this proposal
    queue[_id] = nextId; // this proposal => next proposal
  }

  function pingProposal(
    uint256 _id,
    uint256 _domainId,
    uint256 _toChildSkillIndex,
    uint256 _fromChildSkillIndex
  )
    public
  {
    Proposal storage proposal = proposals[_id];

    require(queue[HEAD] == _id, "funding-queue-proposal-not-head");

    uint256 fundingToTransfer = calculateFundingToTransfer(_id);
    uint256 remainingRequested = sub(proposal.totalRequested, proposal.totalPaid);
    uint256 actualFundingToTransfer = min(fundingToTransfer, remainingRequested);

    proposal.totalPaid = add(proposal.totalPaid, actualFundingToTransfer);
    proposal.lastUpdated = now;

    assert(proposal.totalPaid <= proposal.totalRequested);

    if (proposal.totalPaid == proposal.totalRequested) {
      proposal.state = ProposalState.Completed;

      queue[HEAD] = queue[_id];
      delete queue[_id];

      // May be the null proposal, but that's ok
      proposals[queue[HEAD]].lastUpdated = now;

      // uint256 stake = wmul(proposal.domainTotalRep, STAKE_PCT);
      // colony.deobligateStake(proposal.creator, proposal.domainId, stake);
    }

    colony.moveFundsBetweenPots(
      proposal.domainId,
      _toChildSkillIndex,
      _fromChildSkillIndex,
      proposal.fromPot,
      proposal.toPot,
      actualFundingToTransfer,
      proposal.token
    );
  }

  // Public view functions

  function getProposalCount() public view returns (uint256) {
    return proposalCount;
  }

  function getProposal(uint256 _id) public view returns (Proposal memory proposal) {
    return proposals[_id];
  }

  function getSupport(uint256 _id, address _supporter) public view returns (uint256) {
    return supporters[_id][_supporter];
  }

  function getHeadId() public view returns (uint256) {
    return queue[HEAD];
  }

  function getNextProposalId(uint256 _id) public view returns (uint256) {
    return queue[_id];
  }

  // Internal functions

  function calculateFundingToTransfer(uint256 _id) internal view returns (uint256) {
    Proposal storage proposal = proposals[_id];

    uint256 balance = colony.getFundingPotBalance(proposal.fromPot, token);
    uint256 backingPercent = min(WAD, wdiv(proposal.totalSupport, proposal.domainTotalRep));
    uint256 weightedDecayRate = wmul(BASE_DECAY_RATE, backingPercent);

    // balance * ((1 - (weightedDecayRate / )) ** hoursElapsed)
    uint256 hoursElapsed = (now - proposal.lastUpdated) / 1 hours;
    uint256 base = sub(WAD, weightedDecayRate / COMPOUNDING_FREQUENCY);
    uint256 newBalance = wmul(balance, wpow(base, hoursElapsed));
    uint256 fundingToTransfer = sub(balance, newBalance);

    return fundingToTransfer;
  }

  function checkReputation(
    uint256 _id,
    address _who,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal view returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRootHashKey(_key, _value, _branchMask, _siblings);
    require(colonyNetwork.getReputationRootHash() == impliedRoot, "funding-queue-invalid-root-hash");

    uint256 reputationValue;
    address keyColonyAddress;
    uint256 keySkill;
    address keyUserAddress;

    assembly {
      reputationValue := mload(add(_value, 32))
      keyColonyAddress := mload(add(_key, 20))
      keySkill := mload(add(_key, 52))
      keyUserAddress := mload(add(_key, 72))
    }

    require(keyColonyAddress == address(colony), "funding-queue-invalid-colony-address");
    require(keySkill == colony.getDomain(proposals[_id].domainId).skillId, "funding-queue-invalid-skill-id");
    require(keyUserAddress == _who, "funding-queue-invalid-user-address");

    return reputationValue;
  }

  function wpow(uint256 x, uint256 n) internal pure returns (uint256) {
    // Must convert WAD (10 ** 18) to RAY (10 ** 27) and back
    return rpow(x * (10 ** 9), n) / (10 ** 9);
  }
}
