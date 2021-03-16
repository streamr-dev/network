module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        // don't care about line length
        // 200 seems generous, also just warn
        'header-max-length': [1, 'always', 200],
        'body-max-line-length': [1, 'always', 200],
        'footer-max-line-length': [1, 'always', 200],
        // don't care about case
        'header-case': [0, 'always', 'lower-case'],
        'subject-case': [0, 'always', 'lower-case'],
        'body-case': [0, 'always', 'lower-case'],
        // don't care about trailing full-stop.
        'subject-full-stop': [0, 'never', '.'],
        'header-full-stop': [0, 'never', '.']
    }
}
