SHELL := /bin/bash
.SHELLFLAGS := -e -u -o pipefail -c
.DEFAULT_GOAL := docker-build

.PHONY: docker-build
docker-build:
	docker build \
		--no-cache \
		--progress=plain \
		--tag streamr/broker-node:dev .

