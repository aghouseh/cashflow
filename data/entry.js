import { PrismaClient } from '@prisma/client';

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
