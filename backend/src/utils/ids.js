const { v4: uuidv4 } = require('uuid');

function newId(prefix) {
  return `${prefix}_${uuidv4()}`;
}

module.exports = { newId };
