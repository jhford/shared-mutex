'use strict';

var redis = require('redis');

suite('shared_mutex', function() {

  var subject = require('../lib/shared_mutex');

  setup(function() {
    redis.createClient().flushall();
  });

  test('lock success', function(done) {
    var id = 'mutex:testing1';
    subject.lock(null, id, null, function(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      done(err);
    });
  });

  test('unlock success', function(done) {
    var id = 'mutex:testing';

    function unlock(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      done(err);
    }

    subject.lock(null, id, null, function(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      subject.unlock(null, data, unlock);
    });
  });

  test('mutex is actually a mutex', function(done) {
    var id = 'mutex:testing';

    function secondLock(err, data) {
      assert.ok(err);
      assert.ok(-1 !== err.message.indexOf('Could not claim lock for'));
      done();
    }

    subject.lock(null, id, null, function(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      subject.lock(null, id, null, secondLock);
    });
  });

  test('double unlock', function(done) {
    var id = 'mutex:testing';

    function firstUnlock(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      subject.unlock(null, data, secondUnlock);
    }

    function secondUnlock(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      done(err);
    }

    subject.lock(null, id, null, function(lockErr, lockData) {
      assert.ifError(lockErr);
      assert.equal(id, lockData);
      subject.unlock(null, lockData, firstUnlock);
    });
  });

  test('unlock called on non-locked lock', function(done) {
    var id = 'mutex:testing';
    subject.unlock(null, id, function(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      done(err);
    });
  });

  test('can lock two unrelated mutexs', function(done) {
    var id1 = 'mutex:testing1',
        id2 = 'mutex:testing2';

    function firstLock(err1, data1) {
      assert.ifError(err1);
      assert.equal(id1, data1);
      subject.lock(
        null,
        id2,
        null,
        function secondLock(err2, data2) {
          assert.ifError(err2);
          assert.equal(id2, data2);
          assert.notEqual(data1, data2);
          done(err1 || err2);
        });
    }

    subject.lock(null, id1, null, firstLock);
  });

  // This test is pretty ugly because it uses setTimeout
  test('lock expiration ', function(done) {
    var id = 'mutex:testing',
        timeout = 1;

    function firstTimeLocking(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      // Node doesn't guarantee when the callback will happen,
      // but the timeout of 20ms is only needed to ensure that
      // there is > 1ms of overhead between two lock() calls
      setTimeout(subject.lock, timeout * 20, null, id, null, secondTimeLocking);
    }

    function secondTimeLocking(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      done(err);
    }

    subject.lock(null, id, timeout, firstTimeLocking);
  });

  test('mutex publishing', function(done) {
    var id = 'mutex:testing',
        desiredMessage = id + '_unlocked',
        receiver = redis.createClient(),
        unlockCount = 0;

    function firstUnlock(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      subject.unlock(null, data, secondUnlock);
    }

    function secondUnlock(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
    }

    receiver.on('message', function(channel, message) {
      assert.equal(desiredMessage, message);
      assert.equal(id, channel);
      if (++unlockCount > 1) {
        receiver.end();
        done();
      }
    });

    receiver.subscribe(id);

    subject.lock(null, id, null, function(lockErr, lockData) {
      assert.ifError(lockErr);
      assert.equal(id, lockData);
      subject.unlock(null, lockData, firstUnlock);
    });
  });


});
