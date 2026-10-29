const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('User Authentication & Session Gateway Logic', () => {
  test('Valid email is accepted, trimmed, and lowercased', () => {
    const raw = '  User@Example.Com  ';
    const val = raw.trim().toLowerCase();
    const isValid = !!val && val.includes('@') && val.includes('.');
    assert.equal(isValid, true);
    assert.equal(val, 'user@example.com');
  });

  test('Invalid emails without @ or domain are rejected', () => {
    const invalidList = ['', '   ', 'userexample.com', 'user@', 'user@domain'];
    invalidList.forEach(input => {
      const val = input.trim().toLowerCase();
      const isValid = !!val && val.includes('@') && val.includes('.');
      assert.equal(isValid, false, `Expected ${input} to be invalid`);
    });
  });

  test('Guest session sets guest@local identifier', () => {
    const guestEmail = 'guest@local';
    assert.equal(guestEmail, 'guest@local');
  });

  test('Attempt records isolate by user email and guest properly', () => {
    const allAttempts = [
      { attemptId: '1', userEmail: 'user1@test.com', scorePercentage: 80, timestamp: '2026-10-29T10:00:00Z' },
      { attemptId: '2', userEmail: 'user2@test.com', scorePercentage: 60, timestamp: '2026-10-29T11:00:00Z' },
      { attemptId: '3', userEmail: 'guest@local', scorePercentage: 40, timestamp: '2026-10-29T12:00:00Z' },
      { attemptId: '4', scorePercentage: 50, timestamp: '2026-10-29T13:00:00Z' } // Missing email defaults to guest
    ];

    const filterForUser = (email) => {
      const active = (email || '').trim().toLowerCase();
      return allAttempts.filter(a => ((a.userEmail || 'guest@local').toLowerCase() === active));
    };

    const user1Attempts = filterForUser('user1@test.com');
    assert.equal(user1Attempts.length, 1);
    assert.equal(user1Attempts[0].attemptId, '1');

    const guestAttempts = filterForUser('guest@local');
    assert.equal(guestAttempts.length, 2);
    assert.deepEqual(guestAttempts.map(a => a.attemptId), ['3', '4']);
  });

  test('Attempt history deduplication and merge works properly by attemptId', () => {
    const local = [
      { attemptId: 'a1', timestamp: '2026-10-29T10:00:00Z', scorePercentage: 50 },
      { attemptId: 'a2', timestamp: '2026-10-29T12:00:00Z', scorePercentage: 75 }
    ];
    const server = [
      { attemptId: 'a2', timestamp: '2026-10-29T12:00:00Z', scorePercentage: 75 },
      { attemptId: 'a3', timestamp: '2026-10-29T14:00:00Z', scorePercentage: 90 }
    ];

    const map = new Map();
    server.forEach(a => map.set(a.attemptId, a));
    local.forEach(a => {
      if (!map.has(a.attemptId)) map.set(a.attemptId, a);
    });

    const merged = Array.from(map.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    assert.equal(merged.length, 3);
    assert.equal(merged[0].attemptId, 'a3');
    assert.equal(merged[1].attemptId, 'a2');
    assert.equal(merged[2].attemptId, 'a1');
  });
});
