'use strict';

let assert = require('assert');
let util = require('util');
let debug = require('debug')('shared_mutex');

/**
 * Helper function that creates a redis client compatible with this library.
 * if the opts.redisClient is provided, this function will instead adapt that
 * object to be an async client as required by this library
 *
 * NOTE: This function modifies the global prototype of the library imported
 * with require('redis') to add a series of ___Async methods.
 */
function redisClient(opts) {
  // We only want to require these here if we're creating a client, otherwise
  // we should just use the provided API client as it exists and is passed into
  // the library itself
  let redis = require('redis');
  let bluebird = require('bluebird');  
  let client;

  if (opts && opts.redisClient) {
    assert(Object.keys(opts).length === 1);
    client = opts.redisClient;
  } else {
    client = redis.createClient.apply(redis, opts);
  }
  bluebird.promisifyAll(redis.RedisClient.prototype);
  bluebird.promisifyAll(redis.Multi.prototype);
  return client;
}

class Mutex {
  // Arguments:
  //   * client: redis client with ___Async methods, see redisClient()
  //   * id: globally unique identifier for a Mutex.  This is used
  //     by all systems involved and should be deterministically created
  //     using the identifier of the resource being locked
  //   * timeout: timeout, in ms, for how long the mutex default 1h
  constructor(client, id, timeout = 1000 * 60 * 60) {
    assert(typeof client === 'object', 'must provide client client object');
    assert(typeof client.setAsync === 'function', 'Must provide a promise-async client client');
    assert(typeof id === 'string', 'mutex identifier must be a string');
    assert(typeof timeout === 'number', 'timeout value must be a number');
    this.client = client;
    this.id = id;
    this.timeout = timeout;
  }

  async lock() {
    let result = await this.client.setAsync(this.id, 1, 'NX', 'PX', this.timeout.toString(10));
    if (result === 'OK') {
      await this.client.publishAsync(this.id, 'locked');
      return;    
    }
    let err = new Error('Cannot lock a lock that is already locked');
    err.code = 'AlreadyLocked';
    throw err;
  }

  async isLocked() {
    let result = await this.client.existsAsync(this.id);
    if (result === 1) {
      return true;
    }
    return false;
  }

  async unlock() {
    await this.client.multi()
      .del(this.id)
      .publish(this.id, 'unlocked')
      .execAsync();
  }

}

module.exports = {
  redisClient,
  Mutex,
};
