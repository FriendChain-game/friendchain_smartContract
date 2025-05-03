const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("GameInstance", function () {
  async function deployGameInstance() {
    const [owner, user1, user2, other] = await ethers.getSigners();

      // Deploy mock EntryPoint
      const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
      const entryPoint = await EntryPoint.deploy();

      // Deploy mock Paymaster
      const MockPaymaster = await ethers.getContractFactory("MockPaymaster");
      const paymaster = await MockPaymaster.deploy(entryPoint.target);

      // Deploy FriendToken
      const FriendToken = await ethers.getContractFactory("FriendToken");
      const token = await FriendToken.deploy(owner.address, entryPoint.target);

      // Deploy mock SmartAccount
      const SmartAccount = await ethers.getContractFactory("MockSmartAccount");
      const smartAccount = await SmartAccount.deploy(entryPoint.target, owner.address);

      // Deploy GameInstance
      const GameInstance = await ethers.getContractFactory("GameInstance");
      const gameTitle = "Trivia Challenge";
      const entryStake = ethers.parseEther("10");
      const maxPlayers = 3;
      const gameDuration = 3600; // 1 hour
      const gameInstance = await GameInstance.deploy(
        gameTitle,
        entryStake,
        maxPlayers,
        gameDuration,
        owner.address,
        entryPoint.target,
        token.target,
        { gasLimit: 5000000 }
      );

      // // Approve tokens for users and smartAccount
      // const tokenWithSigner = token.connect(owner);
      // await tokenWithSigner.transfer(user1.address, ethers.parseEther("20"));
      // await tokenWithSigner.transfer(user2.address, ethers.parseEther("20"));
      // await tokenWithSigner.transfer(smartAccount.target, ethers.parseEther("20"));
      // await token.connect(user1).approve(gameInstance.target, ethers.parseEther("20"));
      // await token.connect(user2).approve(gameInstance.target, ethers.parseEther("20"));
      // await token.connect(smartAccount).approve(gameInstance.target, ethers.parseEther("20"));

      return { gameInstance, token, entryPoint, paymaster, smartAccount, owner, user1, user2, other, gameTitle, entryStake, maxPlayers, gameDuration };
  
  }

  describe("Deployment", function () {
    it("Should set correct token, title, stake, maxPlayers, duration, owner, and entryPoint", async function () {
      const { gameInstance, token, owner, entryPoint, gameTitle, entryStake, maxPlayers, gameDuration } = await loadFixture(deployGameInstance);
      expect(await gameInstance.token()).to.equal(token.target);
      expect(await gameInstance.gameTitle()).to.equal(gameTitle);
      expect(await gameInstance.entryStake()).to.equal(entryStake);
      expect(await gameInstance.maxPlayers()).to.equal(maxPlayers);
      expect(await gameInstance.gameEndTime()).to.be.closeTo(
        (await ethers.provider.getBlock("latest")).timestamp + gameDuration,
        100
      );
      expect(await gameInstance.owner()).to.equal(owner.address);
      expect(await gameInstance.entryPoint()).to.equal(entryPoint.target);
      expect(await gameInstance.gameEnded()).to.be.false;
      expect(await gameInstance.gameCanceled()).to.be.false;
      expect(await gameInstance.isGameActive()).to.be.true;
    });

    it("Should revert if entryStake is 0", async function () {
      const { token, owner, entryPoint } = await loadFixture(deployGameInstance);
      const GameInstance = await ethers.getContractFactory("GameInstance", owner);
      await expect(
        GameInstance.deploy(
          "Invalid Game",
          0,
          3,
          3600,
          owner.address,
          entryPoint.target,
          token.target,
          { gasLimit: 5000000 }
        )
      ).to.be.revertedWith("Entry stake must be greater than 0");
    });

    it("Should revert if maxPlayers is 0", async function () {
      const { token, owner, entryPoint } = await loadFixture(deployGameInstance);
      const GameInstance = await ethers.getContractFactory("GameInstance", owner);
      await expect(
        GameInstance.deploy(
          "Invalid Game",
          ethers.parseEther("10"),
          0,
          3600,
          owner.address,
          entryPoint.target,
          token.target,
          { gasLimit: 5000000 }
        )
      ).to.be.revertedWith("Max players must be greater than 0");
    });

    it("Should revert if gameDuration is 0", async function () {
      const { token, owner, entryPoint } = await loadFixture(deployGameInstance);
      const GameInstance = await ethers.getContractFactory("GameInstance", owner);
      await expect(
        GameInstance.deploy(
          "Invalid Game",
          ethers.parseEther("10"),
          3,
          0,
          owner.address,
          entryPoint.target,
          token.target,
          { gasLimit: 5000000 }
        )
      ).to.be.revertedWith("Game duration must be greater than 0");
    });
  });

  describe("joinGame", function () {
    it("Should allow a player to join with entry stake", async function () {
      const { gameInstance, token, user1, entryStake } = await loadFixture(deployGameInstance);
      await expect(gameInstance.connect(user1).joinGame())
        .to.emit(gameInstance, "PlayerJoined")
        .withArgs(user1.address, entryStake);
      expect(await gameInstance.players(0)).to.equal(user1.address);
      expect(await gameInstance.stakes(user1.address)).to.equal(entryStake);
      expect(await token.balanceOf(gameInstance.target)).to.equal(entryStake);
    });

    it("Should revert if max players reached", async function () {
      const { gameInstance, user1, user2, other } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await gameInstance.connect(user2).joinGame();
      await gameInstance.connect(other).joinGame();
      await expect(gameInstance.connect(other).joinGame()).to.be.revertedWith("Max players reached");
    });

    it("Should revert if game is not active", async function () {
      const { gameInstance, user1, owner } = await loadFixture(deployGameInstance);
      await gameInstance.connect(owner).refund();
      await expect(gameInstance.connect(user1).joinGame()).to.be.revertedWith("Game is not active");
    });

    it("Should revert if game duration has expired", async function () {
      const { gameInstance, user1 } = await loadFixture(deployGameInstance);
      await ethers.provider.send("evm_increaseTime", [3601]); // Move past gameDuration
      await ethers.provider.send("evm_mine", []);
      await expect(gameInstance.connect(user1).joinGame()).to.be.revertedWith("Game is not active");
    });
  });

  describe("joinGameWithSmartWallet", function () {
    it("Should allow gasless join via Smart Wallet", async function () {
      const { gameInstance, token, smartAccount, entryPoint, paymaster, owner, entryStake } = await loadFixture(deployGameInstance);
      await owner.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1") });

      const userOp = {
        sender: smartAccount.target,
        nonce: 0,
        initCode: "0x",
        callData: smartAccount.interface.encodeFunctionData("execute", [
          gameInstance.target,
          0,
          gameInstance.interface.encodeFunctionData("joinGameWithSmartWallet", ["0x"]),
        ]),
        callGasLimit: 300000,
        verificationGasLimit: 150000,
        preVerificationGas: 50000,
        maxFeePerGas: ethers.parseUnits("10", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
        paymasterAndData: paymaster.target + "0".repeat(64),
        signature: "0x",
      };

      const userOpHash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await owner.signMessage(ethers.getBytes(userOpHash));

      await entryPoint.handleOps([userOp], owner.address);

      expect(await gameInstance.players(0)).to.equal(smartAccount.target);
      expect(await gameInstance.stakes(smartAccount.target)).to.equal(entryStake);
      expect(await token.balanceOf(gameInstance.target)).to.equal(entryStake);
    });

    it("Should revert if Smart Wallet caller is invalid", async function () {
      const { gameInstance, other } = await loadFixture(deployGameInstance);
      await expect(
        gameInstance.connect(other).joinGameWithSmartWallet("0x")
      ).to.be.revertedWith("Invalid Smart Wallet caller");
    });
  });

  describe("submitQuestion", function () {
    it("Should allow a player to submit a question", async function () {
      const { gameInstance, user1 } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      const ipfsHash = "QmExample";
      await expect(gameInstance.connect(user1).submitQuestion(ipfsHash))
        .to.emit(gameInstance, "QuestionSubmitted")
        .withArgs(user1.address, ipfsHash);
      expect((await gameInstance.playerQuestions(user1.address))[0]).to.equal(ipfsHash);
    });

    it("Should revert if not a player", async function () {
      const { gameInstance, user1 } = await loadFixture(deployGameInstance);
      await expect(gameInstance.connect(user1).submitQuestion("QmExample")).to.be.revertedWith("Not a player");
    });

    it("Should revert if game is not active", async function () {
      const { gameInstance, user1, owner } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await gameInstance.connect(owner).refund();
      await expect(gameInstance.connect(user1).submitQuestion("QmExample")).to.be.revertedWith("Game is not active");
    });
  });

  describe("submitQuestionWithSmartWallet", function () {
    it("Should allow gasless question submission via Smart Wallet", async function () {
      const { gameInstance, smartAccount, entryPoint, paymaster, owner } = await loadFixture(deployGameInstance);
      await gameInstance.connect(smartAccount).joinGame();
      await owner.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1") });

      const ipfsHash = "QmGasless";
      const userOp = {
        sender: smartAccount.target,
        nonce: 0,
        initCode: "0x",
        callData: smartAccount.interface.encodeFunctionData("execute", [
          gameInstance.target,
          0,
          gameInstance.interface.encodeFunctionData("submitQuestionWithSmartWallet", [ipfsHash, "0x"]),
        ]),
        callGasLimit: 300000,
        verificationGasLimit: 150000,
        preVerificationGas: 50000,
        maxFeePerGas: ethers.parseUnits("10", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
        paymasterAndData: paymaster.target + "0".repeat(64),
        signature: "0x",
      };

      const userOpHash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await owner.signMessage(ethers.getBytes(userOpHash));

      await entryPoint.handleOps([userOp], owner.address);

      expect((await gameInstance.playerQuestions(smartAccount.target))[0]).to.equal(ipfsHash);
    });

    it("Should revert if Smart Wallet caller is invalid", async function () {
      const { gameInstance, other } = await loadFixture(deployGameInstance);
      await expect(
        gameInstance.connect(other).submitQuestionWithSmartWallet("QmExample", "0x")
      ).to.be.revertedWith("Invalid Smart Wallet caller");
    });
  });

  describe("payout", function () {
    it("Should allow owner to payout to winner", async function () {
      const { gameInstance, token, user1, user2, entryStake } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await gameInstance.connect(user2).joinGame();
      const totalPayout = entryStake.mul(2);
      await expect(gameInstance.connect(owner).payout(user1.address))
        .to.emit(gameInstance, "Payout")
        .withArgs(user1.address, totalPayout);
      expect(await gameInstance.gameEnded()).to.be.true;
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("190")); // 200 - 10 + 20
      expect(await gameInstance.stakes(user1.address)).to.equal(0);
      expect(await gameInstance.stakes(user2.address)).to.equal(0);
    });

    it("Should revert if not owner", async function () {
      const { gameInstance, user1 } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await expect(gameInstance.connect(user1).payout(user1.address)).to.be.revertedWithCustomError(gameInstance, "OwnableUnauthorizedAccount");
    });

    it("Should revert if winner is not a player", async function () {
      const { gameInstance, other, owner } = await loadFixture(deployGameInstance);
      await expect(gameInstance.connect(owner).payout(other.address)).to.be.revertedWith("Invalid winner");
    });

    it("Should revert if game is not active", async function () {
      const { gameInstance, user1, owner } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await gameInstance.connect(owner).refund();
      await expect(gameInstance.connect(owner).payout(user1.address)).to.be.revertedWith("Game is not active");
    });
  });

  describe("payoutWithSmartWallet", function () {
    it("Should allow gasless payout via Smart Wallet by owner", async function () {
      const { gameInstance, token, smartAccount, user1, user2, entryPoint, paymaster, owner, entryStake } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await gameInstance.connect(user2).joinGame();
      await owner.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1") });

      const totalPayout = entryStake.mul(2);
      const userOp = {
        sender: smartAccount.target,
        nonce: 0,
        initCode: "0x",
        callData: smartAccount.interface.encodeFunctionData("execute", [
          gameInstance.target,
          0,
          gameInstance.interface.encodeFunctionData("payoutWithSmartWallet", [user1.address, "0x"]),
        ]),
        callGasLimit: 300000,
        verificationGasLimit: 150000,
        preVerificationGas: 50000,
        maxFeePerGas: ethers.parseUnits("10", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
        paymasterAndData: paymaster.target + "0".repeat(64),
        signature: "0x",
      };

      const userOpHash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await owner.signMessage(ethers.getBytes(userOpHash));

      await entryPoint.handleOps([userOp], owner.address);

      expect(await gameInstance.gameEnded()).to.be.true;
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("190"));
      expect(await gameInstance.stakes(user1.address)).to.equal(0);
      expect(await gameInstance.stakes(user2.address)).to.equal(0);
    });

    it("Should revert if Smart Wallet caller is invalid", async function () {
      const { gameInstance, user1 } = await loadFixture(deployGameInstance);
      await expect(
        gameInstance.connect(user1).payoutWithSmartWallet(user1.address, "0x")
      ).to.be.revertedWith("Invalid Smart Wallet caller");
    });
  });

  describe("refund", function () {
    it("Should allow owner to refund players", async function () {
      const { gameInstance, token, user1, user2, entryStake } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await gameInstance.connect(user2).joinGame();
      await expect(gameInstance.connect(owner).refund())
        .to.emit(gameInstance, "Refunded")
        .withArgs(user1.address, entryStake)
        .to.emit(gameInstance, "Refunded")
        .withArgs(user2.address, entryStake)
        .to.emit(gameInstance, "GameCanceled");
      expect(await gameInstance.gameCanceled()).to.be.true;
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("200"));
      expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));
      expect(await gameInstance.stakes(user1.address)).to.equal(0);
      expect(await gameInstance.stakes(user2.address)).to.equal(0);
    });

    it("Should revert if not owner", async function () {
      const { gameInstance, user1 } = await loadFixture(deployGameInstance);
      await expect(gameInstance.connect(user1).refund()).to.be.revertedWithCustomError(gameInstance, "OwnableUnauthorizedAccount");
    });

    it("Should revert if game is not active", async function () {
      const { gameInstance, owner } = await loadFixture(deployGameInstance);
      await gameInstance.connect(owner).refund();
      await expect(gameInstance.connect(owner).refund()).to.be.revertedWith("Game is not active");
    });
  });

  describe("refundWithSmartWallet", function () {
    it("Should allow gasless refund via Smart Wallet by owner", async function () {
      const { gameInstance, token, smartAccount, user1, user2, entryPoint, paymaster, owner, entryStake } = await loadFixture(deployGameInstance);
      await gameInstance.connect(user1).joinGame();
      await gameInstance.connect(user2).joinGame();
      await owner.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1") });

      const userOp = {
        sender: smartAccount.target,
        nonce: 0,
        initCode: "0x",
        callData: smartAccount.interface.encodeFunctionData("execute", [
          gameInstance.target,
          0,
          gameInstance.interface.encodeFunctionData("refundWithSmartWallet", ["0x"]),
        ]),
        callGasLimit: 300000,
        verificationGasLimit: 150000,
        preVerificationGas: 50000,
        maxFeePerGas: ethers.parseUnits("10", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
        paymasterAndData: paymaster.target + "0".repeat(64),
        signature: "0x",
      };

      const userOpHash = await entryPoint.getUserOpHash(userOp);
      userOp.signature = await owner.signMessage(ethers.getBytes(userOpHash));

      await entryPoint.handleOps([userOp], owner.address);

      expect(await gameInstance.gameCanceled()).to.be.true;
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("200"));
      expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("200"));
      expect(await gameInstance.stakes(user1.address)).to.equal(0);
      expect(await gameInstance.stakes(user2.address)).to.equal(0);
    });

    it("Should revert if Smart Wallet caller is invalid", async function () {
      const { gameInstance, user1 } = await loadFixture(deployGameInstance);
      await expect(
        gameInstance.connect(user1).refundWithSmartWallet("0x")
      ).to.be.revertedWith("Invalid Smart Wallet caller");
    });
  });
});