SHELL = /bin/bash
.SHELLFLAGS = -e -u -o pipefail -c
.DEFAULT_GOAL = docker-build

.PHONY: docker-build
docker-build:
	docker build \
		--progress=plain \
		--build-arg NODE_ENV=development \
		--file Dockerfile.broker \
		--tag streamr/broker-node:dev .
