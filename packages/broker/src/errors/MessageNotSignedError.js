class MessageNotSignedError extends Error {}
class MessageNotEncryptedError extends Error {}

module.exports = {
    MessageNotSignedError,
    MessageNotEncryptedError
}
