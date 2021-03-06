const _ = require('lodash');
const config = require('./config');
const loadMethods = require('./load_methods.js');
const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
  host: config.elasticsearch.host,
});
const actors = loadMethods('../actors');

module.exports = class Source {
  constructor(type, config) {

    const actorNames = _.zipObject(actors.map((actor) =>
      [actor.aliases[type] || actor.name , actor.name]));

    const actorMap = _.zipObject(actors.map((actor) =>
      [actor.aliases[type] || actor.name , actor]));

    const scoreFns = loadMethods('../sources/' + type + '/scores');

    /* TODO: this.template for elasticsearch templates specific to this type */
    this.type = type;
    this.start = config.start;

    this.store = event => {

      if (!_.isPlainObject(event)) {
        return;
      }

      const index = 'relay_' + this.type;

      // This take a function or a string. If a string, the string is the path to the value in the event
      // For example 'event.meta.username' as a string, or you could do...
      // function (event) { return event.meta.username; }
      const id = _.isFunction(config.id) ? config.id(event) : _.get(event, config.id);
      const extractedTimestamp = _.isFunction(config.timestamp) ? config.timestamp(event) : _.get(event, config.timestamp);
      const extractedActor = _.isFunction(config.actor) ? config.actor(event) : _.get(event, config.actor);

      const actorName = actorNames[extractedActor] || extractedActor;
      const actorDefinition = actorMap[actorName];

      event['@timestamp'] = extractedTimestamp || (new Date()).toISOString();
      event.relay_known = actorNames[extractedActor] ? true : false;
      event.relay_actor = actorName;

      if (!index || id == null || event.relay_actor == null) {
        console.log('Invalid event', index, id, event);
        return;
      }

      return Promise
      .all(scoreFns.map(score => score.fn(event, actorDefinition)))
      .then(scores => {
        event.relay_total_score = 0;
        event.relay_scores = _.compact(scores.map((score, i) => {
          if (score == null) return null;
          event.relay_total_score += score;
          return {name: this.type + ':' + scoreFns[i].name, source: this.type, score: score};
        }));

        event.relay_score_names = event.relay_scores.map((obj) => obj.name);

        client.index({
          index: index,
          type: 'relay_event',
          id: id,
          body: event
        });
      });

      /*
        event._index
          - 'relay_' + this.type
        event._id
          - from this.idPath
        Each type gets its own index.
        event.relay_actor
          - from this.actorPath
          - Should be normalize for cross-index search
        event.relay_scores
          - [] by default
          - {name: 'issueComment', score: 0.33}

        When to score & write an event:
          Phase 1:
          - Has: id, actor and index
          - Does not exist, need to run head first
          Phase 2:
          - Actor exists
      */

    };


  }
 };
