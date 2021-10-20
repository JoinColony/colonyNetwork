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

import "./../colony/ColonyRoles.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../tokenLocking/ITokenLocking.sol";
import "./ColonyExtensionMeta.sol";


abstract contract VotingBase is ColonyExtensionMeta, PatriciaTreeProofs {

  // Events

  event MotionCreated(uint256 indexed motionId, address creator, uint256 indexed domainId);
  event MotionStaked(uint256 indexed motionId, address indexed staker, uint256 indexed vote, uint256 amount);
  event MotionVoteSubmitted(uint256 indexed motionId, address indexed voter);
  event MotionVoteRevealed(uint256 indexed motionId, address indexed voter, uint256 indexed vote);
  event MotionFinalized(uint256 indexed motionId, bytes action, bool executed);
  event MotionEscalated(uint256 indexed motionId, address escalator, uint256 indexed domainId, uint256 indexed newDomainId);
  event MotionRewardClaimed(uint256 indexed motionId, address indexed staker, uint256 indexed vote, uint256 amount);
  event MotionEventSet(uint256 indexed motionId, uint256 eventIndex);

  // Constants

  uint256 constant UINT128_MAX = 2**128 - 1;

  uint256 constant NAY = 0;
  uint256 constant YAY = 1;

  uint256 constant STAKE_END = 0;
  uint256 constant SUBMIT_END = 1;
  uint256 constant REVEAL_END = 2;

  bytes32 constant ROOT_ROLES = (
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Recovery) |
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root)
  );

  bytes4 constant CHANGE_FUNCTION_SIG = bytes4(keccak256(
    "setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)"
  ));

  bytes4 constant OLD_MOVE_FUNDS_SIG = bytes4(keccak256(
    "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"
  ));

  enum ExtensionState { Deployed, Active, Deprecated }

  // Data structures

  enum MotionState { Null, Staking, Submit, Reveal, Closed, Finalizable, Finalized, Failed }

  struct Motion {
    uint64[3] events; // For recording motion lifecycle timestamps (STAKE, SUBMIT, REVEAL)
    bytes32 rootHash;
    uint256 domainId;
    uint256 skillId;
    uint256 paidVoterComp;
    uint256[2] pastVoterComp; // [nay, yay]
    uint256[2] stakes; // [nay, yay]
    uint256[2][] votes; // [nay, yay]
    uint256[] totalVotes;
    uint256[] maxVotes;
    address target;
    bool escalated;
    bool finalized;
    bytes action;
  }

  // Storage variables

  ExtensionState state;

  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;

  // All `Fraction` variables are stored as WADs i.e. fixed-point numbers with 18 digits after the radix. So
  // 1 WAD = 10**18, which is interpreted as 1.

  uint256 totalStakeFraction; // Fraction of the domain's reputation needed to stake on each side in order to go to a motion.
  // This can be set to a maximum of 0.5.
  uint256 voterRewardFraction; // Fraction of staked tokens paid out to voters as rewards. This will be paid from the staked
  // tokens of the losing side. This can be set to a maximum of 0.5.

  uint256 userMinStakeFraction; // Minimum stake as fraction of required stake. 1 means a single user will be required to
  // provide the whole stake on each side, which may not be possible depending on totalStakeFraction and the distribution of
  // reputation in a domain.
  uint256 maxVoteFraction; // Fraction of total domain reputation that needs to commit votes before closing to further votes.
  // Setting this to anything other than 1 will mean it is likely not all those eligible to vote will be able to do so.

  // All `Period` variables are second-denominated

  uint256 stakePeriod; // Length of time for staking
  uint256 submitPeriod; // Length of time for submitting votes
  uint256 revealPeriod; // Length of time for revealing votes
  uint256 escalationPeriod; // Length of time for escalating after a vote

  uint256 motionCount;
  mapping (uint256 => Motion) motions;
  mapping (uint256 => mapping (address => mapping (uint256 => uint256))) stakes;
  mapping (uint256 => mapping (address => bytes32)) voteSecrets;

  mapping (bytes32 => uint256) expenditurePastVotes; // expenditure slot signature => voting power

  // Modifiers

  modifier onlyRoot() {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "voting-not-root");
    _;
  }

  // Virtual functions

  function postSubmit(uint256 _motionId, address _user) internal virtual;
  function postReveal(uint256 _motionId, address _user) internal virtual;
  function postClaim(uint256 _motionId, address _user) internal virtual;

  // Public functions

  /// @notice Install the extension
  /// @param _colony Base colony for the installation
  function install(address _colony) public override {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();
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

  /// @notice Initialise the extension
  /// @param _totalStakeFraction The fraction of the domain's reputation we need to stake
  /// @param _userMinStakeFraction The minimum per-user stake as fraction of total stake
  /// @param _maxVoteFraction The fraction of the domain's reputation which must submit for quick-end
  /// @param _voterRewardFraction The fraction of the total stake paid out to voters as rewards
  /// @param _stakePeriod The length of the staking period in seconds
  /// @param _submitPeriod The length of the submit period in seconds
  /// @param _revealPeriod The length of the reveal period in seconds
  /// @param _escalationPeriod The length of the escalation period in seconds
  function initialise(
    uint256 _totalStakeFraction,
    uint256 _voterRewardFraction,
    uint256 _userMinStakeFraction,
    uint256 _maxVoteFraction,
    uint256 _stakePeriod,
    uint256 _submitPeriod,
    uint256 _revealPeriod,
    uint256 _escalationPeriod
  )
    public
    onlyRoot
  {
    require(state == ExtensionState.Deployed, "voting-already-initialised");

    string memory valueError = "voting-invalid-value";

    require(_totalStakeFraction <= WAD / 2, valueError);
    require(_voterRewardFraction <= WAD / 2, valueError);

    require(_userMinStakeFraction <= WAD, valueError);
    require(_maxVoteFraction <= WAD, valueError);

    require(_stakePeriod <= 365 days, valueError);
    require(_submitPeriod <= 365 days, valueError);
    require(_revealPeriod <= 365 days, valueError);
    require(_escalationPeriod <= 365 days, valueError);

    state = ExtensionState.Active;

    totalStakeFraction = _totalStakeFraction;
    voterRewardFraction = _voterRewardFraction;

    userMinStakeFraction = _userMinStakeFraction;
    maxVoteFraction = _maxVoteFraction;

    stakePeriod = _stakePeriod;
    submitPeriod = _submitPeriod;
    revealPeriod = _revealPeriod;
    escalationPeriod = _escalationPeriod;

    emit ExtensionInitialised();
  }

  /// @notice Reveal a vote secret for a motion
  /// @param _motionId The id of the motion
  /// @param _salt The salt used to hash the vote
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  function internalRevealVote(uint256 _motionId, bytes32 _salt, uint256 _vote, uint256[] memory _influence) public {

    Motion storage motion = motions[_motionId];

    require(getMotionState(_motionId) == MotionState.Reveal, "voting-not-reveal");
    require(_vote <= 1, "voting-bad-vote");

    for (uint256 i; i < motion.votes.length; i++) {
      motion.votes[i][_vote] = add(motion.votes[i][_vote], _influence[i]);
    }

    bytes32 voteSecret = voteSecrets[_motionId][msg.sender];
    require(voteSecret == getVoteSecret(_salt, _vote), "voting-secret-no-match");
    delete voteSecrets[_motionId][msg.sender];

    uint256 voterReward = getVoterReward(_motionId, msg.sender, _influence);
    motion.paidVoterComp = add(motion.paidVoterComp, voterReward);

    emit MotionVoteRevealed(_motionId, msg.sender, _vote);

    postReveal(_motionId, msg.sender);

    tokenLockingTransfer(voterReward, msg.sender);
  }

  function finalizeMotion(uint256 _motionId) public {
    Motion storage motion = motions[_motionId];

    require(getMotionState(_motionId) == MotionState.Finalizable, "voting-not-finalizable");

    motion.finalized = true;

    uint256 sumVotes;
    uint256 yayVotes;

    for (uint256 i; i < motion.votes.length; i++) {
      sumVotes = add(sumVotes, add(motion.votes[i][NAY], motion.votes[i][YAY]));
      yayVotes = add(yayVotes, motion.votes[i][YAY]);
    }

    // Either we're fully staked YAY or we've gone to a vote
    assert(motion.stakes[YAY] == getRequiredStake(_motionId) || sumVotes > 0);

    bool canExecute = true;

    // If we went to a vote, check if every sub-vote passed
    if (sumVotes > 0) {
      for (uint256 j; j < motion.votes.length && canExecute; j++) {
        canExecute = canExecute && motion.votes[j][NAY] < motion.votes[j][YAY];
      }
    }

    // Handle expenditure-related bookkeeping (claim delays, repeated vote checks)
    if (
      getSig(motion.action) == CHANGE_FUNCTION_SIG &&
      motion.target == address(colony)
    ) {
      bytes memory claimDelayAction = createClaimDelayAction(motion.action, false);
      // No require this time, since we don't want stakes to be permanently locked
      executeCall(address(colony), claimDelayAction);

      bytes32 actionHash = hashExpenditureAction(motion.action);
      uint256 votePower = (sumVotes > 0) ? yayVotes : motion.stakes[YAY];

      if (expenditurePastVotes[actionHash] < votePower) {
        expenditurePastVotes[actionHash] = votePower;
        // slither-disable-next-line boolean-cst
        canExecute = canExecute && true;
      } else {
        // slither-disable-next-line boolean-cst
        canExecute = canExecute && false;
      }
    }

    bool executed;

    if (canExecute) {
      executed = executeCall(motion.target, motion.action);
    }

    emit MotionFinalized(_motionId, motion.action, executed);
  }

  /// @notice Claim the staker's reward
  /// @param _motionId The id of the motion
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the motion is occurring
  /// @param _staker The staker whose reward is being claimed
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  function claimReward(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _staker,
    uint256 _vote
  )
    public
  {
    require(
      getMotionState(_motionId) == MotionState.Finalized ||
      getMotionState(_motionId) == MotionState.Failed,
      "voting-not-claimable"
    );

    (uint256 stakerReward, uint256 repPenalty) = getStakerReward(_motionId, _staker, _vote);

    require(stakes[_motionId][_staker][_vote] > 0, "voting-nothing-to-claim");
    delete stakes[_motionId][_staker][_vote];

    postClaim(_motionId, _staker);

    tokenLockingTransfer(stakerReward, _staker);

    if (repPenalty > 0) {
      colony.emitDomainReputationPenalty(
        _permissionDomainId,
        _childSkillIndex,
        motions[_motionId].domainId,
        _staker,
        -int256(repPenalty)
      );
    }

    emit MotionRewardClaimed(_motionId, _staker, _vote, stakerReward);
  }

  // Public view functions

  /// @notice Get the total stake fraction
  /// @return The total stake fraction
  function getTotalStakeFraction() public view returns (uint256) {
    return totalStakeFraction;
  }

  /// @notice Get the voter reward fraction
  /// @return The voter reward fraction
  function getVoterRewardFraction() public view returns (uint256) {
    return voterRewardFraction;
  }

  /// @notice Get the user min stake fraction
  /// @return The user min stake fraction
  function getUserMinStakeFraction() public view returns (uint256) {
    return userMinStakeFraction;
  }

  /// @notice Get the max vote fraction
  /// @return The max vote fraction
  function getMaxVoteFraction() public view returns (uint256) {
    return maxVoteFraction;
  }

  /// @notice Get the stake period
  /// @return The stake period
  function getStakePeriod() public view returns (uint256) {
    return stakePeriod;
  }

  /// @notice Get the submit period
  /// @return The submit period
  function getSubmitPeriod() public view returns (uint256) {
    return submitPeriod;
  }

  /// @notice Get the reveal period
  /// @return The reveal period
  function getRevealPeriod() public view returns (uint256) {
    return revealPeriod;
  }

  /// @notice Get the escalation period
  /// @return The escalation period
  function getEscalationPeriod() public view returns (uint256) {
    return escalationPeriod;
  }

  /// @notice Get the total motion count
  /// @return The total motion count
  function getMotionCount() public view returns (uint256) {
    return motionCount;
  }

  /// @notice Get the data for a single motion
  /// @param _motionId The id of the motion
  /// @return motion The motion struct
  function getMotion(uint256 _motionId) public view returns (Motion memory motion) {
    motion = motions[_motionId];
  }

  /// @notice Get a user's stake on a motion
  /// @param _motionId The id of the motion
  /// @param _staker The staker address
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @return The user's stake
  function getStake(uint256 _motionId, address _staker, uint256 _vote) public view returns (uint256) {
    return stakes[_motionId][_staker][_vote];
  }

  /// @notice Get the largest past vote on a single expenditure variable
  /// @param _actionHash The hash of the particular expenditure action
  /// @return The largest past vote on this variable
  function getExpenditurePastVote(bytes32 _actionHash) public view returns (uint256) {
    return expenditurePastVotes[_actionHash];
  }

  /// @notice Get the current state of the motion
  /// @return The current motion state
  function getMotionState(uint256 _motionId) public view returns (MotionState) {
    Motion storage motion = motions[_motionId];

    uint256 requiredStake = getRequiredStake(_motionId);

    // Check for valid motion Id
    if (_motionId == 0 || _motionId > motionCount) {

      return MotionState.Null;

    // If finalized, we're done
    } else if (motion.finalized) {

      return MotionState.Finalized;

    // Not fully staked
    } else if (motion.stakes[YAY] < requiredStake || motion.stakes[NAY] < requiredStake) {

      // Are we still staking?
      if (block.timestamp < motion.events[STAKE_END]) {
        return MotionState.Staking;
      // If not, did the YAY side stake?
      } else if (motion.stakes[YAY] == requiredStake) {
        return MotionState.Finalizable;
      // If not, was there a prior (reputation) vote we can fall back on?
      } else if (
        (identifier() == keccak256("VotingReputation") ||
         identifier() == keccak256("VotingReputation2")) &&
        add(motion.votes[0][NAY], motion.votes[0][YAY]) > 0
      ) {
        return MotionState.Finalizable;
      // Otherwise, the motion failed
      } else {
        return MotionState.Failed;
      }

    // Fully staked, go to a vote
    } else {

      if (block.timestamp < motion.events[SUBMIT_END]) {
        return MotionState.Submit;
      } else if (block.timestamp < motion.events[REVEAL_END]) {
        return MotionState.Reveal;
      } else if (
        motion.domainId > 1 &&
        block.timestamp < motion.events[REVEAL_END] + escalationPeriod
      ) {
        return MotionState.Closed;
      } else {
        return MotionState.Finalizable;
      }

    }
  }

  /// @notice Get the voter reward
  /// NB This function will only return a meaningful value if in the reveal state.
  /// Prior to the reveal state, getVoterRewardRange should be used.
  /// @param _motionId The id of the motion
  /// @param _user The address of the the voter
  /// @return The voter reward
  function getVoterReward(uint256 _motionId, address _user, uint256[] memory _influence) public view returns (uint256) {
    Motion storage motion = motions[_motionId];

    assert(_influence.length == motion.totalVotes.length);

    // Get the average per-influence fraction
    uint256 fractionUserInfluence;

    for (uint256 i; i < _influence.length; i++) {
      if (motion.totalVotes[i] > 0) {
        fractionUserInfluence = add(fractionUserInfluence, wdiv(_influence[i], motion.totalVotes[i]));
      }
    }

    fractionUserInfluence = fractionUserInfluence / _influence.length;

    return wmul(wmul(fractionUserInfluence, add(motion.stakes[YAY], motion.stakes[NAY])), voterRewardFraction);
  }

  /// @notice Get the range of potential rewards for a voter on a specific motion, intended to be
  /// used when the motion is in the reveal state.
  /// Once a motion is in the reveal state the reward is known, and getVoterRewardRange should be used.
  /// @param _motionId The id of the motion
  /// @param _user The address of the user
  /// @return The voter reward
  function getVoterRewardRange(uint256 _motionId, address _user, uint256[] memory _influence) public view returns (uint256, uint256) {
    Motion storage motion = motions[_motionId];

    assert(_influence.length == motion.totalVotes.length);

    uint256 minFractionUserInfluence;
    uint256 maxFractionUserInfluence;

    // The minimum reward is when everyone has voted, with a total weight of motion.maxVotes
    // The maximum reward is when this user is the only other person who votes (if they haven't already),
    //  aside from those who have already done so

    for (uint256 i; i < _influence.length; i++) {
      // If user hasn't voted, add their influence to totalVotes
      uint256 pendingVote = (voteSecrets[_motionId][_user] == bytes32(0)) ? _influence[i] : 0;

      if (motion.maxVotes[i] > 0) {
        minFractionUserInfluence = add(minFractionUserInfluence, wdiv(_influence[i], motion.maxVotes[i]));
      }

      if (add(motion.totalVotes[i], pendingVote) > 0) {
        maxFractionUserInfluence = add(maxFractionUserInfluence, wdiv(_influence[i], add(motion.totalVotes[i], pendingVote)));
      }
    }

    minFractionUserInfluence = minFractionUserInfluence / _influence.length;
    maxFractionUserInfluence = maxFractionUserInfluence / _influence.length;

    return (
      wmul(wmul(minFractionUserInfluence, add(motion.stakes[YAY], motion.stakes[NAY])), voterRewardFraction),
      wmul(wmul(maxFractionUserInfluence, add(motion.stakes[YAY], motion.stakes[NAY])), voterRewardFraction)
    );
  }

  /// @notice Get the staker reward
  /// @param _motionId The id of the motion
  /// @param _staker The staker's address
  /// @param _vote The vote (0 = NAY, 1 = YAY)
  /// @return The staker reward and the reputation penalty (if any)
  function getStakerReward(
    uint256 _motionId,
    address _staker,
    uint256 _vote
  )
    public
    view
    returns (uint256, uint256)
  {
    Motion storage motion = motions[_motionId];

    uint256 totalSideStake = add(motion.stakes[_vote], motion.pastVoterComp[_vote]);
    if (totalSideStake == 0) { return (0, 0); }

    uint256 stakeFraction = wdiv(stakes[_motionId][_staker][_vote], totalSideStake);
    uint256 realStake = wmul(stakeFraction, motion.stakes[_vote]);

    uint256 stakerReward;
    uint256 repPenalty;

    bool wasVote;

    for (uint256 i; i < motion.votes.length && !wasVote; i++) {
      wasVote = add(motion.votes[i][NAY], motion.votes[i][YAY]) > 0;
    }

    if (wasVote) {
      // Went to a vote, use vote to determine reward or penalty
      (stakerReward, repPenalty) = getStakerRewardByVote(_motionId, _vote, stakeFraction, realStake);
    } else {
      // Determine rewards based on stakes alone
      (stakerReward, repPenalty) = getStakerRewardByStake(_motionId, _vote, stakeFraction, realStake);
    }

    return (stakerReward, repPenalty);
  }

  // Internal functions

  function createMotionInternal(
    uint256 _domainId,
    uint256 _childSkillIndex,
    address _target,
    bytes memory _action,
    uint256 _numInfluences
  )
    internal
  {
    require(state == ExtensionState.Active, "voting-not-active");

    address target = (_target == address(0x0)) ? address(colony) : _target;
    bytes4 actionSig = getSig(_action);
    uint256 skillId = getDomainSkillId(_domainId);

    require(actionSig != OLD_MOVE_FUNDS_SIG, "voting-bad-function");

    if (ColonyRoles(target).getCapabilityRoles(actionSig) | ROOT_ROLES == ROOT_ROLES) {

      // A root or unpermissioned function
      require(_domainId == 1 && _childSkillIndex == UINT256_MAX, "voting-invalid-domain");

    } else {

      // A domain permissioned function
      uint256 actionDomainSkillId = getActionDomainSkillId(_action);

      if (skillId != actionDomainSkillId) {
        uint256 childSkillId = getChildSkillId(skillId, _childSkillIndex);
        require(childSkillId == actionDomainSkillId, "voting-invalid-domain");
      } else {
        require(_childSkillIndex == UINT256_MAX, "voting-invalid-domain");
      }
    }

    motionCount += 1;
    Motion storage motion = motions[motionCount];

    motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);
    motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
    motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);

    motion.rootHash = colonyNetwork.getReputationRootHash();
    motion.domainId = _domainId;
    motion.skillId = skillId;

    motion.target = target;
    motion.action = _action;

    motion.votes = new uint256[2][](_numInfluences);
    motion.totalVotes = new uint256[](_numInfluences);
    motion.maxVotes = new uint256[](_numInfluences);

    emit MotionCreated(motionCount, msg.sender, _domainId);
  }

  function internalStakeMotion(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _vote,
    uint256 _amount,
    uint256[] memory _influence
  )
    internal
  {
    Motion storage motion = motions[_motionId];

    require(_vote <= 1, "voting-bad-vote");
    require(getMotionState(_motionId) == MotionState.Staking, "voting-not-staking");

    uint256 requiredStake = getRequiredStake(_motionId);
    uint256 amount = min(_amount, sub(requiredStake, motion.stakes[_vote]));
    require(amount > 0, "voting-bad-amount");

    uint256 stakerTotalAmount = add(stakes[_motionId][msg.sender][_vote], amount);

    uint256 sumInfluence;

    for (uint256 i; i < _influence.length; i++) {
      sumInfluence = add(sumInfluence, _influence[i]);
    }

    require(
      stakerTotalAmount <= sumInfluence,
      "voting-insufficient-influence"
    );
    require(
      stakerTotalAmount >= wmul(requiredStake, userMinStakeFraction) ||
      add(motion.stakes[_vote], amount) == requiredStake, // To prevent a residual stake from being un-stakable
      "voting-insufficient-stake"
    );

    // Update the stake
    motion.stakes[_vote] = add(motion.stakes[_vote], amount);
    stakes[_motionId][msg.sender][_vote] = stakerTotalAmount;

    // Increment counter & extend claim delay if staking for an expenditure state change
    if (
      _vote == YAY &&
      !motion.escalated &&
      motion.stakes[YAY] == requiredStake &&
      getSig(motion.action) == CHANGE_FUNCTION_SIG &&
      motion.target == address(colony)
    ) {
      bytes memory claimDelayAction = createClaimDelayAction(motion.action, true);
      require(executeCall(address(colony), claimDelayAction), "voting-lock-failed");
    }

    emit MotionStaked(_motionId, msg.sender, _vote, amount);

    // Move to vote submission once both sides are fully staked
    if (motion.stakes[NAY] == requiredStake && motion.stakes[YAY] == requiredStake) {
      motion.events[STAKE_END] = uint64(block.timestamp);
      motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
      motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);

      emit MotionEventSet(_motionId, STAKE_END);

    // Move to second staking window once one side is fully staked
    } else if (
      (_vote == NAY && motion.stakes[NAY] == requiredStake) ||
      (_vote == YAY && motion.stakes[YAY] == requiredStake)
    ) {
      motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);
      motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
      motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);

      // New stake supersedes prior votes
      for (uint256 j; j < motion.votes.length; j++) {
        delete motion.votes[j];
        delete motion.totalVotes[j];
      }

      emit MotionEventSet(_motionId, STAKE_END);
    }

    // Do the external bookkeeping
    tokenLocking.deposit(token, 0, true); // Faux deposit to clear any locks
    colony.obligateStake(msg.sender, motion.domainId, amount);
    colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), msg.sender, motion.domainId, amount, address(this));
  }

  /// @notice Submit a vote secret for a motion
  /// @param _motionId The id of the motion
  /// @param _voteSecret The hashed vote secret
  function internalSubmitVote(uint256 _motionId, bytes32 _voteSecret, uint256[] memory _influence) internal {
    Motion storage motion = motions[_motionId];

    require(getMotionState(_motionId) == MotionState.Submit, "voting-not-open");
    require(_voteSecret != bytes32(0), "voting-invalid-secret");

    // Add influence to totals if first submission
    if (voteSecrets[_motionId][msg.sender] == bytes32(0)) {
      for (uint256 i; i < motion.totalVotes.length; i++) {
        motion.totalVotes[i] = add(motion.totalVotes[i], _influence[i]);
      }
    }

    voteSecrets[_motionId][msg.sender] = _voteSecret;

    emit MotionVoteSubmitted(_motionId, msg.sender);

    postSubmit(_motionId, msg.sender);
  }

  function getStakerRewardByVote(
    uint256 _motionId,
    uint256 _vote,
    uint256 _stakeFraction,
    uint256 _realStake
  )
    internal
    view
    returns (uint256, uint256)
  {
    Motion storage motion = motions[_motionId];

    uint256 stakerReward;
    uint256 repPenalty;

    bool yayWon = true;
    uint256 winFraction;

    // Check if every sub-vote passed, and calculate the win fraction
    for (uint256 i; i < motion.votes.length; i++) {
      yayWon = yayWon && motion.votes[i][NAY] < motion.votes[i][YAY];

      if (motion.totalVotes[i] > 0) {
        winFraction = add(winFraction, wdiv(motion.votes[i][_vote], motion.totalVotes[i]));
      }
    }

    winFraction = winFraction / motion.votes.length;

    uint256 winnerStake;
    uint256 loserStake;

    if (yayWon) {
      winnerStake = motion.stakes[YAY];
      loserStake = sub(motion.stakes[NAY], motion.paidVoterComp);
    } else {
      winnerStake = motion.stakes[NAY];
      loserStake = sub(motion.stakes[YAY], motion.paidVoterComp);
    }

    uint256 winShare = wmul(winFraction, 2 * WAD); // On a scale of 0-2 WAD

    if (winShare > WAD || (winShare == WAD && _vote == NAY)) {
      stakerReward = wmul(_stakeFraction, add(winnerStake, wmul(loserStake, winShare - WAD)));
    } else {
      stakerReward = wmul(_stakeFraction, wmul(loserStake, winShare));
      repPenalty = sub(_realStake, stakerReward);
    }

    return (stakerReward, repPenalty);
  }

  function getStakerRewardByStake(
    uint256 _motionId,
    uint256 _vote,
    uint256 _stakeFraction,
    uint256 _realStake
  )
    internal
    view
    returns (uint256, uint256)
  {
    Motion storage motion = motions[_motionId];
    assert(motion.paidVoterComp == 0);

    uint256 stakerReward;
    uint256 repPenalty;

    uint256 requiredStake = getRequiredStake(_motionId);

    // Your side fully staked, receive 10% (proportional) of loser's stake
    if (
      motion.stakes[_vote] == requiredStake &&
      motion.stakes[flip(_vote)] < requiredStake
    ) {

      uint256 loserStake = motion.stakes[flip(_vote)];
      uint256 totalPenalty = wmul(loserStake, WAD / 10);
      stakerReward = wmul(_stakeFraction, add(requiredStake, totalPenalty));

    // Opponent's side fully staked, pay 10% penalty
    } else if (
      motion.stakes[_vote] < requiredStake &&
      motion.stakes[flip(_vote)] == requiredStake
    ) {

      uint256 loserStake = motion.stakes[_vote];
      uint256 totalPenalty = wmul(loserStake, WAD / 10);
      stakerReward = wmul(_stakeFraction, sub(loserStake, totalPenalty));
      repPenalty = sub(_realStake, stakerReward);

    // Neither side fully staked (or no votes were revealed), no reward or penalty
    } else {

      stakerReward = _realStake;

    }

    return (stakerReward, repPenalty);
  }

  function getVoteSecret(bytes32 _salt, uint256 _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }

  function getRequiredStake(uint256 _motionId) public view returns (uint256) {
    Motion storage motion = motions[_motionId];

    uint256 sumMaxVotes;
    for (uint256 i; i < motion.maxVotes.length; i++) {
      sumMaxVotes = add(sumMaxVotes, motion.maxVotes[i]);
    }

    return wmul(sumMaxVotes, totalStakeFraction);
  }

  function flip(uint256 _vote) internal pure returns (uint256) {
    return sub(1, _vote);
  }

  function getDomainSkillId(uint256 _domainId) internal view returns (uint256) {
    return colony.getDomain(_domainId).skillId;
  }

  function getChildSkillId(uint256 _skillId, uint256 _index) internal view returns (uint256) {
    return colonyNetwork.getChildSkillId(_skillId, _index);
  }

  function tokenLockingTransfer(uint256 _amount, address _recipient) internal {
    tokenLocking.transfer(token, _amount, _recipient, true);
  }

  function getActionDomainSkillId(bytes memory _action) internal view returns (uint256) {
    uint256 permissionDomainId;
    uint256 childSkillIndex;

    // By convention, these are the first two arguments to the function
    assembly {
      permissionDomainId := mload(add(_action, 0x24))
      childSkillIndex := mload(add(_action, 0x44))
    }

    uint256 permissionSkillId = getDomainSkillId(permissionDomainId);
    return getChildSkillId(permissionSkillId, childSkillIndex);
  }

  function executeCall(address target, bytes memory action) internal returns (bool success) {
    assembly {
              // call contract at address a with input mem[in…(in+insize))
              //   providing g gas and v wei and output area mem[out…(out+outsize))
              //   returning 0 on error (eg. out of gas) and 1 on success

              // call(g,     a,      v, in,                insize,        out, outsize)
      success := call(gas(), target, 0, add(action, 0x20), mload(action), 0, 0)
    }
  }

  function getSig(bytes memory action) internal returns (bytes4 sig) {
    assembly {
      sig := mload(add(action, 0x20))
    }
  }

  function hashExpenditureAction(bytes memory action) internal returns (bytes32 hash) {
    assembly {
      // Hash all but the domain proof and value, so actions for the same
      //   storage slot return the same value.
      // Recall: mload(action) gives length of bytes array
      // So skip past the three bytes32 (length + domain proof),
      //   plus 4 bytes for the sig. Subtract the same from the end, less
      //   the length bytes32. The value itself is located at 0xe4, zero it out.
      mstore(add(action, 0xe4), 0x0)
      hash := keccak256(add(action, 0x64), sub(mload(action), 0x44))
    }
  }

  function createClaimDelayAction(bytes memory action, bool increment)
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

    bytes32 functionSignature;
    uint256 permissionDomainId;
    uint256 childSkillIndex;
    uint256 expenditureId;
    uint256 storageSlot;

    assembly {
      functionSignature := mload(add(action, 0x20))
      permissionDomainId := mload(add(action, 0x24))
      childSkillIndex := mload(add(action, 0x44))
      expenditureId := mload(add(action, 0x64))
      storageSlot := mload(add(action, 0x84))
    }

    // If we are editing the main expenditure struct
    if (storageSlot == 25) {

      uint256 claimDelay = colony.getExpenditure(expenditureId).globalClaimDelay;
      claimDelay = increment ? add(claimDelay, 365 days) : sub(claimDelay, 365 days);

      bytes memory mainClaimDelayAction = new bytes(4 + 32 * 11); // 356 bytes

      assembly {
          mstore(add(mainClaimDelayAction, 0x20), functionSignature)
          mstore(add(mainClaimDelayAction, 0x24), permissionDomainId)
          mstore(add(mainClaimDelayAction, 0x44), childSkillIndex)
          mstore(add(mainClaimDelayAction, 0x64), expenditureId)
          mstore(add(mainClaimDelayAction, 0x84), 25)     // expenditure storage slot
          mstore(add(mainClaimDelayAction, 0xa4), 0xe0)   // mask location
          mstore(add(mainClaimDelayAction, 0xc4), 0x120)  // keys location
          mstore(add(mainClaimDelayAction, 0xe4), claimDelay)
          mstore(add(mainClaimDelayAction, 0x104), 1)     // mask length
          mstore(add(mainClaimDelayAction, 0x124), 1)     // offset
          mstore(add(mainClaimDelayAction, 0x144), 1)     // keys length
          mstore(add(mainClaimDelayAction, 0x164), 4)     // globalClaimDelay offset
      }
      return mainClaimDelayAction;

    // If we are editing an expenditure slot
    } else {

      uint256 expenditureSlot;

      assembly {
          expenditureSlot := mload(add(action, 0x184))
      }

      uint256 claimDelay = colony.getExpenditureSlot(expenditureId, expenditureSlot).claimDelay;
      claimDelay = increment ? add(claimDelay, 365 days) : sub(claimDelay, 365 days);

      bytes memory slotClaimDelayAction = new bytes(4 + 32 * 13); // 420 bytes

      assembly {
          mstore(add(slotClaimDelayAction, 0x20), functionSignature)
          mstore(add(slotClaimDelayAction, 0x24), permissionDomainId)
          mstore(add(slotClaimDelayAction, 0x44), childSkillIndex)
          mstore(add(slotClaimDelayAction, 0x64), expenditureId)
          mstore(add(slotClaimDelayAction, 0x84), 26)     // expenditureSlot storage slot
          mstore(add(slotClaimDelayAction, 0xa4), 0xe0)   // mask location
          mstore(add(slotClaimDelayAction, 0xc4), 0x140)  // keys location
          mstore(add(slotClaimDelayAction, 0xe4), claimDelay)
          mstore(add(slotClaimDelayAction, 0x104), 2)     // mask length
          mstore(add(slotClaimDelayAction, 0x124), 0)     // mapping
          mstore(add(slotClaimDelayAction, 0x144), 1)     // offset
          mstore(add(slotClaimDelayAction, 0x164), 2)     // keys length
          mstore(add(slotClaimDelayAction, 0x184), expenditureSlot)
          mstore(add(slotClaimDelayAction, 0x1a4), 1)     // claimDelay offset
      }
      return slotClaimDelayAction;

    }
  }

  function getReputationFromProof(
    uint256 _motionId,
    address _who,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal view returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRootHashKey(_key, _value, _branchMask, _siblings);
    require(motions[_motionId].rootHash == impliedRoot, "voting-invalid-root-hash");

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

    require(keyColonyAddress == address(colony), "voting-invalid-colony");
    require(keySkill == motions[_motionId].skillId, "voting-invalid-skill");
    require(keyUserAddress == _who, "voting-invalid-user");

    return reputationValue;
  }

}
