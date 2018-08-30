#!/usr/bin/env bash
if [ $1 = "staging" ]; then
    docker login -u "${DOCKER_USER}" -p "${DOCKER_PASS}"
    docker push $OWNER/$IMAGE_NAME:$TAG
fi
