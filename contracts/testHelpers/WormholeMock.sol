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
import { BytesLib } from "../../lib/wormhole/ethereum/contracts/libraries/external/BytesLib.sol";

contract WormholeMock is IWormhole {
  using BytesLib for bytes;
  bool public bridgeEnabled = true;
  uint64 cumulativeSequence = 0;

  bool vmResult = true;
  string invalidVMReason = "";

  function setVerifyVMResult(bool _valid, string memory _reason) public {
    vmResult = _valid;
    invalidVMReason = _reason;
  }

  function buildVAABody(
    uint32 timestamp,
    uint32 nonce,
    uint16 emitterChainId,
    bytes32 emitterAddress,
    uint64 sequence,
    uint8 consistencyLevel,
    bytes memory payload
  ) external pure returns (bytes memory) {
    return
      abi.encodePacked(
        timestamp,
        nonce,
        emitterChainId,
        bytes32(emitterAddress),
        sequence,
        consistencyLevel,
        payload
      );
  }

  function parseAndVerifyVM(
    bytes calldata encodedVM
  ) external view returns (VM memory vm, bool valid, string memory reason) {
    // For our mock wormhole contract, the encodedVM isn't a VAA, it's just appropriately packed data

    vm = parseVM(encodedVM);

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

  function parseVM(bytes memory encodedVM) public pure virtual returns (VM memory vm) {
    uint index = 0;

    vm.version = encodedVM.toUint8(index);
    // SECURITY: Note that currently the VM.version is not part of the hash
    // and for reasons described below it cannot be made part of the hash.
    // This means that this field's integrity is not protected and cannot be trusted.
    // This is not a problem today since there is only one accepted version, but it
    // could be a problem if we wanted to allow other versions in the future.
    require(vm.version == 1, "VM version incompatible");

    index += 1;
    vm.guardianSetIndex = encodedVM.toUint32(index);

    // Parse Signatures
    index += 4;
    uint256 signersLen = encodedVM.toUint8(index);

    vm.signatures = new Signature[](signersLen);
    for (uint i = 0; i < signersLen; i++) {
      index += 1;
      vm.signatures[i].guardianIndex = encodedVM.toUint8(index);

      index += 1;
      vm.signatures[i].r = encodedVM.toBytes32(index);

      index += 32;
      vm.signatures[i].s = encodedVM.toBytes32(index);

      index += 32;
      vm.signatures[i].v = encodedVM.toUint8(index) + 27;
    }

    /*
        Hash the body

        SECURITY: Do not change the way the hash of a VM is computed!
        Changing it could result into two different hashes for the same observation.
        But xDapps rely on the hash of an observation for replay protection.
        */
    bytes memory body = encodedVM.slice(index, encodedVM.length - index);
    vm.hash = keccak256(abi.encodePacked(keccak256(body)));

    // Parse the body
    index += 1;
    vm.timestamp = encodedVM.toUint32(index);

    index += 4;
    vm.nonce = encodedVM.toUint32(index);

    index += 4;
    vm.emitterChainId = encodedVM.toUint16(index);

    index += 2;
    vm.emitterAddress = encodedVM.toBytes32(index);

    index += 32;
    vm.sequence = encodedVM.toUint64(index);

    index += 8;
    vm.consistencyLevel = encodedVM.toUint8(index);

    index += 1;
    vm.payload = encodedVM.slice(index, encodedVM.length - index);
  }

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
