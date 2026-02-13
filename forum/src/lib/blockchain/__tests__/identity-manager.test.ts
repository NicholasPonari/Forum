import { describe, it, expect, beforeAll, vi } from "vitest";
import { createHash } from "crypto";
import { ethers } from "ethers";

/**
 * Unit tests for the BlockchainIdentityManager.
 *
 * These tests verify the identity hash creation logic and signature
 * generation without requiring a running blockchain node.
 *
 * For full integration tests with a live Besu/Hardhat node,
 * see the smart contract tests in blockchain/test/.
 */

// ─────────────── Hash Construction Tests ────────────────

describe("Identity Hash Construction", () => {
  const SALT = "test-salt-value";

  function createIdentityHash(
    userId: string,
    email: string,
    verificationAttemptId: string,
    salt: string,
  ): string {
    const data = `${userId}:${email}:${verificationAttemptId}:${salt}`;
    const hash = createHash("sha256").update(data).digest();
    return ethers.hexlify(hash);
  }

  it("should produce a deterministic 32-byte hex hash", () => {
    const hash = createIdentityHash(
      "user-123",
      "alice@test.com",
      "attempt-456",
      SALT,
    );

    // Should be a 0x-prefixed hex string of 32 bytes (66 chars total)
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("should produce the same hash for the same inputs", () => {
    const hash1 = createIdentityHash(
      "user-123",
      "alice@test.com",
      "attempt-456",
      SALT,
    );
    const hash2 = createIdentityHash(
      "user-123",
      "alice@test.com",
      "attempt-456",
      SALT,
    );

    expect(hash1).toEqual(hash2);
  });

  it("should produce different hashes for different users", () => {
    const hash1 = createIdentityHash(
      "user-123",
      "alice@test.com",
      "attempt-456",
      SALT,
    );
    const hash2 = createIdentityHash(
      "user-789",
      "bob@test.com",
      "attempt-789",
      SALT,
    );

    expect(hash1).not.toEqual(hash2);
  });

  it("should produce different hashes with different salts", () => {
    const hash1 = createIdentityHash(
      "user-123",
      "alice@test.com",
      "attempt-456",
      "salt-1",
    );
    const hash2 = createIdentityHash(
      "user-123",
      "alice@test.com",
      "attempt-456",
      "salt-2",
    );

    expect(hash1).not.toEqual(hash2);
  });

  it("should produce different hashes when email differs", () => {
    const hash1 = createIdentityHash(
      "user-123",
      "alice@test.com",
      "attempt-456",
      SALT,
    );
    const hash2 = createIdentityHash(
      "user-123",
      "alice@other.com",
      "attempt-456",
      SALT,
    );

    expect(hash1).not.toEqual(hash2);
  });
});

// ─────────────── Signature Tests ────────────────

describe("ECDSA Signature Verification", () => {
  it("should produce a valid signature that recovers to the signer", async () => {
    const wallet = ethers.Wallet.createRandom();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("test-identity-data"));

    const signature = await wallet.signMessage(ethers.getBytes(hash));

    // Recover the signer from the signature
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(hash),
      signature,
    );

    expect(recoveredAddress).toEqual(wallet.address);
  });

  it("should fail verification with a different signer", async () => {
    const wallet1 = ethers.Wallet.createRandom();
    const wallet2 = ethers.Wallet.createRandom();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("test-identity-data"));

    const signature = await wallet1.signMessage(ethers.getBytes(hash));

    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(hash),
      signature,
    );

    expect(recoveredAddress).not.toEqual(wallet2.address);
  });

  it("should produce different signatures for different hashes", async () => {
    const wallet = ethers.Wallet.createRandom();
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes("identity-1"));
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes("identity-2"));

    const sig1 = await wallet.signMessage(ethers.getBytes(hash1));
    const sig2 = await wallet.signMessage(ethers.getBytes(hash2));

    expect(sig1).not.toEqual(sig2);
  });
});

// ─────────────── Config Tests ────────────────

describe("BlockchainConfig", () => {
  it("should use defaults when env vars are not set", async () => {
    // Mock environment
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.BLOCKCHAIN_RPC_URL;
    delete process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
    delete process.env.BLOCKCHAIN_CHAIN_ID;
    delete process.env.BLOCKCHAIN_IDENTITY_SALT;

    // Dynamic import to get fresh config
    const { getBlockchainConfig, resetBlockchainConfig } =
      await import("../config");
    resetBlockchainConfig();

    const config = getBlockchainConfig();
    expect(config.rpcUrl).toBe("http://127.0.0.1:8545");
    expect(config.chainId).toBe(1337);
    expect(config.identitySalt).toBe("voxvote-dev-salt");

    // Restore
    process.env = originalEnv;
    resetBlockchainConfig();
  });
});

// ─────────────── Identity Hash Format Tests ────────────────

describe("Identity Hash Format", () => {
  it("should be compatible with Solidity bytes32", () => {
    const data = "user-123:alice@test.com:attempt-456:salt";
    const hash = createHash("sha256").update(data).digest();
    const hexHash = ethers.hexlify(hash);

    // bytes32 in Solidity is 32 bytes = 64 hex chars + 0x prefix
    expect(hexHash.length).toBe(66);
    expect(hexHash.startsWith("0x")).toBe(true);

    // Should be a valid bytes32 for ethers
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(["bytes32"], [hexHash]);
    expect(encoded).toBeTruthy();
  });
});
