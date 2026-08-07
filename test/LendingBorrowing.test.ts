import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { LendingBorrowing, TestnetERC20 } from "../typechain-types";

const DECIMALS = 8;
const unit = (n: number) => ethers.parseUnits(n.toString(), DECIMALS);

async function deployFixture() {
  const [owner, alice, bob] = await ethers.getSigners();

  const TokenFactory = await ethers.getContractFactory("TestnetERC20");
  const collateralToken = (await TokenFactory.deploy("Collateral", "cBTC", DECIMALS)) as TestnetERC20;
  const lendingToken = (await TokenFactory.deploy("Lending", "ARCT", DECIMALS)) as TestnetERC20;

  const collateralFactor = 50; // 50%
  const LendingFactory = await ethers.getContractFactory("LendingBorrowing");
  const lending = (await LendingFactory.deploy(
    await collateralToken.getAddress(),
    await lendingToken.getAddress(),
    collateralFactor,
  )) as LendingBorrowing;

  // Fund the pool so takeLoan has liquidity to draw from.
  await lendingToken.allocateTo(owner.address, unit(100_000));
  await lendingToken.connect(owner).approve(await lending.getAddress(), unit(100_000));
  await lending.connect(owner).fundPool(unit(100_000));

  // Give Alice and Bob collateral tokens.
  await collateralToken.allocateTo(alice.address, unit(1_000));
  await collateralToken.allocateTo(bob.address, unit(1_000));

  return { lending, collateralToken, lendingToken, owner, alice, bob, collateralFactor };
}

describe("LendingBorrowing", () => {
  describe("constructor", () => {
    it("reverts on a zero collateral token address", async () => {
      const [, , , ] = await ethers.getSigners();
      const TokenFactory = await ethers.getContractFactory("TestnetERC20");
      const lendingToken = await TokenFactory.deploy("Lending", "ARCT", DECIMALS);
      const LendingFactory = await ethers.getContractFactory("LendingBorrowing");
      await expect(
        LendingFactory.deploy(ethers.ZeroAddress, await lendingToken.getAddress(), 50),
      ).to.be.revertedWith("Invalid collateral token");
    });

    it("reverts on a zero lending token address", async () => {
      const TokenFactory = await ethers.getContractFactory("TestnetERC20");
      const collateralToken = await TokenFactory.deploy("Collateral", "cBTC", DECIMALS);
      const LendingFactory = await ethers.getContractFactory("LendingBorrowing");
      await expect(
        LendingFactory.deploy(await collateralToken.getAddress(), ethers.ZeroAddress, 50),
      ).to.be.revertedWith("Invalid lending token");
    });

    it("reverts when the collateral factor is out of the 1-100 range", async () => {
      const TokenFactory = await ethers.getContractFactory("TestnetERC20");
      const collateralToken = await TokenFactory.deploy("Collateral", "cBTC", DECIMALS);
      const lendingToken = await TokenFactory.deploy("Lending", "ARCT", DECIMALS);
      const LendingFactory = await ethers.getContractFactory("LendingBorrowing");
      await expect(
        LendingFactory.deploy(await collateralToken.getAddress(), await lendingToken.getAddress(), 0),
      ).to.be.revertedWith("Factor must be 1-100");
      await expect(
        LendingFactory.deploy(await collateralToken.getAddress(), await lendingToken.getAddress(), 101),
      ).to.be.revertedWith("Factor must be 1-100");
    });
  });

  describe("setCollateralFactor", () => {
    it("allows the owner to update the factor within 1-100", async () => {
      const { lending, owner } = await loadFixture(deployFixture);
      await expect(lending.connect(owner).setCollateralFactor(75))
        .to.emit(lending, "CollateralFactorUpdated")
        .withArgs(75);
      expect(await lending.collateralFactor()).to.equal(75);
    });

    it("reverts for factor values outside 1-100", async () => {
      const { lending, owner } = await loadFixture(deployFixture);
      await expect(lending.connect(owner).setCollateralFactor(0)).to.be.revertedWith(
        "Factor must be 1-100",
      );
      await expect(lending.connect(owner).setCollateralFactor(101)).to.be.revertedWith(
        "Factor must be 1-100",
      );
    });

    it("reverts when called by a non-owner", async () => {
      const { lending, alice } = await loadFixture(deployFixture);
      // OpenZeppelin Contracts v4 Ownable reverts with a string, not a custom error (that's v5).
      await expect(lending.connect(alice).setCollateralFactor(60)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("takeLoan", () => {
    it("allows borrowing up to exactly the collateral-factor limit", async () => {
      const { lending, collateralToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));

      const maxBorrow = await lending.maxBorrow(alice.address);
      expect(maxBorrow).to.equal(unit(50)); // 50% collateral factor

      await expect(lending.connect(alice).takeLoan(maxBorrow)).to.emit(lending, "LoanTaken");
    });

    it("reverts when the requested amount exceeds maxBorrow", async () => {
      const { lending, collateralToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));

      const maxBorrow = await lending.maxBorrow(alice.address);
      await expect(
        lending.connect(alice).takeLoan(maxBorrow + 1n),
      ).to.be.revertedWith("Exceeds borrow limit");
    });

    it("reverts when the user already has an active loan", async () => {
      const { lending, collateralToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));
      await lending.connect(alice).takeLoan(unit(10));

      await expect(lending.connect(alice).takeLoan(unit(1))).to.be.revertedWith(
        "Repay existing loan first",
      );
    });

    it("reverts when the pool lacks sufficient liquidity", async () => {
      const { lending, collateralToken, alice } = await loadFixture(deployFixture);
      const poolLiquidity = await lending.poolLiquidity();

      // Mint Alice enough collateral that 50% of it exceeds the pool's balance.
      const bigCollateral = poolLiquidity * 3n;
      await collateralToken.allocateTo(alice.address, bigCollateral);
      await collateralToken.connect(alice).approve(await lending.getAddress(), bigCollateral);
      await lending.connect(alice).depositCollateral(bigCollateral);

      const maxBorrow = await lending.maxBorrow(alice.address);
      expect(maxBorrow).to.be.gt(poolLiquidity);
      await expect(lending.connect(alice).takeLoan(maxBorrow)).to.be.revertedWith(
        "Insufficient pool liquidity",
      );
    });
  });

  describe("repayLoan", () => {
    it("reverts when repaying more than the outstanding loan amount", async () => {
      const { lending, collateralToken, lendingToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));
      await lending.connect(alice).takeLoan(unit(10));

      await lendingToken.connect(alice).approve(await lending.getAddress(), unit(20));
      await expect(lending.connect(alice).repayLoan(unit(11))).to.be.revertedWith(
        "Amount exceeds outstanding loan",
      );
    });

    it("reverts when there is no active loan", async () => {
      const { lending, lendingToken, alice } = await loadFixture(deployFixture);
      await lendingToken.connect(alice).approve(await lending.getAddress(), unit(1));
      await expect(lending.connect(alice).repayLoan(unit(1))).to.be.revertedWith("No active loan");
    });

    it("clears the loan and unlocks collateral on full repayment", async () => {
      const { lending, collateralToken, lendingToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));
      await lending.connect(alice).takeLoan(unit(50));

      await lendingToken.connect(alice).approve(await lending.getAddress(), unit(50));
      await lending.connect(alice).repayLoan(unit(50));

      const loan = await lending.loans(alice.address);
      expect(loan.isActive).to.equal(false);
      expect(await lending.availableCollateral(alice.address)).to.equal(unit(100));
    });

    it("keeps collateral locked after a partial repayment", async () => {
      const { lending, collateralToken, lendingToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));
      await lending.connect(alice).takeLoan(unit(50));

      await lendingToken.connect(alice).approve(await lending.getAddress(), unit(20));
      await lending.connect(alice).repayLoan(unit(20));

      const loan = await lending.loans(alice.address);
      expect(loan.isActive).to.equal(true);
      expect(loan.amount).to.equal(unit(30));
      // Full collateral is still locked until the loan is fully repaid.
      expect(await lending.availableCollateral(alice.address)).to.equal(0n);
    });
  });

  describe("withdrawCollateral", () => {
    it("reverts when withdrawing more than the available (unlocked) collateral", async () => {
      const { lending, collateralToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));
      await lending.connect(alice).takeLoan(unit(50));

      // All 100 is locked by the active loan; nothing should be withdrawable.
      await expect(lending.connect(alice).withdrawCollateral(unit(1))).to.be.revertedWith(
        "Insufficient available collateral",
      );
    });

    it("allows withdrawing unlocked collateral when there is no active loan", async () => {
      const { lending, collateralToken, alice } = await loadFixture(deployFixture);
      await collateralToken.connect(alice).approve(await lending.getAddress(), unit(100));
      await lending.connect(alice).depositCollateral(unit(100));

      await expect(lending.connect(alice).withdrawCollateral(unit(40)))
        .to.emit(lending, "CollateralWithdrawn")
        .withArgs(alice.address, unit(40));
      expect(await lending.availableCollateral(alice.address)).to.equal(unit(60));
    });
  });
});
