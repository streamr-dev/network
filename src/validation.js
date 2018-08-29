"use strict";

const Joi = require('joi');

const Status = Joi.object().keys({
    started: Joi.date().required(),
    streams: Joi.array().items(Joi.string())
});

const Message = Joi.object().keys({
    code: Joi.number().required(),
    msg: Joi.required()
});

const validate = (type, value) => {
    let scheme;
    if (type === 'status') {
        scheme = Status;
    }
    else if (type === 'message') {
        scheme = Message;
    }
    
    return Joi.attempt(value, scheme)
};

module.exports = {
    validate
};