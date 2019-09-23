# Use official node runtime as base image
FROM node:10.15.3-alpine

ARG NPM_TOKEN

# Set the working directory to /app
WORKDIR /app

# Copy app code
COPY . /app

# Install package.json dependencies (yes, clean up must be part of same RUN command because of layering)
RUN apk add --update python build-base && npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN && npm install && apk del python build-base && rm -rf /var/cache/apk/*

# Make port available to the world outside this container
EXPOSE 30300

CMD node bin/tracker.js 30300
