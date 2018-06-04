// Browser native fetch implementation does not the http(s).Agent like node-fetch does

class Agent {}

module.exports = {
    Agent,
}
