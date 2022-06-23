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
import "./../colony/ColonyRoles.sol";
import "./../common/BasicMetaTransaction.sol";
import "./../common/ERC20Extended.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../tokenLocking/ITokenLocking.sol";
import "./ColonyExtension.sol";


contract VotingReputation is ColonyExtension, PatriciaTreeProofs, BasicMetaTransaction {

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

  // Initialization data
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
  mapping(address => uint256) metatransactionNonces;
  function getMetatransactionNonce(address userAddress) override public view returns (uint256 nonce){
    return metatransactionNonces[userAddress];
  }

  function incrementMetatransactionNonce(address user) override internal {
    metatransactionNonces[user]++;
  }

  // Modifiers

  modifier onlyRoot() {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "voting-rep-caller-not-root");
    _;
  }

  // Public

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("VotingReputation");
  }

  /// @notice Return the version number
  /// @return The version number
  function version() public pure override returns (uint256) {
    return 4;
  }

  /// @notice Install the extension
  /// @param _colony Base colony for the installation
  function install(address _colony) public override {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();
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
    require(state == ExtensionState.Deployed, "voting-rep-already-initialised");

    require(_totalStakeFraction <= WAD / 2, "voting-rep-greater-than-half-wad");
    require(_voterRewardFraction <= WAD / 2, "voting-rep-greater-than-half-wad");

    require(_userMinStakeFraction <= WAD, "voting-rep-greater-than-wad");
    require(_maxVoteFraction <= WAD, "voting-rep-greater-than-wad");

    require(_stakePeriod <= 365 days, "voting-rep-period-too-long");
    require(_submitPeriod <= 365 days, "voting-rep-period-too-long");
    require(_revealPeriod <= 365 days, "voting-rep-period-too-long");
    require(_escalationPeriod <= 365 days, "voting-rep-period-too-long");

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

  // Data structures
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
    bytes action;
  }

  // Storage
  uint256 motionCount;
  mapping (uint256 => Motion) motions;
  mapping (uint256 => mapping (address => mapping (uint256 => uint256))) stakes;
  mapping (uint256 => mapping (address => bytes32)) voteSecrets;

  mapping (bytes32 => uint256) expenditurePastVotes; // expenditure slot signature => voting power
  mapping (bytes32 => uint256) expenditureMotionCounts; // expenditure struct signature => count

  // Public functions (interface)

  /// @notice Create a motion
  /// @param _domainId The domain where we vote on the motion
  /// @param _childSkillIndex The childSkillIndex pointing to the domain of the action
  /// @param _altTarget The contract to which we send the action (0x0 for the colony)
  /// @param _action A bytes array encoding a function call
  /// @param _key Reputation tree key for the root domain
  /// @param _value Reputation tree value for the root domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
 function createMotion(
    uint256 _domainId,
    uint256 _childSkillIndex,
    address _altTarget,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
    notDeprecated
  {
    require(state == ExtensionState.Active, "voting-rep-not-active");
    require(_altTarget != address(colony), "voting-rep-alt-target-cannot-be-base-colony");

    address target = getTarget(_altTarget);
    bytes4 action = getSig(_action);

    require(action != OLD_MOVE_FUNDS_SIG, "voting-rep-disallowed-function");

    uint256 skillId;

    if (ColonyRoles(target).getCapabilityRoles(action) | ROOT_ROLES == ROOT_ROLES) {

      // A root or unpermissioned function
      require(_domainId == 1 && _childSkillIndex == UINT256_MAX, "voting-rep-invalid-domain-id");
      skillId = colony.getDomain(1).skillId;

    } else {

      // A domain permissioned function
      skillId = colony.getDomain(_domainId).skillId;
      uint256 actionDomainSkillId = getActionDomainSkillId(_action);

      if (skillId != actionDomainSkillId) {
        uint256 childSkillId = colonyNetwork.getChildSkillId(skillId, _childSkillIndex);
        require(childSkillId == actionDomainSkillId, "voting-rep-invalid-domain-id");
      } else {
        require(_childSkillIndex == UINT256_MAX, "voting-rep-invalid-domain-id");
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

    motion.skillRep = getReputationFromProof(motionCount, address(0x0), _key, _value, _branchMask, _siblings);
    motion.altTarget = _altTarget;
    motion.action = _action;

    emit MotionCreated(motionCount, msgSender(), _domainId);
  }

  /// @notice @deprecated
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
    createMotion(1, UINT256_MAX, _altTarget, _action, _key, _value, _branchMask, _siblings);
  }

  /// @notice @deprecated
  /// @notice Create a motion in any domain
  /// @param _domainId The domain where we vote on the motion
  /// @param _childSkillIndex The childSkillIndex pointing to the domain of the action
  /// @param _action A bytes array encoding a function call
  /// @param _key Reputation tree key for the domain
  /// @param _value Reputation tree value for the domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function createDomainMotion(
    uint256 _domainId,
    uint256 _childSkillIndex,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    createMotion(_domainId, _childSkillIndex, address(0x0), _action, _key, _value, _branchMask, _siblings);
  }

  /// @notice Stake on a motion
  /// @param _motionId The id of the motion
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the motion is occurring
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @param _amount The amount of tokens being staked
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function stakeMotion(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _vote,
    uint256 _amount,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(_vote <= 1, "voting-rep-bad-vote");
    require(getMotionState(_motionId) == MotionState.Staking, "voting-rep-motion-not-staking");

    uint256 requiredStake = getRequiredStake(_motionId);
    uint256 amount = min(_amount, sub(requiredStake, motion.stakes[_vote]));
    require(amount > 0, "voting-rep-bad-amount");

    uint256 stakerTotalAmount = add(stakes[_motionId][msgSender()][_vote], amount);

    require(
      stakerTotalAmount <= getReputationFromProof(_motionId, msgSender(), _key, _value, _branchMask, _siblings),
      "voting-rep-insufficient-rep"
    );
    require(
      stakerTotalAmount >= wmul(requiredStake, userMinStakeFraction) ||
      add(motion.stakes[_vote], amount) == requiredStake, // To prevent a residual stake from being un-stakable
      "voting-rep-insufficient-stake"
    );

    // Update the stake
    motion.stakes[_vote] = add(motion.stakes[_vote], amount);
    stakes[_motionId][msgSender()][_vote] = stakerTotalAmount;

    // Increment counter & extend claim delay if staking for an expenditure state change
    if (
      _vote == YAY &&
      !motion.escalated &&
      motion.stakes[YAY] == requiredStake &&
      getSig(motion.action) == CHANGE_FUNCTION_SIG &&
      motion.altTarget == address(0x0)
    ) {
      bytes32 structHash = hashExpenditureActionStruct(motion.action);
      expenditureMotionCounts[structHash] = add(expenditureMotionCounts[structHash], 1);
      // Set to UINT256_MAX / 3 to avoid overflow (finalizedTimestamp + globalClaimDelay + claimDelay)
      bytes memory claimDelayAction = createClaimDelayAction(motion.action, UINT256_MAX / 3);
      require(executeCall(_motionId, claimDelayAction), "voting-rep-expenditure-lock-failed");
    }

    emit MotionStaked(_motionId, msgSender(), _vote, amount);

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
      delete motion.votes;
      delete motion.repSubmitted;

      emit MotionEventSet(_motionId, STAKE_END);
    }

    // Do the external bookkeeping
    tokenLocking.deposit(token, 0, true); // Faux deposit to clear any locks
    colony.obligateStake(msgSender(), motion.domainId, amount);
    colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), msgSender(), motion.domainId, amount, address(this));
  }

  /// @notice Submit a vote secret for a motion
  /// @param _motionId The id of the motion
  /// @param _voteSecret The hashed vote secret
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function submitVote(
    uint256 _motionId,
    bytes32 _voteSecret,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Submit, "voting-rep-motion-not-open");
    require(_voteSecret != bytes32(0), "voting-rep-invalid-secret");

    uint256 userRep = getReputationFromProof(_motionId, msgSender(), _key, _value, _branchMask, _siblings);

    // Count reputation if first submission
    if (voteSecrets[_motionId][msgSender()] == bytes32(0)) {
      motion.repSubmitted = add(motion.repSubmitted, userRep);
    }

    voteSecrets[_motionId][msgSender()] = _voteSecret;

    emit MotionVoteSubmitted(_motionId, msgSender());

    if (motion.repSubmitted >= wmul(motion.skillRep, maxVoteFraction)) {
      motion.events[SUBMIT_END] = uint64(block.timestamp);
      motion.events[REVEAL_END] = uint64(block.timestamp + revealPeriod);

      emit MotionEventSet(_motionId, SUBMIT_END);
    }
  }

  /// @notice Reveal a vote secret for a motion
  /// @param _motionId The id of the motion
  /// @param _salt The salt used to hash the vote
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function revealVote(
    uint256 _motionId,
    bytes32 _salt,
    uint256 _vote,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Reveal, "voting-rep-motion-not-reveal");
    require(_vote <= 1, "voting-rep-bad-vote");

    uint256 userRep = getReputationFromProof(_motionId, msgSender(), _key, _value, _branchMask, _siblings);
    motion.votes[_vote] = add(motion.votes[_vote], userRep);

    bytes32 voteSecret = voteSecrets[_motionId][msgSender()];
    require(voteSecret == getVoteSecret(_salt, _vote), "voting-rep-secret-no-match");
    delete voteSecrets[_motionId][msgSender()];

    uint256 voterReward = getVoterReward(_motionId, userRep);
    motion.paidVoterComp = add(motion.paidVoterComp, voterReward);

    emit MotionVoteRevealed(_motionId, msgSender(), _vote);

    // See if reputation revealed matches reputation submitted
    if (add(motion.votes[NAY], motion.votes[YAY]) == motion.repSubmitted) {
      motion.events[REVEAL_END] = uint64(block.timestamp);

      emit MotionEventSet(_motionId, REVEAL_END);
    }

    tokenLocking.transfer(token, voterReward, msgSender(), true);
  }

  /// @notice Escalate a motion to a higher domain
  /// @param _motionId The id of the motion
  /// @param _newDomainId The desired domain of escalation
  /// @param _childSkillIndex For the current domain, relative to the escalated domain
  /// @param _key Reputation tree key for the new domain
  /// @param _value Reputation tree value for the new domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function escalateMotion(
    uint256 _motionId,
    uint256 _newDomainId,
    uint256 _childSkillIndex,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Closed, "voting-rep-motion-not-closed");

    uint256 newDomainSkillId = colony.getDomain(_newDomainId).skillId;
    uint256 childSkillId = colonyNetwork.getChildSkillId(newDomainSkillId, _childSkillIndex);
    require(childSkillId == motion.skillId, "voting-rep-invalid-domain-proof");

    uint256 domainId = motion.domainId;
    motion.domainId = _newDomainId;
    motion.skillId = newDomainSkillId;
    motion.skillRep = getReputationFromProof(_motionId, address(0x0), _key, _value, _branchMask, _siblings);

    uint256 loser = (motion.votes[NAY] < motion.votes[YAY]) ? NAY : YAY;
    motion.stakes[loser] = sub(motion.stakes[loser], motion.paidVoterComp);
    motion.pastVoterComp[loser] = add(motion.pastVoterComp[loser], motion.paidVoterComp);
    delete motion.paidVoterComp;

    uint256 requiredStake = getRequiredStake(_motionId);
    motion.events[STAKE_END] = (motion.stakes[NAY] < requiredStake || motion.stakes[YAY] < requiredStake) ?
      uint64(block.timestamp + stakePeriod) : uint64(block.timestamp);

    motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
    motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);

    motion.escalated = true;

    emit MotionEscalated(_motionId, msgSender(), domainId, _newDomainId);

    if (motion.events[STAKE_END] <= uint64(block.timestamp)) {
      emit MotionEventSet(_motionId, STAKE_END);
    }
  }

  function finalizeMotion(uint256 _motionId) public {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Finalizable, "voting-rep-motion-not-finalizable");

    assert(
      motion.stakes[YAY] == getRequiredStake(_motionId) ||
      add(motion.votes[NAY], motion.votes[YAY]) > 0
    );

    motion.finalized = true;

    bool canExecute = (
      motion.stakes[NAY] < motion.stakes[YAY] ||
      motion.votes[NAY] < motion.votes[YAY]
    );

    if (
      getSig(motion.action) == CHANGE_FUNCTION_SIG &&
      getTarget(motion.altTarget) == address(colony)
    ) {
      bytes32 structHash = hashExpenditureActionStruct(motion.action);
      expenditureMotionCounts[structHash] = sub(expenditureMotionCounts[structHash], 1);

      // Release the claimDelay if this is the last active motion
      if (expenditureMotionCounts[structHash] == 0) {
        bytes memory claimDelayAction = createClaimDelayAction(motion.action, 0);
        // No require this time, since we don't want stakes to be permanently locked
        executeCall(_motionId, claimDelayAction);
      }

      bytes32 actionHash = hashExpenditureAction(motion.action);
      uint256 votePower = (add(motion.votes[NAY], motion.votes[YAY]) > 0) ?
        motion.votes[YAY] : motion.stakes[YAY];

      if (expenditurePastVotes[actionHash] < votePower) {
        expenditurePastVotes[actionHash] = votePower;
      } else {
        canExecute = false;
      }
    }

    bool executed;

    if (canExecute) {
      executed = executeCall(_motionId, motion.action);
      require(executed || failingExecutionAllowed(_motionId), "voting-execution-failed-not-one-week");
    }

    emit MotionFinalized(_motionId, motion.action, executed);
  }


  /// @notice Return whether a motion, assuming it's in the finalizable state,
  // is allowed to finalize without the call executing successfully.
  /// @param _motionId The id of the motion
  /// @dev We are only expecting this to be called from finalize motion in the contracts.
  /// It is marked as public only so that the frontend can use it.
  function failingExecutionAllowed(uint256 _motionId) public view returns (bool) {
    Motion storage motion = motions[_motionId];
    uint256 requiredStake = getRequiredStake(_motionId);

    // Failing execution is allowed if we didn't fully stake, and it's been a week since staking ended
    if (motion.stakes[YAY] < requiredStake || motion.stakes[NAY] < requiredStake) {
      return block.timestamp >= motion.events[STAKE_END] + 7 days;
    } else {
      // It was fully staked, and went to a vote.
      // Failing execution is also allowed if it's been a week since reveal ended
      return block.timestamp >= motion.events[REVEAL_END] + 7 days;
    }
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
    Motion storage motion = motions[_motionId];
    require(
      getMotionState(_motionId) == MotionState.Finalized ||
      getMotionState(_motionId) == MotionState.Failed,
      "voting-rep-motion-not-claimable"
    );

    (uint256 stakerReward, uint256 repPenalty) = getStakerReward(_motionId, _staker, _vote);

    require(stakes[_motionId][_staker][_vote] > 0, "voting-rep-nothing-to-claim");
    delete stakes[_motionId][_staker][_vote];

    tokenLocking.transfer(token, stakerReward, _staker, true);

    if (repPenalty > 0) {
      colony.emitDomainReputationPenalty(
        _permissionDomainId,
        _childSkillIndex,
        motion.domainId,
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

  /// @notice Get the number of ongoing motions for a single expenditure / expenditure slot
  /// @param _structHash The hash of the expenditureId or expenditureId*expenditureSlot
  /// @return The number of ongoing motions
  function getExpenditureMotionCount(bytes32 _structHash) public view returns (uint256) {
    return expenditureMotionCounts[_structHash];
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
    } else if (
      motion.stakes[YAY] < requiredStake ||
      motion.stakes[NAY] < requiredStake
    ) {

      // Are we still staking?
      if (block.timestamp < motion.events[STAKE_END]) {
        return MotionState.Staking;
      // If not, did the YAY side stake?
      } else if (motion.stakes[YAY] == requiredStake) {
        return MotionState.Finalizable;
      // If not, was there a prior vote we can fall back on?
      } else if (add(motion.votes[NAY], motion.votes[YAY]) > 0) {
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
        block.timestamp < motion.events[REVEAL_END] + escalationPeriod &&
        motion.domainId > 1
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
  /// @param _voterRep The reputation the voter has in the domain
  /// @return The voter reward
  function getVoterReward(uint256 _motionId, uint256 _voterRep) public view returns (uint256) {
    Motion storage motion = motions[_motionId];
    uint256 fractionUserReputation = wdiv(_voterRep, motion.repSubmitted);
    uint256 totalStake = add(motion.stakes[YAY], motion.stakes[NAY]);
    return wmul(wmul(fractionUserReputation, totalStake), voterRewardFraction);
  }

  /// @notice Get the range of potential rewards for a voter on a specific motion, intended to be
  /// used when the motion is in the reveal state.
  /// Once a motion is in the reveal state the reward is known, and getVoterRewardRange should be used.
  /// @param _motionId The id of the motion
  /// @param _voterRep The reputation the voter has in the domain
  /// @param _voterAddress The address the user will be voting as
  /// @return The voter reward
  function getVoterRewardRange(uint256 _motionId, uint256 _voterRep, address _voterAddress) public view returns (uint256, uint256) {
    Motion storage motion = motions[_motionId];
    // The minimum reward is when everyone has voted, with a total weight of motion.skillRep
    uint256 minFractionUserReputation = wdiv(_voterRep, motion.skillRep);

    // The maximum reward is when this user is the only other person who votes (if they haven't already),
    // aside from those who have already done so
    uint256 voteTotal = motion.repSubmitted;
    // Has the user already voted?
    if (voteSecrets[_motionId][_voterAddress] == bytes32(0)) {
      // They have not, so add their rep
      voteTotal = add(voteTotal, _voterRep);
    }
    uint256 maxFractionUserReputation = wdiv(_voterRep, voteTotal);

    uint256 totalStake = add(motion.stakes[YAY], motion.stakes[NAY]);
    return (
      wmul(wmul(minFractionUserReputation, totalStake), voterRewardFraction),
      wmul(wmul(maxFractionUserReputation, totalStake), voterRewardFraction)
    );
  }

  /// @notice Get the staker reward
  /// @param _motionId The id of the motion
  /// @param _staker The staker's address
  /// @param _vote The vote (0 = NAY, 1 = YAY)
  /// @return The staker reward and the reputation penalty (if any)
  function getStakerReward(uint256 _motionId, address _staker, uint256 _vote) public view returns (uint256, uint256) {
    Motion storage motion = motions[_motionId];

    uint256 totalSideStake = add(motion.stakes[_vote], motion.pastVoterComp[_vote]);
    if (totalSideStake == 0) { return (0, 0); }

    uint256 stakeFraction = wdiv(stakes[_motionId][_staker][_vote], totalSideStake);

    uint256 realStake = wmul(stakeFraction, motion.stakes[_vote]);

    uint256 stakerReward;
    uint256 repPenalty;

    // Went to a vote, use vote to determine reward or penalty
    if (add(motion.votes[NAY], motion.votes[YAY]) > 0) {

      uint256 loserStake;
      uint256 winnerStake;
      if (motion.votes[YAY] > motion.votes[NAY]){
        loserStake = motion.stakes[NAY];
        winnerStake = motion.stakes[YAY];
      } else {
        loserStake = motion.stakes[YAY];
        winnerStake = motion.stakes[NAY];
      }

      loserStake = sub(loserStake, motion.paidVoterComp);
      uint256 totalVotes = add(motion.votes[NAY], motion.votes[YAY]);
      uint256 winFraction = wdiv(motion.votes[_vote], totalVotes);
      uint256 winShare = wmul(winFraction, 2 * WAD); // On a scale of 0-2 WAD

      if (winShare > WAD || (winShare == WAD && _vote == NAY)) {
        // 50% gets 0% of loser's stake, 100% gets 100% of loser's stake, linear in between
        stakerReward = wmul(stakeFraction, add(winnerStake, wmul(loserStake, winShare - WAD)));
      } else {
        stakerReward = wmul(stakeFraction, wmul(loserStake, winShare));
        repPenalty = sub(realStake, stakerReward);
      }

    // Determine rewards based on stakes alone
    } else {
      assert(motion.paidVoterComp == 0);
      uint256 requiredStake = getRequiredStake(_motionId);

      // Your side fully staked, receive 10% (proportional) of loser's stake
      if (
        motion.stakes[_vote] == requiredStake &&
        motion.stakes[flip(_vote)] < requiredStake
      ) {

        uint256 loserStake = motion.stakes[flip(_vote)];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, add(requiredStake, totalPenalty));

      // Opponent's side fully staked, pay 10% penalty
      } else if (
        motion.stakes[_vote] < requiredStake &&
        motion.stakes[flip(_vote)] == requiredStake
      ) {

        uint256 loserStake = motion.stakes[_vote];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, sub(loserStake, totalPenalty));
        repPenalty = sub(realStake, stakerReward);

      // Neither side fully staked (or no votes were revealed), no reward or penalty
      } else {

        stakerReward = realStake;

      }
    }

    return (stakerReward, repPenalty);
  }

  // Internal functions

  function getVoteSecret(bytes32 _salt, uint256 _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }

  function getRequiredStake(uint256 _motionId) internal view returns (uint256) {
    return wmul(motions[_motionId].skillRep, totalStakeFraction);
  }

  function getTarget(address _target) internal view returns (address) {
    return (_target == address(0x0)) ? address(colony) : _target;
  }

  function flip(uint256 _vote) internal pure returns (uint256) {
    return sub(1, _vote);
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
    require(motions[_motionId].rootHash == impliedRoot, "voting-rep-invalid-root-hash");

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

    require(keyColonyAddress == address(colony), "voting-rep-invalid-colony-address");
    require(keySkill == motions[_motionId].skillId, "voting-rep-invalid-skill-id");
    require(keyUserAddress == _who, "voting-rep-invalid-user-address");

    return reputationValue;
  }

  function getActionDomainSkillId(bytes memory _action) internal view returns (uint256) {
    uint256 permissionDomainId;
    uint256 childSkillIndex;

    assembly {
      permissionDomainId := mload(add(_action, 0x24))
      childSkillIndex := mload(add(_action, 0x44))
    }

    uint256 permissionSkillId = colony.getDomain(permissionDomainId).skillId;
    return colonyNetwork.getChildSkillId(permissionSkillId, childSkillIndex);
  }

  function executeCall(uint256 motionId, bytes memory action) internal returns (bool success) {
    address to = getTarget(motions[motionId].altTarget);

    assembly {
              // call contract at address a with input mem[in…(in+insize))
              //   providing g gas and v wei and output area mem[out…(out+outsize))
              //   returning 0 on error (eg. out of gas) and 1 on success

              // call(g,   a,  v, in,                insize,        out, outsize)
      success := call(gas(), to, 0, add(action, 0x20), mload(action), 0, 0)
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

  function hashExpenditureActionStruct(bytes memory action) internal returns (bytes32 hash) {
    assert(getSig(action) == CHANGE_FUNCTION_SIG);

    uint256 expenditureId;
    uint256 storageSlot;
    uint256 expenditureSlot;

    assembly {
      expenditureId := mload(add(action, 0x64))
      storageSlot := mload(add(action, 0x84))
      expenditureSlot := mload(add(action, 0x184))
    }

    if (storageSlot == 25) {
      hash = keccak256(abi.encodePacked(expenditureId));
    } else {
      hash = keccak256(abi.encodePacked(expenditureId, expenditureSlot));
    }
  }

  function createClaimDelayAction(bytes memory action, uint256 value)
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

      bytes memory mainClaimDelayAction = new bytes(4 + 32 * 11); // 356 bytes
      assembly {
          mstore(add(mainClaimDelayAction, 0x20), functionSignature)
          mstore(add(mainClaimDelayAction, 0x24), permissionDomainId)
          mstore(add(mainClaimDelayAction, 0x44), childSkillIndex)
          mstore(add(mainClaimDelayAction, 0x64), expenditureId)
          mstore(add(mainClaimDelayAction, 0x84), 25)     // expenditure storage slot
          mstore(add(mainClaimDelayAction, 0xa4), 0xe0)   // mask location
          mstore(add(mainClaimDelayAction, 0xc4), 0x120)  // keys location
          mstore(add(mainClaimDelayAction, 0xe4), value)
          mstore(add(mainClaimDelayAction, 0x104), 1)     // mask length
          mstore(add(mainClaimDelayAction, 0x124), 1)     // offset
          mstore(add(mainClaimDelayAction, 0x144), 1)     // keys length
          mstore(add(mainClaimDelayAction, 0x164), 4)     // globalClaimDelay offset
      }
      return mainClaimDelayAction;

    // If we are editing an expenditure slot
    } else {

      bytes memory slotClaimDelayAction = new bytes(4 + 32 * 13); // 420 bytes
      uint256 expenditureSlot;

      assembly {
          expenditureSlot := mload(add(action, 0x184))

          mstore(add(slotClaimDelayAction, 0x20), functionSignature)
          mstore(add(slotClaimDelayAction, 0x24), permissionDomainId)
          mstore(add(slotClaimDelayAction, 0x44), childSkillIndex)
          mstore(add(slotClaimDelayAction, 0x64), expenditureId)
          mstore(add(slotClaimDelayAction, 0x84), 26)     // expenditureSlot storage slot
          mstore(add(slotClaimDelayAction, 0xa4), 0xe0)   // mask location
          mstore(add(slotClaimDelayAction, 0xc4), 0x140)  // keys location
          mstore(add(slotClaimDelayAction, 0xe4), value)
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
}
