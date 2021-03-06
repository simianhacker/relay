const Score = require('../../../lib/score');
const _ = require('lodash');

module.exports = new Score ('post', {
  fn: event => {
    return event.excerpt.length / 100;
  },
  color: '#515D91',
  toHTML: function (event) {
    return event._source.message;
  }
});
