// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

contract MockEntryPoint {
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
    
    function handleOps(
        UserOp[] memory ops,
        address payable beneficiary
    ) public {
        for (uint256 i = 0; i < ops.length; i++) {
            address sender = ops[i].sender;
            (bool success, ) = sender.call{gas: ops[i].callGasLimit}(
                ops[i].callData
            );
            require(success, "Call failed");
        }
    }

    function getUserOpHash(UserOp memory userOp) public pure returns (bytes32) {
        return keccak256(abi.encode(userOp));
    }

    function getSenderAddress(
        bytes calldata userOp
    ) external view returns (address) {
        return msg.sender;
    }
}
