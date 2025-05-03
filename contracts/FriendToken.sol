// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IEntryPoint.sol";

contract FriendToken is ERC20, Ownable {
    uint256 public constant TOTAL_SUPPLY = 1000 * 10**18; // 1000 FRIEND tokens
    address public immutable entryPoint; // ERC-4337 EntryPoint
    mapping(address => bool) public isSubAccount; // Tracks authorized sub-accounts

    constructor(address initialOwner, address _entryPoint)
        ERC20("FriendToken", "FRIEND")
        Ownable(initialOwner)
    {
        entryPoint = _entryPoint;
        _mint(initialOwner, TOTAL_SUPPLY);
    }

    // Gasless transfer for Smart Wallet (ERC-4337)
    function transferWithSmartWallet(address to, uint256 amount, bytes calldata userOp) external returns (bool) {
        // Validate caller is a Smart Wallet via EntryPoint
        address sender = IEntryPoint(entryPoint).getSenderAddress(userOp);
        require(sender == msg.sender, "Invalid Smart Wallet caller");

        // Perform transfer
        return transfer(to, amount);
    }

   // Override transfer to validate Smart Wallet sub-accounts
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (isSubAccount[msg.sender] || msg.sender == tx.origin) {
            return super.transfer(to, amount);
        } else {
            try IEntryPoint(entryPoint).getSenderAddress("0x") returns (address sender) {
                require(isSubAccount[sender], "Unauthorized sub-account");
                return super.transfer(to, amount);
            } catch {
                revert("Invalid Smart Wallet caller");
            }
        }
    }

    // Register a sub-account (called by Smart Wallet owner)
    function registerSubAccount(address subAccount) external onlyOwner {
        isSubAccount[subAccount] = true;
    }

    // Deregister a sub-account
    function deregisterSubAccount(address subAccount) external onlyOwner {
        isSubAccount[subAccount] = false;
    }
}
