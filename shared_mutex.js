'use strict';

var redis = require('redis'),
    util = require('util'),
    debug = require('debug')('shared_mutex');

/* Create a mutex which optionally has a timeout

   redisOpts: If this is a non-false value, it'll be passed
              to redis.createClient() as the arugment list
   id: This is the identifier of the mutex in the redis instance
   timeout: If this is non-false, it should be the number of ms
            that the mutex should last before it removes itself
   callback: This is a function that takes (err, key).  If there
             is an error setting the mutex to locked, including
             the mutex already being locked, it is non-false.
             If the lock is successfully obtained, the key
             argument is set to the redis key of the mutex
*/
function lock(redisOpts, id, timeout, callback) {
  var client = redis.createClient.apply(redis, redisOpts || []);
  debug('Locking %s', id);
  // NX: only set if the id doesn't exist
  // EX N: have the id timeout after N seconds
  var cmdArgs = [id, 1, 'NX'];
  if (timeout) {
    cmdArgs.push('PX', timeout.toString(10));
  }
  function redisSetCallback(err, data) {
    client.end();
    if (err) {
      debug('Error locking %s', id);
      return callback('Error locking ' + id);
    }
    if (data === 'OK') {
      debug('Locked %s', id);
      return callback(null, id);
    } else {
      debug('Could not claim lock for %s', id);
      return callback(new Error('Could not claim lock for ' + id));
    }
  }
  cmdArgs.push(redisSetCallback);
  client.set.apply(client, cmdArgs);
}

/* Ensure that a lock is released.  Acts the same if a mutex
   is released as it does if the mutex didn't exist

   redisOpts: If this is a non-false value, it'll be passed
              to redis.createClient() as the arugment list
   id: This is the identifier of the mutex in the redis instance
   callback: This is a function that takes (err, key).  If there
             is an error releasing the mutex, it is referenced by
             err.  Key is returned as the id of the mutex
*/
function unlock(redisOpts, id, callback) {
  var client = redis.createClient.apply(redis, redisOpts || []);
  client.get(id, function(err, data) {
    if (err) {
      return callback(new Error('Error fetching id for unlock: ' + err));
    }
    debug('Unlocking %s', id);
    client.del(id, function(err, data) {
      debug('Publishing unlock for %s', id);
      client.publish(id, id + '_unlocked');
      client.end();
      if (err) {
        return callback(new Error('Error deleting id for unlock: ' + err));
      }
      debug('Unlocked %s', id);
      return callback(null, id);
    });
  });
}

exports.lock = lock;
exports.unlock = unlock;
