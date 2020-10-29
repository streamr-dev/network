FROM node:14 as build
WORKDIR /usr/src/broker
COPY . .

RUN node --version
RUN npm --version
RUN npm ci --only=production

FROM node:14-alpine

# needed for uWebSockets.js
RUN apk update && apk add --no-cache gcompat curl

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
ENV STREAMR_URL http://127.0.0.1:8081/streamr-core

CMD node app.js ${CONFIG_FILE} --streamrUrl=${STREAMR_URL}
