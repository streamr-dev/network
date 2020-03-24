FROM node:13.10
WORKDIR /usr/src/broker
COPY . .

RUN node --version
RUN npm --version
RUN npm ci --only=production

# Make ports available to the world outside this container
EXPOSE 30315
# WebSocket
EXPOSE 8890
# HTTP
EXPOSE 8891
# MQTT
EXPOSE 9000

ENV DEBUG=streamr:logic:*
ENV CONFIG_FILE configs/docker-1.env.json
ENV STREAMR_URL http://127.0.0.1:8081/streamr-core

CMD node app.js ${CONFIG_FILE} --streamrUrl=${STREAMR_URL}
