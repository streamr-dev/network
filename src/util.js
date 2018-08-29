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

const getAddress = (peerInfo) => {
  return peerInfo.multiaddrs.toArray()[0].toString();
};

const buildMessage = (code, data) => {
  return JSON.stringify({ code: code, msg: data });
};

module.exports = {
  callbackToPromise,
  getStreams,
  getAddress,
  buildMessage
};
