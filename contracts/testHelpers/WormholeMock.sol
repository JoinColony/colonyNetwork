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

import { IWormhole } from "../../lib/wormhole/ethereum/contracts/interfaces/IWormhole.sol";

contract WormholeMock is IWormhole {
  bool public bridgeEnabled = true;
  uint64 cumulativeSequence = 0;

  bool vmResult = true;
  string invalidVMReason = "";

  function setVerifyVMResult(bool _valid, string memory _reason) public {
    vmResult = _valid;
    invalidVMReason = _reason;
  }

  function buildVM(
    uint8 version,
    uint32 timestamp,
    uint32 nonce,
    uint16 emitterChainId,
    bytes32 emitterAddress,
    uint64 sequence,
    uint8 consistencyLevel,
    bytes memory payload,
    uint32 guardianSetIndex,
    Signature[] memory signatures,
    bytes32 hash
  ) external pure returns (bytes memory encodedVm) {
    return
      abi.encode(
        VM(
          version,
          timestamp,
          nonce,
          emitterChainId,
          emitterAddress,
          sequence,
          consistencyLevel,
          payload,
          guardianSetIndex,
          signatures,
          hash
        )
      );
  }

  function parseAndVerifyVM(
    bytes calldata encodedVM
  ) external view returns (VM memory vm, bool valid, string memory reason) {
    // For our mock wormhole contract, the encodedVM isn't a VAA, it's just appropriately packed data

    (vm) = abi.decode(encodedVM, (VM));

    return (vm, vmResult, invalidVMReason);
  }

  function publishMessage(
    uint32 nonce,
    bytes memory payload,
    uint8 consistencyLevel
  ) external payable returns (uint64 sequence) {
    require(bridgeEnabled, "bridge-disabled");
    cumulativeSequence += 1;

    emit LogMessagePublished(msg.sender, sequence, nonce, payload, consistencyLevel);
    return cumulativeSequence;
  }

  function initialize() external {}

  function verifyVM(VM memory vm) external view returns (bool valid, string memory reason) {}

  function verifySignatures(
    bytes32 hash,
    Signature[] memory signatures,
    GuardianSet memory guardianSet
  ) external pure returns (bool valid, string memory reason) {}

  function parseVM(bytes memory encodedVM) external pure returns (VM memory vm) {}

  function quorum(uint numGuardians) external pure returns (uint numSignaturesRequiredForQuorum) {}

  function getGuardianSet(uint32 index) external view returns (GuardianSet memory) {}

  function getCurrentGuardianSetIndex() external view returns (uint32) {}

  function getGuardianSetExpiry() external view returns (uint32) {}

  function governanceActionIsConsumed(bytes32 hash) external view returns (bool) {}

  function isInitialized(address impl) external view returns (bool) {}

  function chainId() external view returns (uint16) {
    return uint16(block.chainid % 265669);
  }

  function isFork() external view returns (bool) {}

  function governanceChainId() external view returns (uint16) {}

  function governanceContract() external view returns (bytes32) {}

  function messageFee() external view returns (uint256) {}

  function evmChainId() external view returns (uint256) {
    return block.chainid;
  }

  function nextSequence(address emitter) external view returns (uint64) {}

  function parseContractUpgrade(
    bytes memory encodedUpgrade
  ) external pure returns (ContractUpgrade memory cu) {}

  function parseGuardianSetUpgrade(
    bytes memory encodedUpgrade
  ) external pure returns (GuardianSetUpgrade memory gsu) {}

  function parseSetMessageFee(
    bytes memory encodedSetMessageFee
  ) external pure returns (SetMessageFee memory smf) {}

  function parseTransferFees(
    bytes memory encodedTransferFees
  ) external pure returns (TransferFees memory tf) {}

  function parseRecoverChainId(
    bytes memory encodedRecoverChainId
  ) external pure returns (RecoverChainId memory rci) {}

  function submitContractUpgrade(bytes memory _vm) external {}

  function submitSetMessageFee(bytes memory _vm) external {}

  function submitNewGuardianSet(bytes memory _vm) external {}

  function submitTransferFees(bytes memory _vm) external {}

  function submitRecoverChainId(bytes memory _vm) external {}

  function setBridgeEnabled(bool val) public {
    bridgeEnabled = val;
  }
}
