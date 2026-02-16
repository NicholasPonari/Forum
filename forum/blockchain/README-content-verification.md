# Blockchain Content Verification System

This system anchors user-generated content (Issues, Comments, Votes) to the blockchain to ensure immutability and censorship resistance.

## Components

1.  **Smart Contract**: `ContentRegistry.sol`
    *   Stores hashes of content.
    *   Supports "tombstoning" (marking as deleted without erasing history).
2.  **Database**:
    *   `blockchain_content_records`: Links DB content (UUIDs) to blockchain transactions.
    *   `blockchain_audit_log`: Logs all blockchain interactions.
3.  **Backend**:
    *   `BlockchainContentManager`: Handles hashing and transaction submission.
    *   API Routes: `/api/blockchain/record-content` and `/api/blockchain/verify-content`.
4.  **Frontend**:
    *   `BlockchainVerificationBadge`: UI component showing verification status.
    *   Integrations in `IssueForm`, `CommentThread`, and `VoteButtons`.

## Deployment Instructions

### 1. Deploy the Smart Contract

Run the deployment script to deploy `ContentRegistry` to your local or dev network:

```bash
cd forum/blockchain
npx hardhat run scripts/deploy-content.ts --network besuLocal
# OR for remote dev node
npx hardhat run scripts/deploy-content.ts --network besuDev
```

### 2. Configure Environment Variables

The deployment script will output the contract address. Add this to your `forum/.env.local` file:

```env
BLOCKCHAIN_CONTENT_REGISTRY_ADDRESS=0x...
```

### 3. Database Migration

The migration file `20260216000000_add_blockchain_content_verification.sql` has been created.
If you are using Supabase local dev, it should apply automatically.
If connecting to a remote Supabase, push the migration:

```bash
cd forum
npx supabase db push
```

## How it Works

1.  **Recording**: When a user creates an issue, comment, or vote, the app calls `/api/blockchain/record-content`.
2.  **Hashing**: The server computes a SHA-256 hash of the content fields (e.g., `id`, `title`, `text`, `author`).
3.  **Anchoring**: This hash is sent to the `ContentRegistry` smart contract.
4.  **Verification**:
    *   The `BlockchainVerificationBadge` calls `/api/blockchain/verify-content`.
    *   The server re-computes the hash of the current DB content.
    *   It compares this DB hash against the hash recorded in the `blockchain_content_records` table (and optionally checks the chain).
    *   **Green Shield**: Hashes match (Authentic).
    *   **Red Shield**: Hashes mismatch (Tampered/Edited by Admin).
    *   **Yellow Shield**: Not yet anchored.
