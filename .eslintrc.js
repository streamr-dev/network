module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "extends": [
        "plugin:prettier/recommended",
        "prettier/flowtype",
        "prettier/standard"
    ],
    "plugins": [
        "prettier"
    ],
    "rules": {
        "prettier/prettier": "error"
    },
    "parserOptions": {
        "ecmaVersion": 2017,
        "sourceType": "module"
    }
};