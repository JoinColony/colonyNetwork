pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./IColony.sol";
import "./ColonyStorage.sol";

contract Colony is ColonyStorage {
  // This function, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  function version() public view returns (uint256) { return 5; }

  function setToken(address _token) public
  auth
  {
    token = ERC20Extended(_token);
  }

  function getToken() public view returns (address){
    return token;
  }

  function initialiseColony(address _address) public {
    require(colonyNetworkAddress == 0x0);
    colonyNetworkAddress = _address;
    potCount = 1;

    // Initialise the task update reviewers
    IColony(this).setFunctionReviewers(0xda4db249, 0, 2); // setTaskBrief => manager, worker
    IColony(this).setFunctionReviewers(0xcae960fe, 0, 2); // setTaskDueDate => manager, worker
    IColony(this).setFunctionReviewers(0xbe2320af, 0, 2); // setTaskPayout => manager, worker
  }

  function mintTokens(uint128 _wad) public
  auth
  {
    return token.mint(_wad);
  }

  function addSkill(uint _parentSkillId) public {
    // TODO Secure this function.
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.addSkill(_parentSkillId);
  }
}
