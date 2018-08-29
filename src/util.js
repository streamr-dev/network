"use strict";

const uuidV1 = require('uuid/v1');

const callbackToPromise = (method, ...args) => {
  return new Promise((resolve, reject) => {
    return method(...args, (err, result) => {
      return err ? reject(err) : resolve(result);
    });
  });
};

const getStreams = (amount = 3) => {
  let streams = [];

  for (let i = 0; i < amount; i++) {
    streams.push(uuidV1());
  }

  return streams;
};

module.exports = {
  callbackToPromise,
  getStreams
};
