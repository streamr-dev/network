#!/usr/bin/env bash
cd /srv/broker
mkdir -p /srv/broker/.npm-global/bin/
mv /srv/broker/.codedeploy/broker /srv/broker/.npm-global/bin/
NPM_CONFIG_PREFIX=/srv/broker/.npm-global npm install --unsafe-perm