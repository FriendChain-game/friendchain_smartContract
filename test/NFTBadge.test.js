const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTBadge", function () {
  async function deployNFTBadge() {
    const [owner, user1, user2, other] = await ethers.getSigners();


      // Deploy mock EntryPoint
      const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
      const entryPoint = await EntryPoint.deploy();

      // Deploy mock Paymaster
      const MockPaymaster = await ethers.getContractFactory("MockPaymaster");
      const paymaster = await MockPaymaster.deploy(entryPoint.target);

      // Deploy mock SmartAccount
      const SmartAccount = await ethers.getContractFactory("MockSmartAccount");
      const smartAccount = await SmartAccount.deploy(entryPoint.target, owner.address);

      // Deploy NFTBadge
      const NFTBadge = await ethers.getContractFactory("NFTBadge");
      const nftBadge = await NFTBadge.deploy(owner.address, entryPoint.target);

      return { nftBadge, entryPoint, paymaster, smartAccount, owner, user1, user2, other };
   
  }

  describe("Deployment", function () {
    it("Should set correct name, symbol, owner, and entryPoint", async function () {
      const { nftBadge, owner, entryPoint } = await loadFixture(deployNFTBadge);
      expect(await nftBadge.name()).to.equal("FriendChainBadge");
      expect(await nftBadge.symbol()).to.equal("FCB");
      expect(await nftBadge.owner()).to.equal(owner.address);
      expect(await nftBadge.entryPoint()).to.equal(entryPoint.target);
    });
  });

  describe("mint", function () {
    it("Should mint an NFT to a valid address", async function () {
      const { nftBadge, user1 } = await loadFixture(deployNFTBadge);
      const tokenURI = "ipfs://QmExample";
      const tokenId = await nftBadge.mint(user1.address, tokenURI);
      expect(await nftBadge.ownerOf(tokenId)).to.equal(user1.address);
      expect(await nftBadge.tokenURI(tokenId)).to.equal(tokenURI);
      console.log(tokenId);
      
      // expect(tokenId).to.equal(1);
    });

    it("Should revert if minting to zero address", async function () {
      const { nftBadge } = await loadFixture(deployNFTBadge);
      const tokenURI = "ipfs://QmExample";
      await expect(
        nftBadge.mint(ethers.ZeroAddress, tokenURI)
      ).to.be.revertedWithCustomError(nftBadge, "AddressZeroFound");
    });
  });

  describe("mintWithSmartWallet", function () {
    it("Should allow gasless minting via Smart Wallet by owner", async function () {
      const { nftBadge, smartAccount, user2, entryPoint, paymaster, owner } = await loadFixture(deployNFTBadge);
      await owner.sendTransaction({ to: paymaster.target, value: ethers.parseEther("1") });

      const tokenURI = "ipfs://QmGasless";
      const mintData = nftBadge.interface.encodeFunctionData("mintWithSmartWallet", [
        user2.address,
        "0x",
      ]);

      const userOp = {
        sender: smartAccount.target,
        nonce: 0,
        initCode: "0x",
        callData: smartAccount.interface.encodeFunctionData("execute", [nftBadge.target, 0, mintData]),
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

      const tokenId = 1;
      expect(await nftBadge.ownerOf(tokenId)).to.equal(user2.address);
      expect(await nftBadge.tokenURI(tokenId)).to.equal("");
    });

    it("Should revert if Smart Wallet caller is not owner", async function () {
      const { nftBadge, user2, other } = await loadFixture(deployNFTBadge);
      await expect(
        nftBadge.connect(other).mintWithSmartWallet(user2.address, "0x")
      ).to.be.revertedWith("Invalid Smart Wallet caller");
    });

    it("Should revert if Smart Wallet caller is invalid", async function () {
      const { nftBadge, user2 } = await loadFixture(deployNFTBadge);
      await expect(
        nftBadge.mintWithSmartWallet(user2.address, "0x")
      ).to.be.revertedWith("Invalid Smart Wallet caller");
    });
  });
});
