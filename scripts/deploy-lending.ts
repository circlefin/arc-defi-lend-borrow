/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";


// ─── Configuration ──────────────────────────────────────────────────

const CONFIG = {
  // cirBTC collateral (already deployed on Arc Testnet)
  cirBtcAddress: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",

  // Mock USDC parameters (loan token — 8 decimals to match cirBTC)
  usdcName: "USD Coin",
  usdcSymbol: "USDC",
  usdcDecimals: 8,

  // Collateral factor: users can borrow up to 50% of deposited cirBTC value
  collateralFactor: 50,

  // Initial USDC to fund the lending pool (8 decimals)
  poolFunding: ethers.parseUnits("50000", 8),   // 50,000 USDC

  // USDC minted to deployer for testing (8 decimals)
  deployerUsdc: ethers.parseUnits("100000", 8), // 100,000 USDC
};

// ─── Helpers ────────────────────────────────────────────────────────

function writeEnvFile(envPath: string, vars: Record<string, string>) {
  const envContent: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf-8");
    for (const line of existing.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        envContent[match[1].trim()] = match[2].trim();
      }
    }
  }
  Object.assign(envContent, vars);
  const output =
    Object.entries(envContent)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n";
  fs.writeFileSync(envPath, output);
}

async function clearStuckNonces(deployer: Awaited<ReturnType<typeof ethers.getSigners>>[number]) {
  const [latestNonce, pendingNonce] = await Promise.all([
    ethers.provider.getTransactionCount(deployer.address, "latest"),
    ethers.provider.getTransactionCount(deployer.address, "pending"),
  ]);
  if (pendingNonce <= latestNonce) return;

  const stuckCount = pendingNonce - latestNonce;
  console.log(
    `Found ${stuckCount} stuck pending tx(s) at nonce ${latestNonce}..${pendingNonce - 1}. Clearing with bumped-gas self-transfers...`
  );

  const feeData = await ethers.provider.getFeeData();
  const baseGasPrice = feeData.gasPrice ?? ethers.parseUnits("1", "gwei");
  const bumpedGasPrice = baseGasPrice * 5n;

  for (let nonce = latestNonce; nonce < pendingNonce; nonce++) {
    const tx = await deployer.sendTransaction({
      to: deployer.address,
      value: 0n,
      nonce,
      gasPrice: bumpedGasPrice,
    });
    await tx.wait();
    console.log(`  Replaced stuck tx at nonce ${nonce}: ${tx.hash}`);
  }
  console.log();
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account found. Set PRIVATE_KEY in .env.local (64 hex chars, with or without 0x prefix)."
    );
  }
  const [deployer] = signers;
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== LendingBorrowing Deployment ===\n");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatUnits(balance, 18), "(native gas)\n");

  if (balance === 0n) {
    throw new Error("Deployer has no balance. Fund your wallet from https://faucet.circle.com/");
  }

  await clearStuckNonces(deployer);

  const envPath = path.resolve(__dirname, "../.env.local");
  const cirBtcAddr = CONFIG.cirBtcAddress;

  if (!ethers.isAddress(cirBtcAddr)) {
    throw new Error(`cirBTC address is not valid: "${cirBtcAddr}"`);
  }

  console.log(`Using cirBTC as collateral: ${cirBtcAddr}\n`);

  // ─── Phase 1: Deploy mock USDC (loan token) ─────────────────────

  console.log("Phase 1: Deploying mock USDC loan token...\n");

  console.log("  Deploying TestnetERC20 (USDC)...");
  const usdcFactory = await ethers.getContractFactory("TestnetERC20");
  const usdc = await usdcFactory.deploy(CONFIG.usdcName, CONFIG.usdcSymbol, CONFIG.usdcDecimals);
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log(`  TestnetERC20 (USDC): ${usdcAddr}`);

  // Mint USDC to deployer for testing
  await (
    await usdc.getFunction("allocateTo")(deployer.address, CONFIG.deployerUsdc)
  ).wait();
  console.log(
    `  Minted ${ethers.formatUnits(CONFIG.deployerUsdc, CONFIG.usdcDecimals)} USDC to deployer.`
  );

  // ─── Phase 2: Deploy LendingBorrowing contract ──────────────────

  console.log("\nPhase 2: Deploying LendingBorrowing contract...\n");

  const lendingFactory = await ethers.getContractFactory("LendingBorrowing");
  const lending = await lendingFactory.deploy(
    cirBtcAddr,
    usdcAddr,
    CONFIG.collateralFactor
  );
  await lending.waitForDeployment();
  const lendingAddr = await lending.getAddress();
  console.log(`  LendingBorrowing: ${lendingAddr}`);

  // ─── Phase 3: Fund the lending pool with USDC ───────────────────

  console.log("\nPhase 3: Funding lending pool with USDC...\n");

  const usdcAbi = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function allocateTo(address ownerAddress, uint256 value)",
  ];
  const usdcContract = new ethers.Contract(usdcAddr, usdcAbi, deployer);

  const usdcBalance = await usdcContract.balanceOf(deployer.address);
  console.log(`  Deployer USDC balance: ${ethers.formatUnits(usdcBalance, CONFIG.usdcDecimals)}`);

  if (usdcBalance < CONFIG.poolFunding) {
    console.log("  Deployer has insufficient USDC — minting more...");
    await (
      await usdcContract.allocateTo(deployer.address, CONFIG.poolFunding)
    ).wait();
    console.log(`  Minted ${ethers.formatUnits(CONFIG.poolFunding, CONFIG.usdcDecimals)} USDC.`);
  }

  await (await usdcContract.approve(lendingAddr, CONFIG.poolFunding)).wait();
  await (await lending.getFunction("fundPool")(CONFIG.poolFunding)).wait();
  console.log(
    `  Pool funded with ${ethers.formatUnits(CONFIG.poolFunding, CONFIG.usdcDecimals)} USDC.`
  );

  // ─── Phase 4: Write .env.local ──────────────────────────────────

  writeEnvFile(envPath, {
    NEXT_PUBLIC_LENDING_ADDRESS: lendingAddr,
    NEXT_PUBLIC_USDC_ADDRESS: usdcAddr,
    NEXT_PUBLIC_CIRBTC_ADDRESS: cirBtcAddr,
  });

  // ─── Summary ────────────────────────────────────────────────────

  console.log("\n=== Deployment Summary ===\n");
  console.log(`  cirBTC (collateral token):  ${cirBtcAddr}`);
  console.log(`  USDC (loan token):          ${usdcAddr}`);
  console.log(`  LendingBorrowing contract:  ${lendingAddr}`);
  console.log(`  Collateral factor:          ${CONFIG.collateralFactor}%`);
  console.log(
    `  Pool liquidity:             ${ethers.formatUnits(CONFIG.poolFunding, CONFIG.usdcDecimals)} USDC`
  );
  console.log(`\nUpdated ${envPath} with deployed addresses.`);
  console.log("\nNext steps:");
  console.log("  1. Run 'npm run dev' to start the frontend.");
  console.log("  2. Deposit cirBTC as collateral and borrow USDC.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
