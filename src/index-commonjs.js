const Client = require('./index')

// required to get require('streamr-client') instead of require('streamr-client').default
module.exports = Client.default
Object.assign(Client.default, Client)
