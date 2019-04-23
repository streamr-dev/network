# Streamr P2P network  ![Travis](https://travis-ci.com/streamr-dev/network.svg?token=qNNVCnYJo1fz18VTNpPZ&branch=master)

# Installation

### Mac OS

#### install brew 
`/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`

#### install nvm

`brew update`

`brew doctor`
 
`brew install nvm`

#### install current node lts (v10.15.3)

`nvm install v10.15.3`

`nvm use default v10.15.3`

#### install npm (v6.9.0)

`npm install -g npm@6.9.0`


#### install packages

`npm ci`

# run network
`npm run network 2`

where 2 is a number of nodes in network

# run tracker

`npm run tracker`

# run node

`npm run node` - default node with port 30301

or

`npm run node 30302`

`npm run node 30303`

and etc

# run publisher

`npm run pub`

# run subscriber

`npm run sub`

# Debugging
to get all streamr network debug messages `export DEBUG=streamr:*`

to get messages by layers run:

- connection layer `export DEBUG=streamr:connection:*`
- logic layer `export DEBUG=streamr:logic:*`
- protocol layer `export DEBUG=streamr:protocol:*`

to get all debug messages run `export DEBUG=*`

to exclude level `export DEBUG=streamr:*,-streamr:connection:*`

# Testing
run all tests

`npm run test`

run unit tests

`npm run test-unit`

run integration tests

`npm run test-integration`

code coverage

`./node_modules/jest/bin/jest.js --coverage`

run one test

`./node_modules/jest/bin/jest.js ./test/integration/message-duplication.test.js`

# Releasing
To release a new version of network onto NPM
1. Update version with either `npm version patch`, `npm version minor`, or `npm version major`. Use semantic version
https://semver.org/.
2. `git tag X.Y.Z` replacing `X.Y.Z` with the output of the previous command.
3. `git push --follow-tags`
4. Wait for Travis CI to run tests and to publish to npm if successful.
