FROM node:16-bullseye as build
WORKDIR /usr/src/monorepo
RUN npm config set \
	unsafe-perm=true \
	python="$(which python3)"
COPY . .
RUN npm run bootstrap-pkg -- streamr-broker && npm run prune-pkg -- streamr-broker

FROM node:16-bullseye-slim
RUN apt-get update && apt-get --assume-yes --no-install-recommends install \
	curl=7.74.0-1.3+deb11u1 \
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
