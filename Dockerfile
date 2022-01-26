FROM node:16-bullseye as build
WORKDIR /usr/src/monorepo
RUN npm set unsafe-perm true && \
	# explicitly use npm v8
	npm install -g npm@8 --no-audit
COPY . .
RUN npm config set python "$(which python3)" && npm run bootstrap-pkg -- streamr-broker

RUN npm run prune-pkg -- streamr-broker

FROM node:16-bullseye-slim
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
