FROM node:16-buster as build
WORKDIR /usr/src/monorepo
RUN npm set unsafe-perm true && \
	# explicitly use npm v6
	npm install -g npm@6 --prefer-offline
COPY ["./*.json", "./*.js", "./*.mjs", ".npmrc",  ".gitignore", "./"]
RUN npm ci
COPY ["./packages", "./packages"]
RUN npm run bootstrap-pkg -- streamr-broker

# image contains all packages, remove devDeps to keep image size down
# --ignore-scripts as sqlite package in the client tries running its
# 'install' script, which uses node-pre-gyp, which is a devDependency that
# gets removed by prune.
RUN npx lerna exec -- npm prune --production --ignore-scripts && \
	# restore inter-package symlinks removed by npm prune
	npx lerna link

FROM node:16-buster-slim
RUN apt-get update && apt-get install --assume-yes --no-install-recommends curl \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/src/monorepo /usr/src/monorepo
WORKDIR /usr/src/monorepo

ENV LOG_LEVEL=info

RUN ln -s packages/broker/tracker.js tracker.js

EXPOSE 1883/tcp
EXPOSE 7170/tcp
EXPOSE 7171/tcp

WORKDIR /usr/src/monorepo/packages/broker

# start broker from default config
CMD ["./bin/broker.js"]
