// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IEntryPoint.sol";

contract GameInstance is Ownable {
    IERC20 public token;
    string public gameTitle;
    uint256 public entryStake;
    uint256 public maxPlayers;
    uint256 public gameEndTime;
    address public immutable entryPoint;
    address[] public players;
    mapping(address => uint256) public stakes;
    bool public gameEnded;
    bool public gameCanceled;
    mapping(address => string[]) public playerQuestions;

    event PlayerJoined(address indexed player, uint256 stake);
    event GameEnded(address indexed winner, uint256 payout);
    event GameCanceled();
    event QuestionSubmitted(address indexed player, string question);
    event Refunded(address indexed player, uint256 amount);
    event Payout(address indexed winner, uint256 amount);

    constructor(
        string memory _gameTitle,
        uint256 _entryStake,
        uint256 _maxPlayers,
        uint256 _gameDuration,
        address _creator,
        address _entryPoint,
        address _token
    ) Ownable(_creator) {
        require(_entryStake > 0, "Entry stake must be greater than 0");
        require(_maxPlayers > 0, "Max players must be greater than 0");
        require(_gameDuration > 0, "Game duration must be greater than 0");
        gameTitle = _gameTitle;
        entryStake = _entryStake;
        maxPlayers = _maxPlayers;
        gameEndTime = block.timestamp + _gameDuration;
        entryPoint = _entryPoint;
        token = IERC20(_token);
    }

    function isGameActive() public view returns (bool) {
        return !gameEnded && !gameCanceled && block.timestamp <= gameEndTime;
    }

    function joinGame() external {
        require(isGameActive(), "Game is not active");
        require(players.length < maxPlayers, "Max players reached");
        require(token.transferFrom(msg.sender, address(this), entryStake), "Transfer failed");
        players.push(msg.sender);
        stakes[msg.sender] = entryStake;
        emit PlayerJoined(msg.sender, entryStake);
    }

    function joinGameWithSmartWallet(bytes calldata userOp) external {
        address sender = IEntryPoint(entryPoint).getSenderAddress(userOp);
        require(sender == msg.sender, "Invalid Smart Wallet caller");
        require(isGameActive(), "Game is not active");
        require(players.length < maxPlayers, "Max players reached");
        require(token.transferFrom(msg.sender, address(this), entryStake), "Transfer failed");
        players.push(msg.sender);
        stakes[msg.sender] = entryStake;
        emit PlayerJoined(msg.sender, entryStake);
    }

    function submitQuestion(string calldata ipfsHash) external {
        require(isGameActive(), "Game is not active");
        require(stakes[msg.sender] > 0, "Not a player");
        playerQuestions[msg.sender].push(ipfsHash);
        emit QuestionSubmitted(msg.sender, ipfsHash);
    }

    function submitQuestionWithSmartWallet(string calldata ipfsHash, bytes calldata userOp) external {
        address sender = IEntryPoint(entryPoint).getSenderAddress(userOp);
        require(sender == msg.sender, "Invalid Smart Wallet caller");
        require(isGameActive(), "Game is not active");
        require(stakes[msg.sender] > 0, "Not a player");
        playerQuestions[msg.sender].push(ipfsHash);
        emit QuestionSubmitted(msg.sender, ipfsHash);
    }

    function payout(address winner) external onlyOwner {
        require(isGameActive(), "Game is not active");
        require(stakes[winner] > 0, "Invalid winner");
        gameEnded = true;
        uint256 totalPayout = 0;
        for (uint256 i = 0; i < players.length; i++) {
            totalPayout += stakes[players[i]];
            stakes[players[i]] = 0;
        }
        require(token.transfer(winner, totalPayout), "Payout failed");
        emit Payout(winner, totalPayout);
    }

    function payoutWithSmartWallet(address winner, bytes calldata userOp) external onlyOwner {
        address sender = IEntryPoint(entryPoint).getSenderAddress(userOp);
        require(sender == msg.sender, "Invalid Smart Wallet caller");
        require(isGameActive(), "Game is not active");
        require(stakes[winner] > 0, "Invalid winner");
        gameEnded = true;
        uint256 totalPayout = 0;
        for (uint256 i = 0; i < players.length; i++) {
            totalPayout += stakes[players[i]];
            stakes[players[i]] = 0;
        }
        require(token.transfer(winner, totalPayout), "Payout failed");
        emit Payout(winner, totalPayout);
    }

    function refund() external onlyOwner {
        require(isGameActive(), "Game is not active");
        gameCanceled = true;
        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            uint256 stake = stakes[player];
            if (stake > 0) {
                stakes[player] = 0;
                require(token.transfer(player, stake), "Refund failed");
                emit Refunded(player, stake);
            }
        }
        emit GameCanceled();
    }

    function refundWithSmartWallet(bytes calldata userOp) external onlyOwner {
        address sender = IEntryPoint(entryPoint).getSenderAddress(userOp);
        require(sender == msg.sender, "Invalid Smart Wallet caller");
        require(isGameActive(), "Game is not active");
        gameCanceled = true;
        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            uint256 stake = stakes[player];
            if (stake > 0) {
                stakes[player] = 0;
                require(token.transfer(player, stake), "Refund failed");
                emit Refunded(player, stake);
            }
        }
        emit GameCanceled();
    }
}