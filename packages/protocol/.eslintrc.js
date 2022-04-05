module.exports = {
    extends: 'eslint-config-monorepo',
    rules: { 'no-console': [ 'error', { allow: [ 'warn', 'error', 'info' ] } ] }
}
