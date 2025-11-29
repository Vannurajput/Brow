class BaseConnector {
  async execute(_payload) {
    throw new Error('execute() not implemented');
  }
}
module.exports = BaseConnector;
