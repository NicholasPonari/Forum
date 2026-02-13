# Deploy Besu to Railway ("Somewhat" Production)

Run the Vox.Vote private blockchain node on Railway so your Vercel-hosted forum can issue and verify identities in production.

---

## 1. Create a new Railway project (Besu service)

1. Go to [Railway](https://railway.app) and open your dashboard.
2. **New Project** → **Deploy from GitHub repo** (or "Empty project" and connect repo later).
3. Select the **Vox.Vote** repo (or the one containing `forum/besu-network`).

---

## 2. Add the Besu service from the repo

1. In the project, click **+ New** → **GitHub Repo** (or **Service** if you already have the repo).
2. Choose the same repo.
3. In the new service settings:
   - **Root Directory**: set to `forum/besu-network` (so Railway builds from the Dockerfile there).
   - **Builder**: **Dockerfile** (Railway should detect the Dockerfile in that directory).
   - **Watch Paths**: leave default, or set to `forum/besu-network/**` so only changes in that folder trigger deploys.

---

## 3. Expose port and get the public URL

1. Open the Besu service → **Settings** → **Networking**.
2. Click **Generate Domain**. Railway will assign a URL like `besu-production-xxxx.up.railway.app`.
3. **Port**: set to **8545** (JSON-RPC). Railway will route HTTP to this port.

Note: Railway sends **HTTPS** to your service. Besu speaks JSON-RPC over HTTP, so the generated URL will be `https://besu-production-xxxx.up.railway.app`. Your Next.js app will call this URL; some RPC clients handle HTTPS fine. If you hit TLS issues, see the troubleshooting section below.

---

## 4. Add a persistent volume (recommended)

So the chain database survives redeploys:

1. Besu service → **Settings** → **Volumes**.
2. **Add Volume**.
3. **Mount Path**: `/opt/besu/data`
4. Save. Redeploy so the new volume is used.

Without a volume, every redeploy starts from genesis (empty chain); you’d need to redeploy the contract and re-issue identities.

---

## 5. Deploy and wait for the service to be up

1. Trigger a deploy (push to the repo or **Deploy** in the dashboard).
2. Check **Deployments** and **Logs**. Wait until you see Besu logs (e.g. "Listening for connections").
3. Test the RPC (replace with your Railway URL):

```bash
curl -s https://YOUR-BESU-URL.up.railway.app -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

You should get something like `{"jsonrpc":"2.0","id":1,"result":"0x0"}` or a higher block number.

---

## 6. Deploy the smart contract (from your machine)

Use the same contract and deploy script; point it at the **Besu service URL** (not the forum app URL).

**Important:** `BLOCKCHAIN_RPC_URL` must be the URL of the **Besu** Railway service (e.g. `besu-production-xxxx.up.railway.app`), not your Next.js forum (e.g. `forum-production-xxxx.up.railway.app`). The forum returns HTML; Hardhat expects JSON-RPC and will timeout or fail.

```bash
cd forum/blockchain

# One-time: set the Railway BESU service URL (not the forum URL)
export BLOCKCHAIN_RPC_URL=https://YOUR-BESU-SERVICE-URL.up.railway.app
export BLOCKCHAIN_DEPLOYER_PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Or use BLOCKCHAIN_ISSUER_PRIVATE_KEY if you have it in .env
# export BLOCKCHAIN_ISSUER_PRIVATE_KEY=...

npm run deploy:dev
```

Copy the printed **contract address**.

If the deploy fails with a connection or timeout error, confirm you are using the Besu service domain and that the Besu service is running and has generated a domain.

---

## 7. Configure production environment variables

**In Vercel** (where the forum runs):

1. Project → **Settings** → **Environment Variables**.
2. Add (for **Production** and optionally Preview):

| Name | Value |
|------|--------|
| `BLOCKCHAIN_RPC_URL` | `https://YOUR-BESU-URL.up.railway.app` |
| `BLOCKCHAIN_ISSUER_PRIVATE_KEY` | Same hex key you used to deploy (dev key for "somewhat" prod, or a new key you authorized as issuer) |
| `BLOCKCHAIN_CONTRACT_ADDRESS` | The address from step 6 |
| `BLOCKCHAIN_CHAIN_ID` | `1337` |
| `BLOCKCHAIN_IDENTITY_SALT` | A long random string (never change after first real user) |

Redeploy the Next.js app so it picks up the new variables.

---

## 8. Run the database migration (if not done yet)

In **Supabase** → SQL Editor, run the contents of `forum/blockchain/migrations/001_blockchain_identities.sql` so the `blockchain_identities` and `blockchain_audit_log` tables (and any RLS) exist.

---

## 9. Sanity check

1. **Forum (Vercel)**: Sign up a new verified user and complete verification.
2. On the success step you should see the “Immutable record created” (or similar) blockchain badge.
3. In Railway Besu logs you should see a new block (transaction).
4. In Supabase, check `blockchain_identities` for a new row and `blockchain_audit_log` for an `issue` action.

---

## Optional: Production key and genesis

For a bit more production-like setup:

1. **New node key** (validator):
   ```bash
   node -e "const w = require('ethers').Wallet.createRandom(); console.log('PrivateKey:', w.privateKey.slice(2)); console.log('Address:', w.address);"
   ```
2. Put the private key in a file, e.g. `node-key.prod`. In Railway, add a **Variable** (e.g. `BESU_NODE_KEY`) with that value and in your build/entrypoint write it to `/opt/besu/data/key` instead of using the baked-in `node-key` (requires a small change to the Dockerfile/entrypoint to use the env var).
3. **Genesis**: In `genesis.json` replace the dev address `f39fd6e51aad88f6f4ce6ab8827279cfffb92266` with the new address (in `extraData` and in `alloc`), then rebuild and redeploy the Besu service.

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| **Deploy fails / "Cannot find Dockerfile"** | Set **Root Directory** to `forum/besu-network` and ensure the Dockerfile and `entrypoint.sh` are in that directory. |
| **502 Bad Gateway** | Besu may still be starting. Wait 1–2 minutes and check logs. Ensure the exposed port is **8545**. |
| **Contract deploy fails (connection)** | Use the exact Railway URL (with `https://`). If your RPC client doesn’t like HTTPS, try a tunnel (e.g. ngrok) to `http://localhost:8545` for the deploy only, or use a Railway TCP proxy if available. |
| **"Identity issuance failed" in the app** | Confirm Vercel env vars (especially `BLOCKCHAIN_RPC_URL` and `BLOCKCHAIN_CONTRACT_ADDRESS`). Check Railway Besu logs for incoming requests. |
| **Chain resets after redeploy** | Add the Volume at `/opt/besu/data` (step 4) and redeploy so data persists. |

---

## Summary checklist

- [ ] New Railway project, service from repo with **Root Directory** `forum/besu-network`
- [ ] **Generate Domain** for the service, port **8545**
- [ ] Volume at **Mount Path** `/opt/besu/data`
- [ ] Deploy; confirm Besu is up and RPC responds
- [ ] Deploy contract from local with `BLOCKCHAIN_RPC_URL` = Railway URL
- [ ] Set all 5 blockchain env vars in Vercel
- [ ] Run DB migration in Supabase
- [ ] Test verified signup and blockchain badge

After this, your forum on Vercel will use the Besu node on Railway for on-chain identity in "somewhat" production.
