pragma solidity 0.7.3;

import "../../lib/dappsys/math.sol";
import "./MetaTransactionMsgSender.sol";

abstract contract BasicMetaTransaction is DSMath, MetaTransactionMsgSender {

  function getMetatransactionNonce(address userAddress) public view virtual returns (uint256 nonce);

  function incrementMetatransactionNonce(address user) internal virtual;

  event MetaTransactionExecuted(address userAddress, address payable relayerAddress, bytes functionSignature);


  function getChainID() public pure returns (uint256) {
      uint256 id;
      assembly {
          id := chainid()
      }
      return id;
  }


  event Blah(bytes);
  /**
   * Main function to be called when user wants to execute meta transaction.
   * The actual function to be called should be passed as param with name functionSignature
   * Here the basic signature recovery is being used. Signature is expected to be generated using
   * personal_sign method.
   * @param userAddress Address of user trying to do meta transaction
   * @param functionSignature Signature of the actual function to be called via meta transaction
   * @param sigR R part of the signature
   * @param sigS S part of the signature
   * @param sigV V part of the signature
   */
  function executeMetaTransaction(address userAddress, bytes memory functionSignature,
      bytes32 sigR, bytes32 sigS, uint8 sigV) public payable returns(bytes memory) {

      require(verify(userAddress, getMetatransactionNonce(userAddress), getChainID(), functionSignature, sigR, sigS, sigV), "Signer and signature do not match");
      incrementMetatransactionNonce(userAddress);

      // Append userAddress at the end to extract it from calling context
      (bool success, bytes memory returnData) = address(this).call(abi.encodePacked(functionSignature, METATRANSACTION_FLAG, userAddress));
      emit Blah(returnData);
      require(success, "Function call not successful");
      emit MetaTransactionExecuted(userAddress, msg.sender, functionSignature);
      return returnData;
  }


  // Builds a prefixed hash to mimic the behavior of eth_sign.
  function prefixed(bytes32 hash) internal pure returns (bytes32) {
      return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
  }

  function verify(address owner, uint256 nonce, uint256 chainID, bytes memory functionSignature,
      bytes32 sigR, bytes32 sigS, uint8 sigV) public view returns (bool) {

      bytes32 hash = prefixed(keccak256(abi.encodePacked(nonce, this, chainID, functionSignature)));
      address signer = ecrecover(hash, sigV, sigR, sigS);
      require(signer != address(0), "Invalid signature");
      return (owner == signer);
  }
}