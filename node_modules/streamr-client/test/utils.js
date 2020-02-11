const uniqueId = require('lodash.uniqueid')

export const uid = (prefix) => uniqueId(`p${process.pid}${prefix ? '-' + prefix : ''}`)
