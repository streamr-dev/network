#!/usr/bin/env bash
docker login -u "${DOCKER_USER}" -p "${DOCKER_PASS}"
if [ $1 = "staging" ]; then
    docker push $OWNER/$IMAGE_NAME:$TAG
elif [ $1 = "production" ]; then
    docker build -t $OWNER/$IMAGE_NAME:$TAG .
    docker push $OWNER/$IMAGE_NAME:$TAG
fi
