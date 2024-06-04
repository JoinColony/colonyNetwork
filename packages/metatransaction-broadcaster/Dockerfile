FROM node:20.11.0-buster
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY ./packages ./packages
COPY ./package.json ./
COPY ./pnpm-lock.yaml ./
COPY ./pnpm-workspace.yaml ./
COPY ./patches ./patches
COPY ./artifacts ./artifacts
RUN pnpm i -g pnpm@8.14.1
RUN pnpm install --frozen-lockfile
EXPOSE 3000
CMD node $NODE_ARGS packages/metatransaction-broadcaster/bin/index.js --colonyNetworkAddress $COLONYNETWORK_ADDRESS --privateKey $PRIVATE_KEY $ARGS
