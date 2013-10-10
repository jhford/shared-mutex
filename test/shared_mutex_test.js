'use strict';

var redis = require('redis');

suite('shared_mutex', function() {

  var subject = require('../shared_mutex');

  setup(function() {
    redis.createClient().flushall();
  });

  test('lock-success', function(done) {
    var id = 'mutex:testing1';
    subject.lock(null, id, null, function(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      done(err);
    });
  });

  test('unlock-success', function(done) {
    var id = 'mutex:testing';
    subject.lock(null, id, null, function(lockErr, lockData) {
      assert.ifError(lockErr);
      assert.equal(id, lockData);
      subject.unlock(null, lockData,
        function(unlockErr, unlockData) {
          assert.ifError(unlockErr);
          assert.equal(id, unlockData);
          done(unlockErr);
        }
        );
    });
  });

  test('actually-a-mutex', function(done) {
    var id = 'mutex:testing';
    subject.lock(null, id, null, function(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      subject.lock(null, id, null, function(err, data) {
        assert.ok(err);
        assert.ok(-1 != err.message.indexOf('Could not claim lock for'));
        done();
      });
    });
  });

  test('double-unlock', function(done) {
    var id = 'mutex:testing';
    subject.lock(null, id, null, function(lockErr, lockData) {
      assert.ifError(lockErr);
      assert.equal(id, lockData);
      subject.unlock(null, lockData,
        function(unlockErr, unlockData) {
          assert.ifError(unlockErr);
          assert.equal(id, unlockData);
          subject.unlock(null, unlockData, function(err, data) {
            assert.ifError(err);
            assert.equal(id, data);
            done(err);
          });
        }
        );
    });
  });

  test('unlock-notlocked', function(done) {
    var id = 'mutex:testing';
    subject.unlock(null, id, function(err, data) {
      assert.ifError(err);
      assert.equal(id, data);
      done(err);
    });
  });

  test('two-mutexs', function(done) {
    var id1 = 'mutex:testing1',
        id2 = 'mutex:testing2';

  subject.lock(null, id1, null, function(err1, data1) {
    assert.ifError(err1);
    assert.equal(id1, data1);
    subject.lock(null, id2, null, function(err2, data2) {
      assert.ifError(err2);
      assert.equal(id2, data2);
      assert.notEqual(data1, data2);
      done(err1 || err2);
    });
  });
  });

  // This test is pretty ugly because it uses setTimeout
  test('lock-with-timeout', function(done) {
    var id = 'mutex:testing',
        timeout = 1;

  subject.lock(null, id, timeout, function(err1, data1) {
    assert.ifError(err1);
    assert.equal(id, data1);
    function secondCallback(err2, data2) {
      assert.ifError(err2);
      assert.equal(id, data2);
      done(err2);
    }
    // Node doesn't guaruntee when the callback will happen,
    // but the timeout of 20ms is only needed to ensure that
    // there is > 1ms of overhead between two lock() calls
    setTimeout(subject.lock, timeout * 20, null, id, null, secondCallback);
  });

  });

  test('mutex-unlock-publishing', function(done) {
    var id = 'mutex:testing',
        desiredMessage = id + '_unlocked',
        receiver = redis.createClient(),
        unlockCount = 0;

  receiver.on('message', function(channel, message) {
    unlockCount++;
    assert.equal(desiredMessage, message);
    assert.equal(id, channel);
    if (unlockCount > 1) {
      receiver.end();
      done();
    }
  });

  receiver.subscribe(id);

  subject.lock(null, id, null, function(lockErr, lockData) {
    assert.ifError(lockErr);
    assert.equal(id, lockData);
    subject.unlock(null, lockData,
      function(unlockErr, unlockData) {
        assert.ifError(unlockErr);
        assert.equal(id, unlockData);
        subject.unlock(null, unlockData, function(err, data) {
          assert.ifError(err);
          assert.equal(id, data);
        });
      }
      );
  });
  });


});
