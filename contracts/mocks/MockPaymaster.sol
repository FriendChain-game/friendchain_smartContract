// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

contract MockPaymaster {
      address public entryPoint;
      constructor(address _entryPoint) {
          entryPoint = _entryPoint;
      }
      struct UserOp {
          address sender;
          uint256 nonce;
          bytes initCode;
          bytes callData;
          uint256 callGasLimit;
          uint256 verificationGasLimit;
          uint256 preVerificationGas;
          uint256 maxFeePerGas;
          uint256 maxPriorityFeePerGas;
          bytes paymasterAndData;
          bytes signature;
      }
      function validatePaymasterUserOp(UserOp memory userOp, bytes32 userOpHash, uint256 maxCost) public pure returns (bytes memory context, uint256 validationData) {
          return ("", 0);
      }
      receive() external payable {}
  }