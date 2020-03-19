module.exports = {

  // jest implicit/reserved words
  globals: {
    describe: "readonly",
    it: "readonly",
    beforeAll: "readonly",
    beforeEach: "readonly",
    afterAll: "readonly",
    afterEach: "readonly",
  },

  // some style exceptions for stuff that's useful in tests
  rules: {
    "no-await-in-loop": 0,    // wait until something external happens
  },
}
