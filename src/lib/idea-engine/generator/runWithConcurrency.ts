import 'server-only';

export async function runWithConcurrency<T>(
	tasks: Array<() => Promise<T>>,
	limit: number,
): Promise<T[]> {
	if (tasks.length === 0) return [];

	const results = new Array<T>(tasks.length);
	let nextIndex = 0;
	const workerCount = Math.min(Math.max(1, limit), tasks.length);

	async function worker(): Promise<void> {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= tasks.length) return;
			results[index] = await tasks[index]();
		}
	}

	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}
