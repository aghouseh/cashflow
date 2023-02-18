import { describe, expect, it, test } from 'vitest';

import generateDaysInRange, { isEarlierDate, toDate } from './generateDaysInRange';

test('toDate returns a Date object', () => {
	expect(toDate('2023-02-13')).toBeInstanceOf(Date);
});

test('isEarlierDate validates correct date order', () => {
	expect(isEarlierDate('2023','2024')).toBeTruthy();
});

describe('generateDaysInRange returns correct dates', () => {
	const dates = generateDaysInRange('2023-01-01', '2023-01-03');
	it('creates the correct number of days', () => {
		expect(dates.length).toBe(3);
	});
	it('requires the start precede the end', () => {
		expect(() => generateDaysInRange('2023-01-03', '2023-01-02')).toThrowError();
	});
});

