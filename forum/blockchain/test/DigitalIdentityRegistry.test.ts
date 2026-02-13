import { expect } from "chai";
import { ethers } from "hardhat";
import { DigitalIdentityRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("DigitalIdentityRegistry", function () {
  let registry: DigitalIdentityRegistry;
  let owner: SignerWithAddress;
  let issuer: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  // Helper: create a deterministic identity hash (mimics the backend)
  function createIdentityHash(
    userId: string,
    email: string,
    attemptId: string,
    salt: string = "test-salt",
  ): string {
    const data = `${userId}:${email}:${attemptId}:${salt}`;
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }

  // Helper: sign an identity hash with a signer
  async function signIdentityHash(
    hash: string,
    signer: SignerWithAddress,
  ): Promise<string> {
    return signer.signMessage(ethers.getBytes(hash));
  }

  beforeEach(async function () {
    [owner, issuer, unauthorized] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("DigitalIdentityRegistry");
    registry = await Factory.deploy(owner.address);
    await registry.waitForDeployment();
  });

  // ─────────────────────── Deployment ───────────────────────

  describe("Deployment", function () {
    it("should set the deployer as owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should authorize the owner as an issuer", async function () {
      expect(await registry.authorizedIssuers(owner.address)).to.be.true;
    });

    it("should start with zero total identities", async function () {
      expect(await registry.totalIdentities()).to.equal(0);
    });
  });

  // ─────────────────── Issuer Management ────────────────────

  describe("Issuer Management", function () {
    it("should allow owner to authorize a new issuer", async function () {
      await expect(registry.authorizeIssuer(issuer.address))
        .to.emit(registry, "IssuerAuthorized")
        .withArgs(issuer.address);

      expect(await registry.authorizedIssuers(issuer.address)).to.be.true;
    });

    it("should allow owner to deauthorize an issuer", async function () {
      await registry.authorizeIssuer(issuer.address);

      await expect(registry.deauthorizeIssuer(issuer.address))
        .to.emit(registry, "IssuerDeauthorized")
        .withArgs(issuer.address);

      expect(await registry.authorizedIssuers(issuer.address)).to.be.false;
    });

    it("should reject non-owner from authorizing issuers", async function () {
      await expect(
        registry.connect(unauthorized).authorizeIssuer(issuer.address),
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────── Issue Identity ───────────────────────

  describe("issueIdentity", function () {
    it("should issue an identity with valid hash and signature", async function () {
      const hash = createIdentityHash(
        "user-123",
        "alice@test.com",
        "attempt-456",
      );
      const signature = await signIdentityHash(hash, owner);

      await expect(registry.issueIdentity(hash, signature))
        .to.emit(registry, "IdentityIssued")
        .withArgs(hash, owner.address, (t: bigint) => t > 0n);

      expect(await registry.totalIdentities()).to.equal(1);
    });

    it("should store the correct identity data on-chain", async function () {
      const hash = createIdentityHash(
        "user-789",
        "bob@test.com",
        "attempt-101",
      );
      const signature = await signIdentityHash(hash, owner);

      await registry.issueIdentity(hash, signature);

      const identity = await registry.getIdentity(hash);
      expect(identity.identityHash).to.equal(hash);
      expect(identity.issuer).to.equal(owner.address);
      expect(identity.issuedAt).to.be.greaterThan(0);
      expect(identity.revoked).to.be.false;
      expect(identity.issuerSignature).to.equal(signature);
    });

    it("should reject duplicate identity hashes", async function () {
      const hash = createIdentityHash(
        "user-dup",
        "dup@test.com",
        "attempt-dup",
      );
      const signature = await signIdentityHash(hash, owner);

      await registry.issueIdentity(hash, signature);

      await expect(
        registry.issueIdentity(hash, signature),
      ).to.be.revertedWithCustomError(registry, "IdentityAlreadyExists");
    });

    it("should reject issuance from unauthorized address", async function () {
      const hash = createIdentityHash(
        "user-unauth",
        "unauth@test.com",
        "attempt-unauth",
      );
      const signature = await signIdentityHash(hash, unauthorized);

      await expect(
        registry.connect(unauthorized).issueIdentity(hash, signature),
      ).to.be.revertedWithCustomError(registry, "NotAuthorizedIssuer");
    });

    it("should reject if signature does not match caller", async function () {
      const hash = createIdentityHash(
        "user-bad-sig",
        "bad@test.com",
        "attempt-bad",
      );
      // Sign with owner but try to submit from a different authorized issuer
      await registry.authorizeIssuer(issuer.address);
      const signature = await signIdentityHash(hash, owner);

      await expect(
        registry.connect(issuer).issueIdentity(hash, signature),
      ).to.be.revertedWithCustomError(registry, "InvalidSignature");
    });

    it("should allow a second authorized issuer to issue", async function () {
      await registry.authorizeIssuer(issuer.address);

      const hash = createIdentityHash(
        "user-issuer2",
        "issuer2@test.com",
        "attempt-issuer2",
      );
      const signature = await signIdentityHash(hash, issuer);

      await expect(registry.connect(issuer).issueIdentity(hash, signature))
        .to.emit(registry, "IdentityIssued")
        .withArgs(hash, issuer.address, (t: bigint) => t > 0n);
    });
  });

  // ─────────────────── Verify Identity ──────────────────────

  describe("verifyIdentity", function () {
    it("should return exists=true for an issued identity", async function () {
      const hash = createIdentityHash(
        "user-verify",
        "verify@test.com",
        "attempt-verify",
      );
      const signature = await signIdentityHash(hash, owner);
      await registry.issueIdentity(hash, signature);

      const [exists, returnedIssuer, issuedAt, revoked] =
        await registry.verifyIdentity(hash);

      expect(exists).to.be.true;
      expect(returnedIssuer).to.equal(owner.address);
      expect(issuedAt).to.be.greaterThan(0);
      expect(revoked).to.be.false;
    });

    it("should return exists=false for a non-existent identity", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));

      const [exists, , ,] = await registry.verifyIdentity(fakeHash);
      expect(exists).to.be.false;
    });

    it("should return revoked=true for a revoked identity", async function () {
      const hash = createIdentityHash(
        "user-rev-check",
        "rev@test.com",
        "attempt-rev",
      );
      const signature = await signIdentityHash(hash, owner);
      await registry.issueIdentity(hash, signature);
      await registry.revokeIdentity(hash);

      const [exists, , , revoked] = await registry.verifyIdentity(hash);
      expect(exists).to.be.true;
      expect(revoked).to.be.true;
    });
  });

  // ─────────────────── Revoke Identity ──────────────────────

  describe("revokeIdentity", function () {
    let hash: string;

    beforeEach(async function () {
      hash = createIdentityHash(
        "user-revoke",
        "revoke@test.com",
        "attempt-revoke",
      );
      const signature = await signIdentityHash(hash, owner);
      await registry.issueIdentity(hash, signature);
    });

    it("should allow the original issuer to revoke", async function () {
      await expect(registry.revokeIdentity(hash))
        .to.emit(registry, "IdentityRevoked")
        .withArgs(hash, owner.address, (t: bigint) => t > 0n);

      expect(await registry.totalIdentities()).to.equal(0);
    });

    it("should allow the owner to revoke any identity", async function () {
      // Issue from a different authorized issuer
      await registry.authorizeIssuer(issuer.address);
      const hash2 = createIdentityHash(
        "user-owner-rev",
        "ownerrev@test.com",
        "attempt-ownerrev",
      );
      const sig2 = await signIdentityHash(hash2, issuer);
      await registry.connect(issuer).issueIdentity(hash2, sig2);

      // Owner (not the original issuer) revokes it
      await expect(registry.revokeIdentity(hash2))
        .to.emit(registry, "IdentityRevoked")
        .withArgs(hash2, owner.address, (t: bigint) => t > 0n);
    });

    it("should reject revoking a non-existent identity", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));

      await expect(
        registry.revokeIdentity(fakeHash),
      ).to.be.revertedWithCustomError(registry, "IdentityDoesNotExist");
    });

    it("should reject double revocation", async function () {
      await registry.revokeIdentity(hash);

      await expect(registry.revokeIdentity(hash)).to.be.revertedWithCustomError(
        registry,
        "IdentityAlreadyRevoked",
      );
    });

    it("should reject revocation from unauthorized address", async function () {
      await expect(
        registry.connect(unauthorized).revokeIdentity(hash),
      ).to.be.revertedWithCustomError(registry, "NotAuthorizedToRevoke");
    });
  });

  // ─────────────────── recoverSigner ────────────────────────

  describe("recoverSigner", function () {
    it("should recover the correct signer from a signature", async function () {
      const hash = createIdentityHash(
        "user-recover",
        "recover@test.com",
        "attempt-recover",
      );
      const signature = await signIdentityHash(hash, owner);

      const recovered = await registry.recoverSigner(hash, signature);
      expect(recovered).to.equal(owner.address);
    });
  });

  // ─────────────────── Gas / Scale ──────────────────────────

  describe("Scale", function () {
    it("should handle issuing 50 identities", async function () {
      for (let i = 0; i < 50; i++) {
        const hash = createIdentityHash(
          `user-scale-${i}`,
          `scale${i}@test.com`,
          `attempt-scale-${i}`,
        );
        const signature = await signIdentityHash(hash, owner);
        await registry.issueIdentity(hash, signature);
      }

      expect(await registry.totalIdentities()).to.equal(50);
    });
  });
});
