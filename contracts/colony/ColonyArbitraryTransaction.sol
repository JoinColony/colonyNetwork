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

import "./../common/ERC20Extended.sol";
import "./../common/IEtherRouter.sol";
import "./../common/MultiChain.sol";
import "./../tokenLocking/ITokenLocking.sol";
import "./ColonyStorage.sol";

contract ColonyArbitraryTransaction is ColonyStorage {

  bytes4 constant APPROVE_SIG = bytes4(keccak256("approve(address,uint256)"));
  bytes4 constant TRANSFER_SIG = bytes4(keccak256("transfer(address,uint256)"));
  bytes4 constant TRANSFER_FROM_SIG = bytes4(keccak256("transferFrom(address,address,uint256)"));
  bytes4 constant BURN_SIG = bytes4(keccak256("burn(uint256)"));
  bytes4 constant BURN_GUY_SIG = bytes4(keccak256("burn(address,uint256)"));

  function makeArbitraryTransaction(address _to, bytes memory _action)
  public stoppable auth
  returns (bool)
  {
    return this.makeSingleArbitraryTransaction(_to, _action);
  }

  function makeArbitraryTransactions(address[] memory _targets, bytes[] memory _actions, bool _strict)
  public stoppable auth
  returns (bool)
  {
    require(_targets.length == _actions.length, "colony-targets-and-actions-length-mismatch");
    for (uint256 i; i < _targets.length; i += 1){
      bool success = true;
      // slither-disable-next-line unused-return
      try this.makeSingleArbitraryTransaction(_targets[i], _actions[i]) returns (bool ret){
        if (_strict){
          success = ret;
        }
      } catch {
        // We failed in a require, which is only okay if we're not in strict mode
        if (_strict){
          success = false;
        }
      }
      require(success, "colony-arbitrary-transaction-failed");
    }
    return true;
  }

  function makeSingleArbitraryTransaction(address _to, bytes memory _action)
  external stoppable self
  returns (bool)
  {
    // Prevent transactions to network contracts
    require(_to != address(this), "colony-cannot-target-self");
    require(_to != colonyNetworkAddress, "colony-cannot-target-network");
    require(_to != tokenLockingAddress, "colony-cannot-target-token-locking");

    // Prevent transactions to transfer held tokens
    bytes4 sig;
    assembly { sig := mload(add(_action, 0x20)) }

    if (sig == APPROVE_SIG) { approveTransactionPreparation(_to, _action); }
    else if (sig == BURN_SIG) { burnTransactionPreparation(_to, _action); }
    else if (sig == TRANSFER_SIG) { transferTransactionPreparation(_to, _action); }
    else if (sig == BURN_GUY_SIG || sig == TRANSFER_FROM_SIG) { burnGuyOrTransferFromTransactionPreparation(_action); }

    // Prevent transactions to network-managed extensions installed in this colony
    require(isContract(_to), "colony-to-must-be-contract");
    // slither-disable-next-line unused-return
    try ColonyExtension(_to).identifier() returns (bytes32 extensionId) {
      require(
        IColonyNetwork(colonyNetworkAddress).getExtensionInstallation(extensionId, address(this)) != _to,
        "colony-cannot-target-extensions"
      );
    } catch {}

    bool res = executeCall(_to, 0, _action);

    if (sig == APPROVE_SIG) { approveTransactionCleanup(_to, _action); }

    return res;
  }

  function approveTransactionPreparation(address _to, bytes memory _action) internal {
    address spender;
    assembly {
      spender := mload(add(_action, 0x24))
    }
    updateApprovalAmountInternal(_to, spender, false);
  }

  function approveTransactionCleanup(address _to, bytes memory _action) internal {
    address spender;
    assembly {
      spender := mload(add(_action, 0x24))
    }
    updateApprovalAmountInternal(_to, spender, true);
  }

  function burnTransactionPreparation(address _to, bytes memory _action) internal {
    uint256 amount;
    assembly {
      amount := mload(add(_action, 0x24))
    }
    fundingPots[1].balance[_to] = sub(fundingPots[1].balance[_to], amount);
    require(fundingPots[1].balance[_to] >= tokenApprovalTotals[_to], "colony-not-enough-tokens");
  }

  function transferTransactionPreparation(address _to, bytes memory _action) internal {
    uint256 amount;
    assembly {
      amount := mload(add(_action, 0x44))
    }
    fundingPots[1].balance[_to] = sub(fundingPots[1].balance[_to], amount);
    require(fundingPots[1].balance[_to] >= tokenApprovalTotals[_to], "colony-not-enough-tokens");
  }

  function burnGuyOrTransferFromTransactionPreparation(bytes memory _action) internal {
    address spender;
    assembly {
      spender := mload(add(_action, 0x24))
    }
    require(spender != address(this), "colony-cannot-spend-own-allowance");
  }

  function updateApprovalAmount(address _token, address _spender) stoppable public {
    updateApprovalAmountInternal(_token, _spender, false);
  }

  function updateApprovalAmountInternal(address _token, address _spender, bool _postApproval) internal {
    uint256 recordedApproval = tokenApprovals[_token][_spender];
    uint256 actualApproval = ERC20Extended(_token).allowance(address(this), _spender);
    if (recordedApproval == actualApproval) {
      return;
    }

    if (recordedApproval > actualApproval && !_postApproval){
      // They've spend some tokens out of root. Adjust balances accordingly
      // If we are post approval, then they have not spent tokens
      fundingPots[1].balance[_token] = add(sub(fundingPots[1].balance[_token], recordedApproval), actualApproval);
    }

    tokenApprovalTotals[_token] = add(sub(tokenApprovalTotals[_token], recordedApproval), actualApproval);
    require(fundingPots[1].balance[_token] >= tokenApprovalTotals[_token], "colony-approval-exceeds-balance");

    tokenApprovals[_token][_spender] = actualApproval;
  }

}