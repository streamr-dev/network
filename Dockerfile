# Use official node runtime as base image
FROM node:8.0.0-alpine

# Set the working directory to /app
WORKDIR /app

# Copy app code
COPY . /app

# Install package.json dependencies (yes, clean up must be part of same RUN command because of layering)
RUN apk add --update python build-base && npm install && apk del python build-base && rm -rf /var/cache/apk/*

# Make port 8890 available to the world outside this container
EXPOSE 8890

# Default environment variables
ENV DATA_TOPIC ""
ENV ZOOKEEPER ""
ENV REDIS ""
ENV REDIS_PWD ""
ENV CASSANDRA ""
ENV KEYSPACE ""
ENV STREAMR ""


CMD node data-api.js \
    --data-topic DATA_TOPIC \
    --zookeeper ZOOKEEPER \
    --redis REDIS \
    --redis-pwd REDIS_PWD \
    --cassandra CASSANDRA \
    --keyspace KEYSPACE \
    --streamr STREAMR \
    --port 8890