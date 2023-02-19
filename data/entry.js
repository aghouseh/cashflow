import { PrismaClient } from '@prisma/client';
import formatDate from 'utils/formatDate';

const prisma = new PrismaClient({ log: ['query', 'info'] });

export async function getAllEntries() {
	return await prisma.entry.findMany();
}

export async function getEntryById(id) {
	return await prisma.entry.findFirst({
		where: {
			id: parseInt(id),
		},
	});
}

export async function getEntriesWithinRange(startDate, endDate) {
	return await prisma.event.findMany({
		where: {
			startDate: {
				gte: formatDate(startDate),
				lt: formatDate(endDate),
			},
		},
		include: {
			entry: true,
		},
	});
}
