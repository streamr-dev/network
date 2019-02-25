#!/usr/bin/env bash
cd /srv/data-api/
git reset --hard HEAD
git pull origin master
npm install --unsafe-perm
