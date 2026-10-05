export interface DocField {
	name: string;
	type: string;
	requirement?: 'required' | 'oneOf';
	description: string;
}

export interface DocRow {
	name: string;
	description: string;
	code?: string;
	ok?: boolean;
	mono?: boolean;
}
