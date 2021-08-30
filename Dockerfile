FROM node:16-buster as build
WORKDIR /usr/src/monorepo
COPY . .
RUN npm set unsafe-perm true
RUN npm install -g npm@6 # explicitly use npm v6
RUN npm ci
RUN npm run bootstrap-pkg streamr-broker
RUN npx lerna exec -- npm prune --production # image contains all packages, remove devDeps to keep image size down
RUN npx lerna link # restore inter-package symlinks removed by npm prune

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
