import { AirtableOperatorAdapter } from './airtable';
import { MakeOperatorAdapter } from './make';
import type { OperatorAdapters } from './types';

export function createDefaultOperatorAdapters(): OperatorAdapters {
	const airtable = new AirtableOperatorAdapter();
	return {
		brands: airtable,
		content: airtable,
		make: new MakeOperatorAdapter(),
	};
}

export type { OperatorAdapters } from './types';
