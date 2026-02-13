# Vox.Vote private Besu node for Railway (or any Docker host)
FROM hyperledger/besu:24.1

# Config and dev validator key (replace node-key for production with a secret)
COPY genesis.json /opt/besu/genesis.json
COPY node-key /opt/besu/node-key-seed

# Ensure data dir exists; entrypoint copies key on first start (so Railway volume doesn't hide it)
RUN mkdir -p /opt/besu/data

COPY --chmod=+x entrypoint.sh /entrypoint.sh

# Run as root so entrypoint can copy key into volume; Besu will run as root (ok for "somewhat" production)
USER root

EXPOSE 8545 8546

ENTRYPOINT ["/entrypoint.sh"]
CMD ["--genesis-file=/opt/besu/genesis.json", \
     "--network-id=1337", \
     "--rpc-http-enabled", \
     "--rpc-http-host=0.0.0.0", \
     "--rpc-http-port=8545", \
     "--rpc-http-cors-origins=*", \
     "--rpc-http-api=ETH,NET,WEB3,CLIQUE,ADMIN", \
     "--rpc-ws-enabled", \
     "--rpc-ws-host=0.0.0.0", \
     "--rpc-ws-port=8546", \
     "--host-allowlist=*", \
     "--min-gas-price=0", \
     "--miner-enabled", \
     "--miner-coinbase=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", \
     "--logging=INFO"]
