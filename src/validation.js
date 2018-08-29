"use strict";

const Joi = require('joi');

const Status = Joi.object().keys({
    started: Joi.date().required(),
    streams: Joi.array().items(Joi.string())
});

const validate = (type, value) => {
    let scheme;
    if (type === 'status') {
        scheme = Status;
    }
    
    return Joi.attempt(value, scheme)
};

module.exports = {
    validate
};