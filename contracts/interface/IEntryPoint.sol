// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEntryPoint {
    function getSenderAddress(bytes calldata initCode) external view returns (address);
}