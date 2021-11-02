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

import "./../common/BasicMetaTransaction.sol";
import "./ColonyExtension.sol";

// ignore-file-swc-108


contract Whitelist is ColonyExtension, BasicMetaTransaction {

  //  Events

  event UserApproved(address indexed _user, bool _status);
  event AgreementSigned(address indexed _user);

  // Storage

  bool useApprovals;
  string agreementHash;

  mapping (address => bool) approvals;
  mapping (address => bool) signatures;
  mapping(address => uint256) metatransactionNonces;

  function getMetatransactionNonce(address userAddress) override public view returns (uint256 nonce){
    return metatransactionNonces[userAddress];
  }

  function incrementMetatransactionNonce(address user) override internal {
    metatransactionNonces[user]++;
  }


  // Modifiers

  modifier initialised() {
    require(useApprovals || bytes(agreementHash).length > 0, "whitelist-not-initialised");
    _;
  }

  // Public

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("Whitelist");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 2;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }

  /// @notice Initialise the extension
  /// @param _useApprovals Whether or not to require administrative approval
  /// @param _agreementHash An agreement hash (such as an IPFS URI)
  function initialise(bool _useApprovals, string memory _agreementHash) public {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "whitelist-unauthorised");
    require(!useApprovals && bytes(agreementHash).length == 0, "whitelist-already-initialised");
    require(_useApprovals || bytes(_agreementHash).length > 0, "whitelist-bad-initialisation");

    useApprovals = _useApprovals;
    agreementHash = _agreementHash;

    emit ExtensionInitialised();
  }

  /// @notice Sets user statuses in the whitelist
  /// @param _users An array of user addresses
  /// @param _status The whitelist status to set
  function approveUsers(address[] memory _users, bool _status) public initialised notDeprecated {
    require(useApprovals, "whitelist-no-approvals");
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Administration), "whitelist-unauthorised");

    for (uint256 i; i < _users.length; i++) {
      approvals[_users[i]] = _status;

      emit UserApproved(_users[i], _status);
    }
  }

  /// @notice The user's signature on the agreement
  /// @param _agreementHash The agreement hash being signed
  function signAgreement(string memory _agreementHash) public initialised notDeprecated {
    require(bytes(agreementHash).length > 0, "whitelist-no-agreement");
    require(
      keccak256(abi.encodePacked(agreementHash)) ==
      keccak256(abi.encodePacked(_agreementHash)),
      "whitelist-bad-signature"
    );

    signatures[msgSender()] = true;

    emit AgreementSigned(msgSender());
  }

  /// @notice Get the user's overall whitelist status
  /// @param _user The address of the user
  function isApproved(address _user) public initialised view returns (bool) {
    return (
      !deprecated &&
      (!useApprovals || approvals[_user]) &&
      (bytes(agreementHash).length == 0 || signatures[_user])
    );
  }

  /// @notice Get the useApprovals boolean
  function getUseApprovals() public view returns (bool) {
    return useApprovals;
  }

  /// @notice Get the agreementHash
  function getAgreementHash() public view returns (string memory) {
    return agreementHash;
  }

  /// @notice Get the user's approval status
  /// @param _user The address of the user
  function getApproval(address _user) public view returns (bool) {
    return approvals[_user];
  }

  /// @notice Get the user's signature status
  /// @param _user The address of the user
  function getSignature(address _user) public view returns (bool) {
    return signatures[_user];
  }
}
