FROM node:12.18.2
COPY ./packages ./packages
COPY ./package.json ./
COPY ./yarn.lock ./
COPY ./build ./build
RUN yarn
EXPOSE 3000
CMD node $NODE_ARGS packages/kyc-oracle/bin/index.js --whitelistAddress $WHITELIST_ADDRESS --apiKey $API_KEY --privateKey $PRIVATE_KEY $ARGS
