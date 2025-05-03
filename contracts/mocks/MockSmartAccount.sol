// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

  contract MockSmartAccount {
      address public entryPoint;
      address public owner;
      constructor(address _entryPoint, address _owner) {
          entryPoint = _entryPoint;
          owner = _owner;
      }
      function execute(address dest, uint256 value, bytes calldata data) external {
          require(msg.sender == entryPoint, "Only EntryPoint");
          (bool success,) = dest.call{value: value}(data);
          require(success, "Execution failed");
      }
      receive() external payable {}
  }