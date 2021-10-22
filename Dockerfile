FROM node:16-buster as build
WORKDIR /usr/src/monorepo
COPY . .
RUN npm set unsafe-perm true && \
	npm run bootstrap && \
	npm run bootstrap-pkg streamr-broker && \
	# image contains all packages, remove devDeps to keep image size down
	npm run prune-pkg streamr-broker

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
