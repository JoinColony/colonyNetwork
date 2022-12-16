FROM node:14-bullseye
RUN apt-get update || : && apt-get install python -y
COPY ./packages ./packages
COPY ./package.json ./
COPY ./package-lock.json ./
COPY ./build ./build
RUN npm install
RUN cd ./packages/reputation-miner/ && npm i 
RUN cd ./packages/package-utils/ && npm i 
EXPOSE 3000
CMD node $NODE_ARGS packages/reputation-miner/bin/index.js --dbPath $REPUTATION_JSON_PATH --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY --syncFrom $SYNC_FROM_BLOCK $ARGS
