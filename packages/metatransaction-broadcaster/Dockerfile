FROM node:20.11.0-buster
COPY ./packages ./packages
COPY ./package.json ./
COPY ./package-lock.json ./
COPY ./artifacts ./artifacts
RUN git config --global url."https://".insteadOf "ssh://git@"
RUN npm ci
EXPOSE 3000
CMD node $NODE_ARGS packages/metatransaction-broadcaster/bin/index.js --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY $ARGS
