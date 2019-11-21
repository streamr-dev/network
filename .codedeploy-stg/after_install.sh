#!/usr/bin/env bash
cd /srv/tracker
mkdir -p /srv/tracker/.npm-global/bin/
mv /srv/tracker/.codedeploy/tracker /srv/tracker/.npm-global/bin/
# TODO config correctly permissions in AWS and remove `--unsafe-perm`
NPM_CONFIG_PREFIX=/srv/tracker/.npm-global npm install --unsafe-perm
