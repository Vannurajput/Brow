// src/main/messageHandler.js
const ConnectorFactory = require('./connectors/ConnectorFactory');
const log = require('../logger');

// Normalize incoming message into the payload we pass to connectors
function buildPayload(message) {
  return {
    git: message.git || {},
    db: message.db || {},
    dbType: message.dbType || null,
    metadata: message.metadata || {}
  };
}

async function handleExternalMessage(message) {
  // 1) log everything that comes in
  log.info('[MessageHandler] received external message:', message);

  const type = message?.type;

  // 🔒 All messages must now provide a type
  if (!type) {
    log.warn('[MessageHandler] message missing "type" field:', message);
    throw new Error('Message missing "type"');
  }

  // 2) Ask the factory which connector to use for this type
  log.debug('[MessageHandler] resolving connector for type:', type);
  const connector = ConnectorFactory.create(type);
  if (!connector) {
    log.error('[MessageHandler] unknown connector type:', type);
    throw new Error(`Unknown connector type: ${type}`);
  }

  // 3) Decide which payload to pass to the connector:
  //    - If the message has a "payload" property, use it directly
  //    - Otherwise, fall back to the legacy buildPayload() format (git/db/etc.)
  let payload;
  if (Object.prototype.hasOwnProperty.call(message, 'payload')) {
    payload = message.payload;
    log.debug(
      '[MessageHandler] using message.payload for connector:',
      JSON.stringify(payload, null, 2)
    );
  } else {
    payload = buildPayload(message);
    log.debug(
      '[MessageHandler] built legacy payload from message:',
      JSON.stringify(payload, null, 2)
    );
  }

  // 4) Run the selected connector
  const result = await connector.execute(payload);
  log.debug('[MessageHandler] connector result:', result);

  return result;
}

module.exports = { handleExternalMessage };
