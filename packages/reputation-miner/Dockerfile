FROM node:12.18.2
COPY ./packages ./packages
COPY ./package.json ./
COPY ./yarn.lock ./
COPY ./build ./build
RUN yarn
EXPOSE 3000
CMD node $NODE_ARGS packages/reputation-miner/bin/index.js --dbPath $REPUTATION_JSON_PATH --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY --syncFrom $SYNC_FROM_BLOCK $ARGS
