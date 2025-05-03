const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("GameFactory", function () {
  // Fixture to deploy GameFactory and dependencies
  async function deployGameFactory() {
    const [owner, creator, other] = await ethers.getSigners();

    // Deploy mock EntryPoint
    const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
    const entryPoint = await EntryPoint.deploy();

    // Deploy mock Paymaster
    const MockPaymaster = await ethers.getContractFactory("MockPaymaster");
    const paymaster = await MockPaymaster.deploy(entryPoint.target);

    // Deploy mock FriendToken
    const FriendToken = await ethers.getContractFactory("FriendToken");
    const token = await FriendToken.deploy(owner.address, entryPoint.target);

    // Deploy GameFactory
    const GameFactory = await ethers.getContractFactory("GameFactory");
    const factory = await GameFactory.deploy(token.target, owner.address, entryPoint.target);

    // Deploy mock SmartAccount
    const SmartAccount = await ethers.getContractFactory("MockSmartAccount");
    const smartAccount = await SmartAccount.deploy(entryPoint.target, creator.address);

    // Parameters for game creation
    const gameTitle = "Trivia Challenge";
    const entryStake = ethers.parseEther("10");
    const maxPlayers = 3;
    const gameDuration = 3600; // 1 hour

    return { factory, token, entryPoint, paymaster, smartAccount, owner, creator, other, gameTitle, entryStake, maxPlayers, gameDuration };
  }

  describe("Deployment", function () {
    it("Should set correct token, owner, and entryPoint", async function () {
      const { factory, token, owner, entryPoint } = await loadFixture(deployGameFactory);
      expect(await factory.token()).to.equal(token.target);
      expect(await factory.owner()).to.equal(owner.address);
      expect(await factory.entryPoint()).to.equal(entryPoint.target);
    });
  });

  describe("createGame", function () {
    it("Should create a game and update state", async function () {
      const { factory, creator, gameTitle, entryStake, maxPlayers, gameDuration } = await loadFixture(deployGameFactory);
      const tx = await factory.connect(creator).createGame(gameTitle, entryStake, maxPlayers, gameDuration);
      const receipt = await tx.wait();
      const gameAddress = (await factory.getGames())[0];

      // Verify state
      expect(await factory.isGame(gameAddress)).to.be.true;
      expect((await factory.getGames()).length).to.equal(1);
      expect((await factory.getGames())[0]).to.equal(gameAddress);

      // Verify event
      const event = receipt.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "GameCreated");
      expect(event).to.exist;
      expect(event.args.gameAddress).to.equal(gameAddress);
      expect(event.args.creator).to.equal(creator.address);
      expect(event.args.gameTitle).to.equal(gameTitle);
      expect(event.args.entryStake).to.equal(entryStake);
      expect(event.args.maxPlayers).to.equal(maxPlayers);
      expect(event.args.gameDuration).to.equal(gameDuration);

      // Verify GameInstance initialization
      const GameInstance = await ethers.getContractFactory("GameInstance");
      const game = GameInstance.attach(gameAddress);
      expect(await game.token()).to.equal(await factory.token());
      expect(await game.gameTitle()).to.equal(gameTitle);
      expect(await game.entryStake()).to.equal(entryStake);
      expect(await game.maxPlayers()).to.equal(maxPlayers);
      expect(await game.gameEndTime()).to.be.closeTo(
        (await ethers.provider.getBlock("latest")).timestamp + gameDuration,
        100
      );
      expect(await game.owner()).to.equal(creator.address);
      expect(await game.entryPoint()).to.equal(await factory.entryPoint());
    });
  });

  describe("createGameWithSmartWallet", function () {
    it("Should create a game gaslessly via Smart Wallet", async function () {
      const { factory, creator, smartAccount, entryPoint, paymaster, owner, gameTitle, entryStake, maxPlayers, gameDuration } = await loadFixture(deployGameFactory);
      // Fund paymaster
      await owner.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1") });

      // Encode createGameWithSmartWallet call
      const createData = factory.interface.encodeFunctionData("createGameWithSmartWallet", [
        gameTitle,
        entryStake,
        maxPlayers,
        gameDuration,
        "0x",
      ]);

      // Create UserOperation
      const userOp = {
        sender: smartAccount.target,
        nonce: 0,
        initCode: "0x",
        callData: smartAccount.interface.encodeFunctionData("execute", [factory.target, 0, createData]),
        callGasLimit: 300000,
        verificationGasLimit: 150000,
        preVerificationGas: 21000,
        maxFeePerGas: ethers.parseUnits("10", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
        paymasterAndData: paymaster.target + "0".repeat(64),
        signature: "0x",
      };

      // Sign UserOperation
      const userOpHash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await creator.signMessage(ethers.getBytes(userOpHash));

      // Execute UserOperation
      await entryPoint.handleOps([userOp], owner.address);

      // Verify state
      const gameAddress = (await factory.getGames())[0];
      expect(await factory.isGame(gameAddress)).to.be.true;
      expect((await factory.getGames()).length).to.equal(1);
      expect((await factory.getGames())[0]).to.equal(gameAddress);

      // Verify event
      const receipt = await ethers.provider.getTransactionReceipt((await entryPoint.getTransactionCount() - 1).toHexString());
      const event = receipt.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "GameCreated");
      expect(event).to.exist;
      expect(event.args.gameAddress).to.equal(gameAddress);
      expect(event.args.creator).to.equal(smartAccount.target);
      expect(event.args.gameTitle).to.equal(gameTitle);
      expect(event.args.entryStake).to.equal(entryStake);
      expect(event.args.maxPlayers).to.equal(maxPlayers);
      expect(event.args.gameDuration).to.equal(gameDuration);

      // Verify GameInstance initialization
      const GameInstance = await ethers.getContractFactory("GameInstance");
      const game = GameInstance.attach(gameAddress);
      expect(await game.token()).to.equal(await factory.token());
      expect(await game.gameTitle()).to.equal(gameTitle);
      expect(await game.entryStake()).to.equal(entryStake);
      expect(await game.maxPlayers()).to.equal(maxPlayers);
      expect(await game.gameEndTime()).to.be.closeTo(
        (await ethers.provider.getBlock("latest")).timestamp + gameDuration,
        100
      );
      expect(await game.owner()).to.equal(smartAccount.target);
      expect(await game.entryPoint()).to.equal(await factory.entryPoint());
    });

    it("Should revert if Smart Wallet caller is invalid", async function () {
      const { factory, other, gameTitle, entryStake, maxPlayers, gameDuration } = await loadFixture(deployGameFactory);
      await expect(
        factory.connect(other).createGameWithSmartWallet(gameTitle, entryStake, maxPlayers, gameDuration, "0x")
      ).to.be.revertedWith("Invalid Smart Wallet caller");
    });
  });

  describe("getGames", function () {
    it("Should return all created games", async function () {
      const { factory, creator, gameTitle, entryStake, maxPlayers, gameDuration } = await loadFixture(deployGameFactory);
      await factory.connect(creator).createGame(gameTitle, entryStake, maxPlayers, gameDuration);
      await factory.connect(creator).createGame("Another Game", entryStake.add(ethers.parseEther("1")), maxPlayers + 1, gameDuration + 3600);
      const games = await factory.getGames();
      expect(games.length).to.equal(2);
      expect(await factory.isGame(games[0])).to.be.true;
      expect(await factory.isGame(games[1])).to.be.true;
    });
  });
});