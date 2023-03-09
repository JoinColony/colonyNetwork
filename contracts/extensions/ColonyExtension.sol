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

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/math.sol";
import "./../common/EtherRouter.sol";
import "./../common/Multicall.sol";
import "./../colony/IColony.sol";
import "./../colony/ColonyDataTypes.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";


abstract contract ColonyExtension is DSAuth, DSMath, PatriciaTreeProofs, Multicall {
  uint256 constant UINT256_MAX = 2**256 - 1;

  event ExtensionInitialised();

  address resolver; // Align storage with EtherRouter

  IColony colony;
  bool deprecated;

  modifier notDeprecated() {
    require(!deprecated, "colony-extension-deprecated");
    _;
  }

  function identifier() public pure virtual returns (bytes32);
  function version() public pure virtual returns (uint256);
  function install(address _colony) public virtual;
  function finishUpgrade() public virtual;
  function deprecate(bool _deprecated) public virtual;
  function uninstall() public virtual;

  function getCapabilityRoles(bytes4 _sig) public view virtual returns (bytes32) {
    return bytes32(0);
  }

  function getDeprecated() public view returns (bool) {
    return deprecated;
  }

  function getColony() public view returns(address) {
    return address(colony);
  }

  function checkReputation(
    bytes32 _rootHash,
    uint256 _skillId,
    address _user,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal
    view
    returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRootHashKey(_key, _value, _branchMask, _siblings);
    require(_rootHash == impliedRoot, "colony-extension-invalid-root-hash");

    uint256 reputationValue;
    address keyColonyAddress;
    uint256 keySkillId;
    address keyUserAddress;

    assembly {
      reputationValue := mload(add(_value, 32))
      keyColonyAddress := mload(add(_key, 20))
      keySkillId := mload(add(_key, 52))
      keyUserAddress := mload(add(_key, 72))
    }

    require(keyColonyAddress == address(colony), "colony-extension-invalid-colony-address");
    // slither-disable-next-line incorrect-equality
    require(keySkillId == _skillId, "colony-extension-invalid-skill-id");
    require(keyUserAddress == _user, "colony-extension-invalid-user-address");

    return reputationValue;
  }
}
