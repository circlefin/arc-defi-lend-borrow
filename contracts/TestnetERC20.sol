// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestnetERC20
 * @notice A simple mintable ERC20 for testnet use. Anyone can call allocateTo to mint tokens.
 */
contract TestnetERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint `value` tokens to `ownerAddress`. Open to anyone on testnet.
    function allocateTo(address ownerAddress, uint256 value) external {
        _mint(ownerAddress, value);
    }
}
