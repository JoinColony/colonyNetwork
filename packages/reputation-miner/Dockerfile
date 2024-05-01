FROM node:20.11.0-buster
RUN apt-get update || : && apt-get install python -y
COPY ./packages ./packages
COPY ./package.json ./
COPY ./package-lock.json ./
COPY ./artifacts ./artifacts
RUN git config --global url."https://".insteadOf "ssh://git@"
RUN npm ci
EXPOSE 3000
CMD node $NODE_ARGS packages/reputation-miner/bin/index.js --dbPath $REPUTATION_JSON_PATH --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY --syncFrom $SYNC_FROM_BLOCK $ARGS
