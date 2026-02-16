# Blockchain Identity System - Deployment Guide

## Overview

This document covers the complete deployment process for the Vox.Vote blockchain identity system, from local development to production.

## System Components

| Component              | Location                              | Purpose                                     |
| ---------------------- | ------------------------------------- | ------------------------------------------- |
| Identity Contract      | `blockchain/contracts/DigitalIdentityRegistry.sol` | On-chain identity hashes + signatures |
| Content Contract       | `blockchain/contracts/ContentRegistry.sol`         | On-chain content hashes (issues, comments, votes) |
| Besu Node              | `besu-network/`                       | Private PoA blockchain network              |
| Identity Manager       | `src/lib/blockchain/identity-manager.ts` | Identity issuance, revocation, profile hashing |
| Content Manager        | `src/lib/blockchain/content-manager.ts`  | Content hashing + on-chain recording        |
| Config                 | `src/lib/blockchain/config.ts`        | Environment-based blockchain config         |
| API: Issue Identity    | `src/app/api/blockchain/issue-identity/` | Issue on-chain identity after verification |
| API: Record Content    | `src/app/api/blockchain/record-content/` | Anchor content hashes to blockchain        |
| API: Verify Content    | `src/app/api/blockchain/verify-content/` | Verify content integrity vs blockchain     |
| API: Verify Profile    | `src/app/api/blockchain/verify-profile/` | Detect profile field tampering             |
| API: Status            | `src/app/api/blockchain/status/`      | Health check + identity lookup              |
| API: Retry             | `src/app/api/blockchain/retry/`       | Retry failed identity/content recordings    |
| API: Integrity Check   | `src/app/api/blockchain/integrity-check/` | Batch verify profiles + content hashes   |
| UI Badge               | `src/components/BlockchainVerificationBadge.tsx` | Shield icon showing verification status |
| DB: identities         | `blockchain_identities`               | User → on-chain identity mapping            |
| DB: content records    | `blockchain_content_records`          | Content → on-chain tx mapping               |
| DB: audit log          | `blockchain_audit_log`                | Immutable audit trail of all operations     |

## Local Development Setup

### Step 1: Start the Besu Node

```bash
cd forum/besu-network
docker compose up -d
```

Verify it's running:

```bash
curl http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Step 2: Compile and Deploy the Smart Contract

```bash
cd forum/blockchain
npm install
npm run compile
npm run deploy:local
```

Note the contract address from the output.

### Step 3: Run Database Migration

Execute `blockchain/migrations/001_blockchain_identities.sql` in your Supabase SQL editor:

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Paste and run the migration file contents

### Step 4: Configure Environment Variables

Add to `forum/.env.local`:

```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_DEPLOYER_PRIVATE_KEY=<your-dev-private-key>
BLOCKCHAIN_ISSUER_PRIVATE_KEY=<your-dev-private-key>
BLOCKCHAIN_CONTRACT_ADDRESS=<address from step 2>
BLOCKCHAIN_CHAIN_ID=1337
BLOCKCHAIN_IDENTITY_SALT=<generate-a-random-string>
```

> **Never commit private keys to version control.** For local development,
> generate a key with `node -e "console.log(require('ethers').Wallet.createRandom().privateKey.slice(2))"` and store it in `.env.local` only.

### Step 5: Run Tests

```bash
# Smart contract tests
cd forum/blockchain
npm test

# Integration tests
cd forum
npm test
```

### Step 6: Start the Next.js App

```bash
cd forum
npm run dev
```

## Production Deployment

### Option A: Besu on Railway ("somewhat" production)

If you host the forum on Vercel and want the blockchain node on Railway (same place as your face verification service):

1. Follow **[besu-network/RAILWAY.md](../besu-network/RAILWAY.md)** for step-by-step Railway setup (Dockerfile, root directory, volume, deploy contract, env vars).
2. Then run the DB migration and set Vercel env vars as in that guide.

### Option B: Besu Node on VPS

1. **Provision a VPS** (DigitalOcean, AWS EC2, etc.)

   - Minimum: 2 vCPU, 4 GB RAM, 50 GB SSD
   - Ubuntu 22.04 or later
   - Docker installed

2. **Generate production keys**

   ```bash
   node -e "
     const { Wallet } = require('ethers');
     const w = Wallet.createRandom();
     console.log('Validator Address:', w.address);
     console.log('Validator Key:', w.privateKey.slice(2));
     const issuer = Wallet.createRandom();
     console.log('Issuer Address:', issuer.address);
     console.log('Issuer Key:', issuer.privateKey.slice(2));
   "
   ```

3. **Update genesis.json** with the validator address
4. **Copy files to VPS** and start:
   ```bash
   docker compose up -d
   ```
5. **Secure the node**:
   - Firewall: block port 8545 from public, allow only from your Vercel deployment IP
   - Use environment variables, never hardcode keys

### Phase 2: Deploy Smart Contract

```bash
cd forum/blockchain

# Set environment variables
export BLOCKCHAIN_RPC_URL=http://your-vps-ip:8545
export BLOCKCHAIN_DEPLOYER_PRIVATE_KEY=<issuer-private-key>

npm run deploy:dev
```

### Phase 3: Update Production Environment

In your Vercel project settings, add:

```
BLOCKCHAIN_RPC_URL=http://your-vps-ip:8545
BLOCKCHAIN_ISSUER_PRIVATE_KEY=<issuer-private-key>
BLOCKCHAIN_CONTRACT_ADDRESS=<deployed-address>
BLOCKCHAIN_CHAIN_ID=1337
BLOCKCHAIN_IDENTITY_SALT=<generate-a-strong-random-string>
```

### Phase 4: Run Database Migration

Execute `blockchain/migrations/001_blockchain_identities.sql` in your production Supabase instance.

## Verification Checklist

After deployment, verify each component:

### Infrastructure
- [ ] Besu node responds to JSON-RPC at the configured URL
- [ ] DigitalIdentityRegistry contract is deployed (`POST /api/blockchain/status`)
- [ ] ContentRegistry contract is deployed (`BLOCKCHAIN_CONTENT_REGISTRY_ADDRESS` set)

### Database
- [ ] `blockchain_identities` table exists with `verification_attempt_id` and `profile_hash` columns
- [ ] `blockchain_content_records` table exists with `user_id` column
- [ ] `blockchain_audit_log` table has expanded action constraint (includes `record_content`, `verify_profile`, etc.)
- [ ] `profiles` table has `blockchain_verified` column
- [ ] RLS policies allow service_role INSERT on all blockchain tables
- [ ] RLS policies allow public SELECT on `blockchain_identities` and `blockchain_content_records`

### Environment Variables
- [ ] `BLOCKCHAIN_RPC_URL` set
- [ ] `BLOCKCHAIN_ISSUER_PRIVATE_KEY` set (never commit!)
- [ ] `BLOCKCHAIN_CONTRACT_ADDRESS` set (DigitalIdentityRegistry)
- [ ] `BLOCKCHAIN_CONTENT_REGISTRY_ADDRESS` set (ContentRegistry)
- [ ] `BLOCKCHAIN_CHAIN_ID` set
- [ ] `BLOCKCHAIN_IDENTITY_SALT` set (strong random, never changes)

### End-to-End
- [ ] Verified signup creates on-chain identity + stores `profile_hash` and `verification_attempt_id`
- [ ] Creating an issue anchors its hash to the blockchain
- [ ] Creating a comment anchors its hash to the blockchain
- [ ] Casting a vote anchors its hash to the blockchain
- [ ] `GET /api/blockchain/verify-content` detects tampered content (red shield)
- [ ] `GET /api/blockchain/verify-profile` detects tampered profile fields
- [ ] `POST /api/blockchain/integrity-check` batch-checks all profiles + content
- [ ] `POST /api/blockchain/retry` successfully retries a failed identity issuance
- [ ] Audit log records all operations with correct actions

## Troubleshooting

### "Blockchain node unreachable"

- Check the Besu container is running: `docker ps`
- Check the RPC URL is correct and accessible from your server
- Check firewall rules

### "Transaction failed"

- Ensure the issuer address is authorized on the contract
- Check the issuer wallet has the correct private key
- Verify the contract address in env vars matches the deployed address

### "Identity already exists"

- Each user can only have one blockchain identity
- Check `blockchain_identities` table for existing records

### Contract redeployment

If you need to redeploy the contract:

1. Deploy new contract
2. Update `BLOCKCHAIN_CONTRACT_ADDRESS`
3. Existing on-chain records on the old contract will be inaccessible
4. Users will need new identities issued (or migrate via script)

## Cost Estimates (Private Network)

| Operation             | Cost                       |
| --------------------- | -------------------------- |
| Node hosting (VPS)    | ~$10-20/month              |
| Identity issuance     | $0 (free on private chain) |
| Identity verification | $0 (read-only)             |
| Storage growth        | ~1 KB per identity         |

## Migration to Public Chain

When ready to move to Polygon mainnet:

1. Deploy the same contract to Polygon
2. Update 3 environment variables (RPC URL, chain ID, contract address)
3. Fund the issuer wallet with MATIC (~$0.01 per identity)
4. Optionally replay existing identities from the database
5. Zero code changes required
