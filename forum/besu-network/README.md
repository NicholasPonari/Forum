# Vox.Vote Private Blockchain Network

Private Hyperledger Besu network using Clique PoA (Proof of Authority) consensus for the Vox.Vote digital identity system.

## Architecture

- **Consensus**: Clique PoA (single validator for MVP, upgradable to IBFT 2.0 with 4+ validators)
- **Chain ID**: 1337
- **Block time**: 5 seconds
- **Gas price**: 0 (free transactions on private network)
- **Compatibility**: Full Ethereum/EVM compatibility (same Solidity contracts work on Polygon, Ethereum mainnet)

## Prerequisites

- Docker and Docker Compose installed
- The `node-key` file in this directory (included for dev, generate your own for production)

## Quick Start (Local Development)

```bash
# Start the Besu node
docker compose up -d

# Check it's running
curl -s http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# View logs
docker compose logs -f besu
```

## Deploy the Smart Contract

After the Besu node is running:

```bash
cd ../blockchain
npm run deploy:local
```

This will output the contract address. Add it to `forum/.env.local`:

```
BLOCKCHAIN_CONTRACT_ADDRESS=0x...
```

## Production Deployment

### 1. Generate a new node key (validator key)

```bash
# Using ethers.js (in Node.js)
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Address:', w.address); console.log('PrivateKey:', w.privateKey.slice(2));"
```

Save the private key as `node-key.prod` and update `docker-compose.yml` to mount it.

### 2. Update the genesis

Replace the dev address in both `genesis.json` fields:

- `extraData`: Replace the 40-char address after the 64 zeros
- `alloc`: Replace the dev address key with your production address

### 3. Deploy to VPS

```bash
# On your VPS
mkdir -p /opt/voxvote-besu
# Copy files: docker-compose.yml, genesis.json, node-key.prod
# Rename node-key.prod to node-key
docker compose up -d
```

### 4. Security

- Firewall: Only expose port 8545 to your Next.js server IP
- Never expose the JSON-RPC port to the public internet
- Use SSH tunnel or VPN for remote access during development
- Monitor disk usage: chain data grows over time

## Monitoring

```bash
# Check block number
curl -s http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check peer count (should be 0 for single-node MVP)
curl -s http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}'

# Besu health check
curl -s http://localhost:8545/liveness
```

## Migration Path

When ready to move to a public chain:

1. Deploy the same `DigitalIdentityRegistry.sol` to Polygon
2. Update `BLOCKCHAIN_RPC_URL` to Polygon RPC endpoint
3. Update `BLOCKCHAIN_CHAIN_ID` to 137
4. Fund the issuer wallet with MATIC
5. Replay identity hashes from the database to the new contract

No code changes needed in the Next.js application.
