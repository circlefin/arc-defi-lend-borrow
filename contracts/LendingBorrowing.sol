// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LendingBorrowing
 * @notice A simple lending and borrowing protocol.
 *         Users deposit USDC as collateral and borrow ARCT tokens against it.
 *
 * Lifecycle:
 *   1. Owner funds the pool with ARCT via fundPool().
 *   2. Users deposit USDC as collateral via depositCollateral().
 *   3. Users borrow ARCT (up to collateralFactor% of their collateral) via takeLoan().
 *   4. Users repay their ARCT loan (partially or fully) via repayLoan().
 *   5. Once the loan is fully repaid, users may withdraw their USDC via withdrawCollateral().
 *
 * Collateral factor:
 *   A value of 50 means users can borrow up to 50% of their deposited collateral value.
 *   Both USDC (collateral) and ARCT (lending) are assumed to have the same decimals.
 */
contract LendingBorrowing is Ownable {
    using SafeERC20 for IERC20;

    struct Loan {
        uint256 amount;     // ARCT currently owed
        uint256 collateral; // USDC locked when the loan was taken
        bool isActive;
    }

    IERC20 public immutable collateralToken; // USDC
    IERC20 public immutable lendingToken;    // ARCT
    uint256 public collateralFactor;         // percentage, e.g. 50 = 50%

    mapping(address => uint256) public collateralBalances;
    mapping(address => Loan) public loans;

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event LoanTaken(address indexed user, uint256 amount);
    event LoanRepaid(address indexed user, uint256 amount);
    event PoolFunded(uint256 amount);
    event CollateralFactorUpdated(uint256 newFactor);

    constructor(
        address _collateralToken,
        address _lendingToken,
        uint256 _collateralFactor
    ) {
        require(_collateralToken != address(0), "Invalid collateral token");
        require(_lendingToken != address(0), "Invalid lending token");
        require(_collateralFactor > 0 && _collateralFactor <= 100, "Factor must be 1-100");
        collateralToken = IERC20(_collateralToken);
        lendingToken = IERC20(_lendingToken);
        collateralFactor = _collateralFactor;
    }

    // ─── User actions ────────────────────────────────────────────────

    /// @notice Deposit USDC as collateral. Requires prior ERC20 approval.
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        collateralBalances[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    /// @notice Borrow ARCT against deposited USDC collateral.
    ///         Only one active loan per user at a time.
    function takeLoan(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(!loans[msg.sender].isActive, "Repay existing loan first");

        uint256 maxBorrowAmount = (collateralBalances[msg.sender] * collateralFactor) / 100;
        require(amount <= maxBorrowAmount, "Exceeds borrow limit");
        require(lendingToken.balanceOf(address(this)) >= amount, "Insufficient pool liquidity");

        loans[msg.sender] = Loan({
            amount: amount,
            collateral: collateralBalances[msg.sender],
            isActive: true
        });

        lendingToken.safeTransfer(msg.sender, amount);
        emit LoanTaken(msg.sender, amount);
    }

    /// @notice Repay ARCT loan (partially or fully). Requires prior ERC20 approval.
    function repayLoan(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        Loan storage loan = loans[msg.sender];
        require(loan.isActive, "No active loan");
        require(amount <= loan.amount, "Amount exceeds outstanding loan");

        lendingToken.safeTransferFrom(msg.sender, address(this), amount);
        loan.amount -= amount;

        if (loan.amount == 0) {
            loan.isActive = false;
            loan.collateral = 0;
        }

        emit LoanRepaid(msg.sender, amount);
    }

    /// @notice Withdraw USDC collateral that is not locked by an active loan.
    function withdrawCollateral(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        uint256 locked = loans[msg.sender].isActive ? loans[msg.sender].collateral : 0;
        uint256 available = collateralBalances[msg.sender] - locked;
        require(amount <= available, "Insufficient available collateral");

        collateralBalances[msg.sender] -= amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ─── Owner actions ───────────────────────────────────────────────

    /// @notice Fund the lending pool with ARCT. Requires prior ERC20 approval.
    function fundPool(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        lendingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolFunded(amount);
    }

    /// @notice Update the collateral factor (1-100).
    function setCollateralFactor(uint256 _collateralFactor) external onlyOwner {
        require(_collateralFactor > 0 && _collateralFactor <= 100, "Factor must be 1-100");
        collateralFactor = _collateralFactor;
        emit CollateralFactorUpdated(_collateralFactor);
    }

    // ─── View helpers ────────────────────────────────────────────────

    /// @notice Returns the maximum ARCT a user can currently borrow.
    function maxBorrow(address user) external view returns (uint256) {
        if (loans[user].isActive) return 0;
        return (collateralBalances[user] * collateralFactor) / 100;
    }

    /// @notice Returns the USDC collateral available to withdraw (not locked by a loan).
    function availableCollateral(address user) external view returns (uint256) {
        uint256 locked = loans[user].isActive ? loans[user].collateral : 0;
        return collateralBalances[user] - locked;
    }

    /// @notice Returns current ARCT liquidity in the pool.
    function poolLiquidity() external view returns (uint256) {
        return lendingToken.balanceOf(address(this));
    }
}
