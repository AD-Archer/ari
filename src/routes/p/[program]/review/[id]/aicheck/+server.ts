import { error, type RequestHandler } from '@sveltejs/kit';
import { privateProvider } from '$private';

// the private module owns this endpoint: without it there is nothing here
const answer: RequestHandler = async (event) => {
	const response = await privateProvider.reviewEndpoint('aicheck', event);
	if (!response) throw error(404, 'Not Found');
	return response;
};

export const GET = answer;
export const POST = answer;
