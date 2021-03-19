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
        'header-full-stop': [0, 'never', '.'],
        // valid types + descriptions
        // feel free to add more types as necessary
        'type-enum': [2, 'always', [
            'build', // Changes that affect the build system
            'ci', // Changes to our CI configuration files and scripts.
            'docs', // Documentation only changes
            'feat', // A new feature
            'fix', // A bug fix
            'perf', // A code change that improves performance
            'refactor', // A code change that neither fixes a bug nor adds a feature
            'style', // Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
            'test', // Adding missing tests or correcting existing tests
            'revert', // git revert
            'deps', // Changes that affect external dependencies e.g. refreshing package-lock, updating deps.
            'deploy', // for gh-pages
            'types', // for changes to types
        ]],
    }
}
