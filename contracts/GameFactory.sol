// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./GameInstance.sol";
import "./interface/IEntryPoint.sol";

contract GameFactory is Ownable {
    address public immutable entryPoint;
    address public token;
    address[] public games;
    mapping(address => bool) public isGame;

    event GameCreated(
        address indexed gameAddress,
        address indexed creator,
        string gameTitle,
        uint256 entryStake,
        uint256 maxPlayers,
        uint256 gameDuration
    );

    constructor(address _token, address initialOwner, address _entryPoint) Ownable(initialOwner) {
        token = _token;
        entryPoint = _entryPoint;
    }

    function createGame(
        string memory gameTitle,
        uint256 entryStake,
        uint256 maxPlayers,
        uint256 gameDuration
    ) external returns (address) {
        GameInstance game = new GameInstance(
            gameTitle,
            entryStake,
            maxPlayers,
            gameDuration,
            msg.sender,
            entryPoint,
            token
        );
        address gameAddress = address(game);
        games.push(gameAddress);
        isGame[gameAddress] = true;
        emit GameCreated(gameAddress, msg.sender, gameTitle, entryStake, maxPlayers, gameDuration);
        return gameAddress;
    }

    function createGameWithSmartWallet(
        string memory gameTitle,
        uint256 entryStake,
        uint256 maxPlayers,
        uint256 gameDuration,
        bytes calldata userOp
    ) external returns (address) {
        address sender = IEntryPoint(entryPoint).getSenderAddress(userOp);
        require(sender == msg.sender, "Invalid Smart Wallet caller");
        GameInstance game = new GameInstance(
            gameTitle,
            entryStake,
            maxPlayers,
            gameDuration,
            msg.sender,
            entryPoint,
            token
        );
        address gameAddress = address(game);
        games.push(gameAddress);
        isGame[gameAddress] = true;
        emit GameCreated(gameAddress, msg.sender, gameTitle, entryStake, maxPlayers, gameDuration);
        return gameAddress;
    }

    function getGames() external view returns (address[] memory) {
        return games;
    }
}