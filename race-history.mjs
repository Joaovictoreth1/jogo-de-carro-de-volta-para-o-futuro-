export const historyKey = 'sunset_delorean_recent_races_v1';
const limit = 5;

function normalizeRace(race) {
    if (!race || !Number.isSafeInteger(race.points) || race.points < 0
        || !Number.isSafeInteger(race.combo) || race.combo < 1
        || !Number.isSafeInteger(race.jumps) || race.jumps < 0) return null;
    const { points, combo, jumps } = race;
    return { points, combo, jumps };
}

export function readRaces(storage) {
    try {
        const raw = storage.getItem(historyKey);
        const records = raw === null ? [] : JSON.parse(raw);
        const races = Array.isArray(records)
            ? records.map(normalizeRace).filter(Boolean).slice(0, limit)
            : [];
        return { races, available: true };
    } catch (error) {
        return { races: [], available: error instanceof SyntaxError };
    }
}

export function addRace(races, input) {
    const race = normalizeRace(input);
    return race ? [race, ...races].slice(0, limit) : races;
}

export function saveRaces(storage, races) {
    try {
        storage.setItem(historyKey, JSON.stringify(races));
        return true;
    } catch {
        return false;
    }
}
