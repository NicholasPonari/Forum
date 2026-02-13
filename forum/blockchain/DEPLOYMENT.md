# Blockchain Identity System - Deployment Guide

## Overview

This document covers the complete deployment process for the Vox.Vote blockchain identity system, from local development to production.

## System Components

| Component        | Location                  | Purpose                    |
| ---------------- | ------------------------- | -------------------------- |
| Smart Contract   | `blockchain/contracts/`   | On-chain identity registry |
| Besu Node        | `besu-network/`           | Private blockchain network |
| Identity Manager | `src/lib/blockchain/`     | TypeScript service layer   |
| API Routes       | `src/app/api/blockchain/` | HTTP endpoints             |
| DB Migration     | `blockchain/migrations/`  | PostgreSQL schema          |

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
BLOCKCHAIN_ISSUER_PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BLOCKCHAIN_CONTRACT_ADDRESS=<address from step 2>
BLOCKCHAIN_CHAIN_ID=1337
BLOCKCHAIN_IDENTITY_SALT=voxvote-dev-salt-change-for-production
```

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

### Phase 1: Besu Node on VPS

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

- [ ] Besu node responds to JSON-RPC at the configured URL
- [ ] Smart contract is deployed (check with `POST /api/blockchain/status`)
- [ ] Database tables exist (`blockchain_identities`, `blockchain_audit_log`)
- [ ] `profiles` table has `blockchain_verified` column
- [ ] Environment variables are set in Vercel/production
- [ ] Test a verified signup creates an on-chain identity
- [ ] Test signin shows blockchain verification status
- [ ] Audit log records operations

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
