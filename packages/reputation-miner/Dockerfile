FROM node:16.20.2-slim
COPY ./build ./build
COPY ./packages ./packages
COPY ./package.json ./
COPY ./package-lock.json ./
RUN npm ci
EXPOSE 3000
CMD node $NODE_ARGS packages/reputation-miner/bin/index.js
