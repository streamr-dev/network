#!/usr/bin/env bash
cd /srv/broker
mkdir /srv/.npm-global
NPM_CONFIG_PREFIX=/srv/.npm-global npm install
