FROM node:14-bullseye
COPY ./packages ./packages
COPY ./package.json ./
COPY ./package-lock.json ./
COPY ./build ./build
RUN npm ci
EXPOSE 3000
CMD node $NODE_ARGS packages/metatransaction-broadcaster/bin/index.js --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY --gasLimit $GASLIMIT $ARGS
