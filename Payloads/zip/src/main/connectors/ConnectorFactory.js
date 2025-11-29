const GitConnector = require('./GitConnector');
const PrintConnector = require('./PrintConnector'); // [ADDED] Print connector

class ConnectorFactory {
  static create(type) {
    switch (type) {
      case 'GIT':
        return new GitConnector();
      case 'Print':           // [ADDED] support Print type (camel-case)
      case 'PRINT':           // [ADDED] support PRINT in upper-case
        return new PrintConnector();
      default:
        return null;
    }
  }
}

module.exports = ConnectorFactory;
