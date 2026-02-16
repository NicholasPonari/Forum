const fs = require('fs');
const path = require('path');

const artifactPath = path.join(__dirname, '../artifacts/contracts/ContentRegistry.sol/ContentRegistry.json');
const destPath = path.join(__dirname, '../../src/lib/blockchain/content-registry-abi.json');

try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    fs.writeFileSync(destPath, JSON.stringify(artifact.abi, null, 2));
    console.log('ABI extracted to', destPath);
} catch (error) {
    console.error('Error extracting ABI:', error);
    process.exit(1);
}
