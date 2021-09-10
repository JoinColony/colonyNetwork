pragma solidity 0.7.3;

import "./../colonyNetwork/IColonyNetwork.sol";

contract Version3 {
  function version() pure external returns (uint256) {
  	return 3;
  }
}

contract Version4 {
  function version() pure external returns (uint256) {
  	return 4;
  }
}

contract Version7 {
  function version() public pure returns (uint256) {
    return 7;
  }

  address colonyNetworkAddress;

  constructor(address _colonyNetworkAddress) public {
    colonyNetworkAddress = _colonyNetworkAddress;
  }

  function installExtension(bytes32 _extensionId, uint256 _version) public {
    IColonyNetwork(colonyNetworkAddress).installExtension(_extensionId, _version);
  }

  function upgradeExtension(bytes32 _extensionId, uint256 _newVersion) public {
    IColonyNetwork(colonyNetworkAddress).upgradeExtension(_extensionId, _newVersion);
  }

  function deprecateExtension(bytes32 _extensionId, bool _deprecated) public {
    IColonyNetwork(colonyNetworkAddress).deprecateExtension(_extensionId, _deprecated);
  }

  function uninstallExtension(bytes32 _extensionId) public {
    IColonyNetwork(colonyNetworkAddress).uninstallExtension(_extensionId);
  }
}
