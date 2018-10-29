FROM node:9.1.0
COPY ./packages ./packages
COPY ./package.json ./
COPY ./yarn.lock ./
COPY ./build ./build
RUN yarn
EXPOSE 3000
CMD node packages/reputation-miner/bin/index.js --file $REPUTATION_JSON_PATH --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY --rinkeby
