FROM node:14-buster as build
WORKDIR /usr/src/monorepo
COPY . .
RUN npm set unsafe-perm true
RUN npm ci
RUN npm run bootstrap-pkg streamr-broker

FROM node:14-buster-slim
RUN apt-get update && apt-get install --assume-yes --no-install-recommends curl \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/src/monorepo /usr/src/monorepo
WORKDIR /usr/src/monorepo

# Make ports available to the world outside this container
EXPOSE 30315
# WebSocket
EXPOSE 8890
# HTTP
EXPOSE 8891
# MQTT
EXPOSE 9000

ENV LOG_LEVEL=info
ENV CONFIG_FILE configs/docker-1.env.json
ENV STREAMR_URL http://10.200.10.1

CMD node packages/broker/bin/broker.js packages/broker/${CONFIG_FILE} --streamrUrl=${STREAMR_URL}
