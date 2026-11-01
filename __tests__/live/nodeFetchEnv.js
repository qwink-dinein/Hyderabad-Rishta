// Jest environment for the LIVE tests: plain Node, but keeps Node's own fetch (the jest-expo preset replaces
// global fetch with a React Native polyfill that cannot make real network calls in Node).
const { TestEnvironment } = require('jest-environment-node');

class NodeFetchEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.__nodeFetch = fetch.bind(globalThis);
  }
}
module.exports = NodeFetchEnvironment;
