import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addRace, readRaces, saveRaces } from './race-history.mjs';

const race = { points: 2120, combo: 3, jumps: 1 };

test('records only completed valid races, newest first, capped at five runs', () => {
    let runs = [];
    for (let points = 1; points <= 7; points++) runs = addRace(runs, { ...race, points });
    assert.deepEqual(runs.map(run => run.points), [7, 6, 5, 4, 3]);
    assert.equal(addRace(runs, { ...race, points: Infinity }), runs);
    assert.equal(addRace(runs, { ...race, combo: 0 }), runs);
});

test('restores only valid fields and ignores corrupted or inaccessible history', () => {
    const storage = {
        getItem: () => JSON.stringify([{ ...race, extra: true }, null, { ...race, jumps: -1 }]),
    };
    assert.deepEqual(readRaces(storage), { races: [race], available: true });
    assert.deepEqual(readRaces({ getItem: () => 'broken' }), { races: [], available: true });
    const unavailable = () => { throw new Error('denied'); };
    assert.deepEqual(readRaces({ getItem: unavailable }), { races: [], available: false });
    assert.equal(saveRaces({ setItem: unavailable }, [race]), false);
});

test('saves valid results for use on the next page load', () => {
    const values = new Map();
    const storage = {
        setItem: (key, value) => values.set(key, value),
        getItem: key => values.get(key) ?? null,
    };
    assert.deepEqual(readRaces(storage), { races: [], available: true });
    assert.equal(saveRaces(storage, [race]), true);
    assert.deepEqual(readRaces(storage), { races: [race], available: true });
});
