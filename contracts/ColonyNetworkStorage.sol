pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "../lib/dappsys/roles.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";


contract ColonyNetworkStorage is DSAuth {
  address resolver;
  uint256 colonyCount;
  uint256 currentColonyVersion;
  // TODO: We can probably do better than having three colony-related mappings
  mapping (uint => address) _coloniesIndex;
  mapping (bytes32 => address) _colonies;
  mapping (address => bool) _isColony;
  // Maps colony contract versions to respective resolvers
  mapping (uint => address) colonyVersionResolver;

  struct Skill {
    // total number of parent skills
    uint256 nParents;
    // total number of child skills
    uint256 nChildren;
    // array of `skill_id`s of parent skills starting from the 1st to `n`th, where `n` is an integer power of two larger than or equal to 1
    uint256[] parents;
    // array of `skill_id`s of all child skills
    uint256[] children;
  }
  mapping (uint => Skill) skills;
  uint256 skillCount;

  struct ReputationLogEntry {
    address user;
    int amount;
    uint skillId;
    address colony;
    uint nUpdates;
    uint nPreviousUpdates;
  }

  ReputationLogEntry[] ReputationUpdateLog;
}
