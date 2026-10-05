export const allOrgPermissions = [
	'MANAGE_PROGRAMS',
	'MANAGE_PEOPLE',
	'GRANT_ORG_PERMS',
	'VIEW_WEBHOOK_LOGS',
	'MANAGE_MCP',
	'VIEW_ALL_PROGRAMS',
	'OPERATE_ALL_PROGRAMS',
	'CREATE_PROGRAMS'
] as const;

export interface SeedUser {
	id: string;
	name: string;
	email: string;
	color: string;
	admin?: boolean;
	namePending?: boolean;
}

export const seedUsers: SeedUser[] = [
	{
		id: 'seedUserAdmin',
		name: 'User 1',
		email: 'user1@example.com',
		color: '#ec3750',
		admin: true
	},
	{ id: 'seedUserPoc', name: 'User 2', email: 'user2@example.com', color: '#338eda' },
	{ id: 'seedUserSoftware', name: 'User 3', email: 'user3@example.com', color: '#33d6a6' },
	{ id: 'seedUserHardware', name: 'User 4', email: 'user4@example.com', color: '#ff8c37' },
	{ id: 'seedUserLead', name: 'User 5', email: 'user5@example.com', color: '#a633d6' },
	// the name is the email until the prompt is answered
	{
		id: 'seedUserPending',
		name: 'user6@example.com',
		email: 'user6@example.com',
		color: '#f1c40f',
		namePending: true
	}
];

export const seedMakers = [
	{ id: 'seedMakerRiley', name: 'Maker 1', email: 'maker1@example.com' },
	{ id: 'seedMakerNoor', name: 'Maker 2', email: 'maker2@example.com' },
	{ id: 'seedMakerTomas', name: 'Maker 3', email: 'maker3@example.com' },
	{ id: 'seedMakerIris', name: 'Maker 4', email: 'maker4@example.com' },
	{ id: 'seedMakerJun', name: 'Maker 5', email: 'maker5@example.com' },
	{ id: 'seedMakerMaya', name: 'Maker 6', email: 'maker6@example.com' },
	{ id: 'seedMakerOmar', name: 'Maker 7', email: 'maker7@example.com' },
	{ id: 'seedMakerPriya', name: 'Maker 8', email: 'maker8@example.com' },
	{ id: 'seedMakerLuca', name: 'Maker 9', email: 'maker9@example.com' },
	{ id: 'seedMakerZoe', name: 'Maker 10', email: 'maker10@example.com' },
	// shares an email with the hardware reviewer, to exercise the own-project exclusion
	{ id: 'seedMakerHana', name: 'User 4', email: 'user4@example.com' }
];

export const makerById = (makerId: string) => seedMakers.find((maker) => maker.id === makerId);
