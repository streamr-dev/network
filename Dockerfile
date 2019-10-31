# Use official node runtime as base image
FROM node:10.15.3-alpine

# Set the working directory to /app
WORKDIR /app

# Copy app code
COPY . /app

# Logging level
ENV DEBUG=streamr:logic:*

# Install package.json dependencies (yes, clean up must be part of same RUN command because of layering)
RUN apk add --update python build-base && npm ci && apk del python build-base && rm -rf /var/cache/apk/*

# Make port available to the world outside this container
EXPOSE 30300

CMD node bin/tracker.js 30300
