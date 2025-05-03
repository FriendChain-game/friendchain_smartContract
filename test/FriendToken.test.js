// const {
//   time,
//   loadFixture,
// } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
// const { expect } = require("chai");
// const { ethers } = require("hardhat");

// describe("FriendToken", function () {
//   // We define a fixture to reuse the same setup in every test.
//   // We use loadFixture to run this setup once, snapshot that state,
//   // and reset Hardhat Network to that snapshot in every test.
//   async function deployFriendToken() {

//     // Contracts are deployed using the first signer/account by default
//     const [owner, otherAccount, addr2] = await ethers.getSigners();

//     const FriendToken = await ethers.getContractFactory("FriendToken");
//     const token = await FriendToken.deploy(owner.address);

//     return { token, owner, addr2, otherAccount };
//   }

//   describe("Deployment", function () {
//     it("Should deploy with correct initial supply and mint to owner", async function () {
//       const { token, owner} = await loadFixture(deployFriendToken);

//       const totalSupply = await token.totalSupply();
//       expect(totalSupply).to.equal(ethers.parseEther("1000"));

//       const ownerBalance = await token.balanceOf(owner.address);
//       expect(ownerBalance).to.equal(ethers.parseEther("1000"));
//     });

//     it("Should have correct token metadata", async function () {
//       const { token} = await loadFixture(deployFriendToken);
//       expect(await token.name()).to.equal("FriendToken");
//       expect(await token.symbol()).to.equal("FRIEND");
//       expect(await token.decimals()).to.equal(18);
//     });

//     it("Should allow owner to transfer tokens", async function () {
//       const { token, owner, otherAccount} = await loadFixture(deployFriendToken);
//       await token.transfer(otherAccount.address, ethers.parseEther("100"));
//       const otherAccountBalance = await token.balanceOf(otherAccount.address);
//       expect(otherAccountBalance).to.equal(ethers.parseEther("100"));

//       const ownerBalance = await token.balanceOf(owner.address);
//       expect(ownerBalance).to.equal(ethers.parseEther("900"));
//     });

//     it("Should fail transfer if insufficient balance", async function () {
//       const { token, otherAccount,owner,  addr2} = await loadFixture(deployFriendToken);
//       await expect(
//         token.connect(otherAccount).transfer(addr2.address, ethers.parseEther("1"))
//       ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
//       .withArgs(otherAccount.address, 0, ethers.parseEther("1"));
//     });

//     it("Should allow owner to approve and transferFrom", async function () {
//       const { token, owner, otherAccount, addr2} = await loadFixture(deployFriendToken);
//       await token.approve(otherAccount.address, ethers.parseEther("50"));
//       await token.connect(otherAccount).transferFrom(owner.address, addr2.address, ethers.parseEther("50"));

//       const addr2Balance = await token.balanceOf(addr2.address);
//       expect(addr2Balance).to.equal(ethers.parseEther("50"));

//       const ownerBalance = await token.balanceOf(owner.address);
//       expect(ownerBalance).to.equal(ethers.parseEther("950"));
//     });

//     it("Should restrict ownership transfer to owner", async function () {
//       const { token, otherAccount,owner, addr2} = await loadFixture(deployFriendToken);

//       expect(await token.owner()).to.equal(owner.address);

//       await token.transferOwnership(otherAccount.address);
//       expect(await token.owner()).to.equal(otherAccount.address);

//       await expect(
//         token.connect(addr2).transferOwnership(addr2.address)
//       ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
//       .withArgs(addr2.address);
//     });

//     it("Should emit Transfer event on token transfer", async function () {
//       const { token, owner, otherAccount} = await loadFixture(deployFriendToken);
//       await expect(token.transfer(otherAccount.address, ethers.parseEther("100")))
//         .to.emit(token, "Transfer")
//         .withArgs(owner.address, otherAccount.address, ethers.parseEther("100"));
//     });

//   });

// });

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("FriendToken", function () {
	// Fixture to deploy FriendToken and ERC-4337 dependencies
	async function deployFriendToken() {
		const [owner, user1, user2, other] = await ethers.getSigners();

		// Deploy mock EntryPoint (required for transferWithSmartWallet)
		const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
		const entryPoint = await EntryPoint.deploy();

		// Deploy FriendToken
		const FriendToken = await ethers.getContractFactory("FriendToken");
		const token = await FriendToken.deploy(owner.address, entryPoint.target);

		// Deploy mock Paymaster (simulates Base Paymaster for gasless txs)
		const MockPaymaster = await ethers.getContractFactory("MockPaymaster");
		const paymaster = await MockPaymaster.deploy(entryPoint.target);

		// Deploy mock SmartAccount (simulates Smart Wallet for gasless txs)
		const SmartAccount = await ethers.getContractFactory("MockSmartAccount");
		const smartAccount = await SmartAccount.deploy(
			entryPoint.target,
			user1.address,
		);

		// Transfer tokens to smartAccount for testing
		await token.transfer(smartAccount.target, ethers.parseEther("100"));

		return {
			token,
			entryPoint,
			paymaster,
			smartAccount,
			owner,
			user1,
			user2,
			other,
		};
	}

	describe("Deployment", function () {
		it("Should set correct initial supply, owner, and entryPoint", async function () {
			const { token, owner, entryPoint } = await loadFixture(deployFriendToken);
			expect(await token.totalSupply()).to.equal(ethers.parseEther("1000"));
			expect(await token.balanceOf(owner.address)).to.equal(
				ethers.parseEther("900"),
			);
			expect(await token.owner()).to.equal(owner.address);
			expect(await token.entryPoint()).to.equal(entryPoint.target);
			expect(await token.name()).to.equal("FriendToken");
			expect(await token.symbol()).to.equal("FRIEND");
		});
	});

	describe("transfer", function () {
		it("Should allow regular account to transfer tokens", async function () {
			const { token, owner, user1 } = await loadFixture(deployFriendToken);
			const amount = ethers.parseEther("50");
			await token.transfer(user1.address, amount);
			expect(await token.balanceOf(user1.address)).to.equal(amount);
			expect(await token.balanceOf(owner.address)).to.equal(
				ethers.parseEther("850"),
			); //Fixed from 850 to 950 (1000 - 50)

			// Verify Transfer event
			const receipt = await (
				await token.transfer(user1.address, amount)
			).wait();
			const event = receipt.logs
				.map((log) => {
					try {
						return token.interface.parseLog(log);
					} catch {
						return null;
					}
				})
				.find((e) => e && e.name === "Transfer");
			expect(event).to.exist;
			expect(event.args.from).to.equal(owner.address);
			expect(event.args.to).to.equal(user1.address);
			expect(event.args.value).to.equal(amount);
		});

		it("Should allow registered sub-account to transfer tokens", async function () {
			const { token, owner, user1, user2 } = await loadFixture(
				deployFriendToken,
			);
			const amount = ethers.parseEther("50");
			await token.registerSubAccount(user1.address);
			await token.transfer(user1.address, amount);
			await token.connect(user1).transfer(user2.address, amount);
			expect(await token.balanceOf(user2.address)).to.equal(amount);
			expect(await token.balanceOf(user1.address)).to.equal(0);
		});

		it("Should revert transfer for unregistered sub-account", async function () {
			const { token, owner, user1, user2 } = await loadFixture(
				deployFriendToken,
			);
			const amount = ethers.parseEther("50");
			await token.transfer(user1.address, amount);
			await expect(
				token.connect(user1).transfer(user2.address, amount),
			).to.be.revertedWith("Unauthorized sub-account");
		});
	});

	describe("transferWithSmartWallet", function () {
		it("Should allow gasless transfer via Smart Wallet", async function () {
			const {
				token,
				smartAccount,
				user2,
				entryPoint,
				paymaster,
				owner,
				user1,
			} = await loadFixture(deployFriendToken);
			// Fund paymaster to simulate gasless execution
			await owner.sendTransaction({
				to: paymaster.target,
				value: ethers.parseEther("1"),
			});

			// Encode transferWithSmartWallet call
			const amount = ethers.parseEther("10");
			const transferData = token.interface.encodeFunctionData(
				"transferWithSmartWallet",
				[user2.address, amount, "0x"],
			);

			// Create UserOperation
			const userOp = {
				sender: smartAccount.target,
				nonce: 0,
				initCode: "0x",
				callData: smartAccount.interface.encodeFunctionData("execute", [
					token.target,
					0,
					transferData,
				]),
				callGasLimit: 300000,
				verificationGasLimit: 150000,
				preVerificationGas: 50000,
				maxFeePerGas: ethers.parseUnits("10", "gwei"),
				maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
				paymasterAndData: paymaster.target + "0".repeat(64),
				signature: "0x",
			};

			// Sign UserOperation
			const userOpHash = await entryPoint.getUserOpHash(userOp);
			userOp.signature = await user1.signMessage(ethers.getBytes(userOpHash));

			// Execute UserOperation
			await entryPoint.handleOps([userOp], owner.address);

			// Verify balances
			expect(await token.balanceOf(user2.address)).to.equal(amount);
			expect(await token.balanceOf(smartAccount.target)).to.equal(
				ethers.parseEther("90"),
			);

			// Verify Transfer event
			const receipt = await ethers.provider.getTransactionReceipt(
				(await entryPoint.getTransactionCount()).toHexString(),
			);
			const event = receipt.logs
				.map((log) => token.interface.parseLog(log))
				.find((e) => e && e.name === "Transfer");
			expect(event).to.exist;
			expect(event.args.from).to.equal(smartAccount.target);
			expect(event.args.to).to.equal(user2.address);
			expect(event.args.value).to.equal(amount);
		});

		it("Should revert if Smart Wallet caller is invalid", async function () {
			const { token, user2, other } = await loadFixture(deployFriendToken);
			const amount = ethers.parseEther("10");
			await expect(
				token
					.connect(other)
					.transferWithSmartWallet(user2.address, amount, "0x"),
			).to.be.revertedWith("Invalid Smart Wallet caller");
		});
	});

	describe("Sub-account Management", function () {
		it("Should allow owner to register sub-account", async function () {
			const { token, user1 } = await loadFixture(deployFriendToken);
			await token.registerSubAccount(user1.address);
			expect(await token.isSubAccount(user1.address)).to.be.true;
		});

		it("Should allow owner to deregister sub-account", async function () {
			const { token, user1 } = await loadFixture(deployFriendToken);
			await token.registerSubAccount(user1.address);
			await token.deregisterSubAccount(user1.address);
			expect(await token.isSubAccount(user1.address)).to.be.false;
		});

		it("Should revert registerSubAccount for non-owner", async function () {
			const { token, user1, other } = await loadFixture(deployFriendToken);
			await expect(
				token.connect(other).registerSubAccount(user1.address),
			).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
		});

		it("Should revert deregisterSubAccount for non-owner", async function () {
			const { token, user1, other } = await loadFixture(deployFriendToken);
			await expect(
				token.connect(other).deregisterSubAccount(user1.address),
			).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
		});
	});
});
