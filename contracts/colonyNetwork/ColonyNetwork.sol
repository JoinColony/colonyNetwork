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

pragma solidity 0.8.25;
pragma experimental "ABIEncoderV2";

import { BasicMetaTransaction } from "./../common/BasicMetaTransaction.sol";
import { IReputationMiningCycle } from "./../reputationMiningCycle/IReputationMiningCycle.sol";
import { ColonyNetworkStorage } from "./ColonyNetworkStorage.sol";
import { Multicall } from "./../common/Multicall.sol";

contract ColonyNetwork is BasicMetaTransaction, ColonyNetworkStorage, Multicall {
  function isColony(address _colony) public view returns (bool) {
    return _isColony[_colony];
  }

  function getCurrentColonyVersion() public view returns (uint256) {
    return currentColonyVersion;
  }

  function getMetaColony() public view returns (address) {
    return metaColony;
  }

  function getColonyCount() public view returns (uint256) {
    return colonyCount;
  }

  function getSkillCount() public view returns (uint256) {
    return skillCount;
  }

  function getReputationMiningSkillId() public view returns (uint256) {
    return reputationMiningSkillId;
  }

  function getColonyVersionResolver(uint256 _version) public view returns (address) {
    return colonyVersionResolver[_version];
  }

  function getSkill(uint256 _skillId) public view returns (Skill memory skill) {
    skill = skills[_skillId];
  }

  function getReputationRootHash() public view returns (bytes32) {
    return reputationRootHash;
  }

  function getReputationRootHashNLeaves() public view returns (uint256) {
    return reputationRootHashNLeaves;
  }

  function getReputationRootHashNNodes() public view returns (uint256) {
    return reputationRootHashNLeaves;
  }

  function setTokenLocking(address _tokenLocking) public stoppable auth {
    require(_tokenLocking != address(0x0), "colony-token-locking-cannot-be-zero");

    // Token locking address can't be changed
    require(tokenLocking == address(0x0), "colony-token-locking-address-already-set");

    tokenLocking = _tokenLocking;

    emit TokenLockingAddressSet(_tokenLocking);
  }

  function getTokenLocking() public view returns (address) {
    return tokenLocking;
  }

  function addColonyVersion(uint _version, address _resolver) public always calledByMetaColony {
    require(currentColonyVersion > 0, "colony-network-not-intialised-cannot-add-colony-version");

    colonyVersionResolver[_version] = _resolver;
    if (_version > currentColonyVersion) {
      currentColonyVersion = _version;
    }

    emit ColonyVersionAdded(_version, _resolver);
  }

  function initialise(address _resolver, uint256 _version) public stoppable auth {
    require(currentColonyVersion == 0, "colony-network-already-initialised");
    require(_version > 0, "colony-network-invalid-version");
    colonyVersionResolver[_version] = _resolver;
    currentColonyVersion = _version;

    emit ColonyNetworkInitialised(_resolver);
  }

  function getColony(uint256 _id) public view returns (address) {
    return colonies[_id];
  }

  function checkNotAdditionalProtectedVariable(uint256 _slot) public view {
    // solhint-disable-line no-empty-blocks
  }

  function getFeeInverse() public view returns (uint256 _feeInverse) {
    return feeInverse;
  }

  function setFeeInverse(uint256 _feeInverse) public stoppable calledByMetaColony {
    require(_feeInverse > 0, "colony-network-fee-inverse-cannot-be-zero");
    feeInverse = _feeInverse;

    emit NetworkFeeInverseSet(_feeInverse);
  }

  function getMetatransactionNonce(address _user) public view override returns (uint256 nonce) {
    return metatransactionNonces[_user];
  }

  function setPayoutWhitelist(address _token, bool _status) public stoppable calledByMetaColony {
    payoutWhitelist[_token] = _status;

    emit TokenWhitelisted(_token, _status);
  }

  function getPayoutWhitelist(address _token) public view returns (bool) {
    return payoutWhitelist[_token];
  }

  function incrementMetatransactionNonce(address _user) internal override {
    // We need to protect the metatransaction nonce slots, otherwise those with recovery
    // permissions could replay metatransactions, which would be a disaster.
    // What slot are we setting?
    // This mapping is in slot 41 (see ColonyNetworkStorage.sol);
    uint256 slot = uint256(
      keccak256(abi.encode(uint256(uint160(_user)), uint256(METATRANSACTION_NONCES_SLOT)))
    );
    protectSlot(slot);
    metatransactionNonces[_user] += 1;
  }
}
