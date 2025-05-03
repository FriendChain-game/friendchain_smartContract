// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721URIStorage, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IEntryPoint.sol";

contract NFTBadge is ERC721URIStorage, Ownable {
    uint256 private _tokenId;
    address public immutable entryPoint;

    error AddressZeroFound();

    constructor(
        address initialOwner, address _entryPoint
    ) ERC721("FriendChainBadge", "FCB") Ownable(initialOwner) {
        entryPoint = _entryPoint;
    }

    function mint(
        address to,
        string memory tokenURI
    ) external returns (uint256) {
        if (to == address(0)) {
            revert AddressZeroFound();
        }
        _tokenId++;

        _mint(to, _tokenId);
        _setTokenURI(_tokenId, tokenURI);

        return _tokenId;
    }

    function mintWithSmartWallet(
        address to,
        bytes calldata userOp
    ) external returns (uint256) {
        address sender = IEntryPoint(entryPoint).getSenderAddress(userOp);
        require(sender == msg.sender, "Invalid Smart Wallet caller");
        require(msg.sender == owner(), "Only owner");
        _tokenId++;
        _mint(to, _tokenId);
        return _tokenId;
    }
}
