FROM node:16-buster as build
WORKDIR /usr/src/monorepo
COPY . .
RUN npm set unsafe-perm true
RUN npm set loglevel verbose
# explicitly use npm v6
RUN npm install -g npm@6
RUN npm ci
RUN npm run bootstrap-pkg -- @streamr/dev-config
RUN npm run bootstrap-pkg -- streamr-test-utils
RUN npm run bootstrap-pkg -- streamr-client-protocol
RUN npm run bootstrap-pkg -- streamr-network
RUN npm run bootstrap-pkg -- streamr-client
RUN npm run bootstrap-pkg -- @streamr/cli-tools
RUN npx lerna bootstrap --scope streamr-broker
# image contains all packages, remove devDeps to keep image size down
RUN npx lerna exec -- npm prune --production
# restore inter-package symlinks removed by npm prune
RUN npx lerna link

FROM node:16-buster-slim
RUN apt-get update && apt-get install --assume-yes --no-install-recommends curl \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/src/monorepo /usr/src/monorepo
WORKDIR /usr/src/monorepo

ENV LOG_LEVEL=info

RUN ln -s packages/broker/tracker.js tracker.js

WORKDIR /usr/src/monorepo/packages/broker
CMD ./bin/broker.js # start broker from default config
