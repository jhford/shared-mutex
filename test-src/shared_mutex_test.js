'use strict';

var assert = require('assert');
var redis = require('redis');
var subject = require('../lib/shared_mutex');

suite('shared_mutex', function() {

  let m1;
  let m1_id = 'mutex1';
  let m2;
  let m2_id = 'mutex2';
  let client;

  before(() => {
    client = subject.redisClient();
  });

  beforeEach(async () => {
    await client.flushallAsync();
    m1 = new subject.Mutex(client, m1_id);
    m2 = new subject.Mutex(client, m2_id);
  });

  test('lock success', async () => {
    await m1.lock();
    let exists = await client.existsAsync(m1_id);
    assert(exists === 1);
  });

  test('unlock success', async () => {
    await m1.lock();
    let exists = await client.existsAsync(m1_id);
    assert(exists === 1);

    await m1.unlock();

    exists = await client.existsAsync(m1_id);
    assert(exists === 0);

  });

  test('mutexes are independent', async () => {
    await m1.lock();
    let exists = await client.existsAsync(m1_id);
    assert(exists === 1);

    await m2.lock();
    exists = await client.existsAsync(m2_id);
    assert(exists === 1);

    await m2.unlock();

    exists = await client.existsAsync(m1_id);
    assert(exists === 1);

    exists = await client.existsAsync(m2_id);
    assert(exists === 0);

  });

  test('cannot relock a locked mutex', async () => {
    await m1.lock();
    try {
      await m1.lock();
      return Promise.reject(new Error('was incorrectly able to double lock'));
    } catch (err) { }
  });
 
  test('double unlock is allowed', async () => {
    await m1.lock();
    await m1.unlock();
    await m1.unlock();
  }); 

  test('unlock called for id that does not exist', async () => {
    await m1.unlock();
  });

  test('lock times out', async () => {
    return new Promise(async (res, rej) => {
      let m3 = new subject.Mutex(client, 'mutex3', 5);
      await m3.lock();
      setTimeout(async () => {
        try {
          let exists = await client.existsAsync('mutex3');
          if (exists === 0) {
            res();
          } else {
            rej(new Error('mutex didnt timeout'));
          }
        } catch (err) {
          rej(err);
        }
      }, 200);
    });
  });

  test('lock publishes on lock', async () => {
    let sub = subject.redisClient();
    return new Promise(async (res, rej) => {
      sub.on('message', (channel, message) => {
        if (channel === m1_id && message === 'locked') {
          res();
        }
        sub.unsubscribe();
        sub.quit();
        rej(new Error('message and channel: ' + channel + ', ' + message));
      });
      await sub.subscribeAsync(m1_id);
      await m1.lock();
    });
  });
  
  test('lock does not publish if already locked', async () => {
    let sub = subject.redisClient();
    return new Promise(async (res, rej) => {
      // First, let's lock the mutex so that it's locked when we make the
      // attmpet after setting up the message handler
      await m1.lock();

      sub.on('message', (channel, message) => {
        sub.unsubscribe();
        sub.quit();
        rej(new Error('shouldnt be publishing!'));
      });

      await sub.subscribeAsync(m1_id);

      try {
        await m1.lock();
        rej(new Error('shouldnt reach here'));
      } catch (err) {
        setTimeout(res, 2000);
      }


    });
  });

});
