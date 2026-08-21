import { describe, expect, it } from 'vitest';
import { readEtaAt, readEtaSeconds, readFeed, readTripId, toFeedEta } from './etaFeed';

describe('readTripId', () => {
  it('reads the shape most stops send', () => {
    expect(readTripId('[XS3H8][LA77N]1218_0_1_1800_1829_0_7')).toEqual({
      lineId: '1218',
      patternId: '1218_0_1',
      agencyPatternId: '[LA77N]1218_0_1',
    });
  });

  it('reads the shape with a pipe tail', () => {
    expect(readTripId('[0277F][BNA17]2753_0_1|150|3|1835')).toEqual({
      lineId: '2753',
      patternId: '2753_0_1',
      agencyPatternId: '[BNA17]2753_0_1',
    });
  });

  it('reads the shape with no agency at all', () => {
    expect(readTripId('4701_0_2|500|1645')).toEqual({
      lineId: '4701',
      patternId: '4701_0_2',
      agencyPatternId: '4701_0_2',
    });
  });

  it('takes the operator, not the first bracket, when both are there', () => {
    expect(readTripId('[XS3H8][LA77N]1218_0_1_1800')!.agencyPatternId).toBe('[LA77N]1218_0_1');
  });

  it('gives nothing for something it cannot read', () => {
    expect(readTripId('')).toBeNull();
    expect(readTripId(null)).toBeNull();
    expect(readTripId('1218')).toBeNull();
    expect(readTripId('[BNA17]nao_e_um_padrao')).toBeNull();
  });
});

describe('readEtaAt', () => {
  it('reads milliseconds sent as a number', () => {
    expect(readEtaAt(1787333886000)).toBe(1787333886);
  });

  it('reads milliseconds sent as a string', () => {
    expect(readEtaAt('1787333886000')).toBe(1787333886);
  });

  it('reads the timestamp some stops send as text', () => {
    expect(readEtaAt('2026-08-05 16:46:19.000')).toBe(Math.round(Date.parse('2026-08-05T16:46:19.000Z') / 1000));
  });

  it('gives nothing when there is no usable time', () => {
    expect(readEtaAt(undefined)).toBeNull();
    expect(readEtaAt('')).toBeNull();
    expect(readEtaAt('nao e uma data')).toBeNull();
  });
});

describe('toFeedEta', () => {
  const now = 1787333886;

  it('trusts the countdown over the timestamp', () => {
    const eta = toFeedEta({ trip_id: '[BNA17]2753_0_1|1', eta_seconds: 300, eta_at: '2026-08-05 16:46:19.000' }, now)!;

    expect(eta.estimatedArrivalUnix).toBe(now + 300);
  });

  it('falls back to the timestamp when there is no countdown', () => {
    const eta = toFeedEta({ trip_id: '[BNA17]2753_0_1|1', eta_at: (now + 120) * 1000 }, now)!;

    expect(eta.estimatedArrivalUnix).toBe(now + 120);
  });

  it('carries the vehicle across as text', () => {
    const eta = toFeedEta({ trip_id: '[BNA17]2753_0_1|1', vehicle_id: 1257, eta_seconds: 60 }, now)!;

    expect(eta.vehicleId).toBe('1257');
    expect(eta.lineId).toBe('2753');
  });

  it('refuses an entry it cannot place on a line', () => {
    expect(toFeedEta({ trip_id: 'lixo', eta_seconds: 60 }, now)).toBeNull();
  });

  it('refuses an entry with no time at all', () => {
    expect(toFeedEta({ trip_id: '[BNA17]2753_0_1|1' }, now)).toBeNull();
  });
});

describe('readEtaSeconds', () => {
  it('reads it as a number or as text', () => {
    expect(readEtaSeconds(288)).toBe(288);
    expect(readEtaSeconds('288')).toBe(288);
  });

  it('keeps a bus that is already late', () => {
    expect(readEtaSeconds(-60)).toBe(-60);
  });

  it('gives nothing when it is missing', () => {
    expect(readEtaSeconds(undefined)).toBeNull();
    expect(readEtaSeconds('')).toBeNull();
    expect(readEtaSeconds('tarde')).toBeNull();
  });
});

describe('readFeed', () => {
  const now = 1787333886;

  it('keeps a row whose timestamp is stale but whose countdown is live', () => {
    const feed = readFeed([
      { trip_id: '4701_0_2|500', eta_seconds: 400, eta_at: '2026-08-05 16:46:19.000' },
    ], now);

    expect(feed).toHaveLength(1);
    expect(feed[0].estimatedArrivalUnix).toBe(now + 400);
  });

  it('drops a row that is stale with no countdown to save it', () => {
    expect(readFeed([{ trip_id: '4701_0_2|500', eta_at: '2026-08-05 16:46:19.000' }], now)).toHaveLength(0);
  });

  it('keeps a bus that is a minute late rather than hiding it', () => {
    const feed = readFeed([{ trip_id: '[BNA17]2753_0_1|1', eta_seconds: -60 }], now);

    expect(feed).toHaveLength(1);
  });

  it('puts the next bus first', () => {
    const feed = readFeed([
      { trip_id: '[BNA17]2753_0_1|1', eta_seconds: 900 },
      { trip_id: '[BNA17]2754_0_1|1', eta_seconds: 120 },
    ], now);

    expect(feed.map(e => e.lineId)).toEqual(['2754', '2753']);
  });
});
