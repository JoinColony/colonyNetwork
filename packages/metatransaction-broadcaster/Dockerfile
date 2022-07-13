FROM node:16-bullseye
COPY ./packages ./packages
COPY ./package.json ./
COPY ./yarn.lock ./
COPY ./build ./build
RUN yarn
EXPOSE 3000
CMD node $NODE_ARGS packages/metatransaction-broadcaster/bin/index.js --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY --gasLimit $GASLIMIT $ARGS
