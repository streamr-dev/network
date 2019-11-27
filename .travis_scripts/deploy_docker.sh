#!/bin/bash
## Script for logging in to docker service and upload docker imgaes
docker login -u "$DOCKER_USER" -p "$DOCKER_PASS"
if [ "$1" == "dev" ]; then
    # If the build is a cron build then it should tag and push a nightly build but if it is not a cronjob
    # then it is just another dev tag and push
    if [ "$TRAVIS_EVENT_TYPE" == "cron" ]; then
        # The script detects that there is a cron job through the variable TRAVIS_EVENT_TYPE which will be
        # 'cron' if the build is triggered by a cron job
        echo "Tag Nightly"
        nightly_build=nightly-$(date '+%Y-%m-%d')
        docker tag "$OWNER/$IMAGE_NAME:taggit" "$OWNER/$IMAGE_NAME:$nightly_build"
        docker tag "$OWNER/$IMAGE_NAME:taggit" "$OWNER/$IMAGE_NAME:nightly"
        ## Push Nightly
        docker push "$OWNER/$IMAGE_NAME:$nightly_build"
        docker push "$OWNER/$IMAGE_NAME:nightly"
    else
        echo "Tag dev"
        docker tag "$OWNER/$IMAGE_NAME:taggit" "$OWNER/$IMAGE_NAME:$1"
        ## Push dev
        docker push "$OWNER/$IMAGE_NAME:$1"
    fi
elif [ "$1" == "production" ]; then
    echo "Tag Production latest/tag"
    docker tag "$OWNER/$IMAGE_NAME:taggit" "$OWNER/$IMAGE_NAME:$TRAVIS_TAG"
    docker tag "$OWNER/$IMAGE_NAME:taggit" "$OWNER/$IMAGE_NAME:latest"
    ## Push Production
    docker push "$OWNER/$IMAGE_NAME:$TRAVIS_TAG"
    docker push "$OWNER/$IMAGE_NAME:latest"
fi
