FROM node:14-buster as build
WORKDIR /usr/src/broker
COPY . .
RUN npm ci --only=production
# Build TypeScript files ("npm ci" doesn't trigger the build automatically: https://github.com/npm/npm/issues/17346)
RUN npm run build 

FROM node:14-buster-slim
RUN apt-get update && apt-get install --assume-yes --no-install-recommends curl \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/src/broker /usr/src/broker
WORKDIR /usr/src/broker

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

CMD node bin/broker.js ${CONFIG_FILE} --streamrUrl=${STREAMR_URL}
