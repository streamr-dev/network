FROM ubuntu:16.04 AS builder
ARG NODE_VERSION="v10.18.0"
WORKDIR /app
COPY . /app
RUN apt-get update && apt-get install -y \
	build-essential \
	curl \
	git \
	python3 \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /
RUN curl -s -O "https://nodejs.org/download/release/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz"
RUN tar xzf "node-${NODE_VERSION}-linux-x64.tar.gz"
ENV PATH="/node-${NODE_VERSION}-linux-x64/bin:${PATH}"
RUN node --version
RUN npm --version
RUN useradd -ms /bin/bash node
USER node
WORKDIR /home/node
COPY ./ ./
RUN npm ci

FROM ubuntu:16.04
ARG NODE_VERSION="v10.18.0"
WORKDIR /app
COPY --from=builder /app/ .
RUN apt-get update && apt-get install -y \
	curl \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /
ENV PATH="/node-$NODE_VERSION-linux-x64/bin:${PATH}"
COPY --from=builder --chown=root:root /node-$NODE_VERSION-linux-x64/ /node-$NODE_VERSION-linux-x64/

RUN useradd -ms /bin/bash node
USER node
WORKDIR /home/node
COPY --from=builder --chown=node:node /home/node/ ./

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
