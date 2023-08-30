FROM node:16.20.2-slim
COPY ./packages ./packages
COPY ./package.json ./
COPY ./package-lock.json ./
RUN npm ci
EXPOSE 3000
CMD node $NODE_ARGS packages/reputation-miner/bin/index.js --dbPath $REPUTATION_JSON_PATH --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY --syncFrom $SYNC_FROM_BLOCK $ARGS
