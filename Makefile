SHELL := /bin/bash
.SHELLFLAGS := -ec
.ONESHELL: ; # rules execute in same shell
#.SILENT: ; # no need for @
.NOTPARALLEL: ; # wait for this target to finish
.EXPORT_ALL_VARIABLES: ; # send all vars to shell
.DEFAULT_GOAL := docker-build

.PHONY: docker-build
docker-build:
	docker build -t streamr/broker-node:dev .

