/**
 * Push a sample multi-channel payload to MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL
 * so you can inspect the data shape in Make.
 *
 * Usage (from project root):
 *   MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL=https://hook.xxx.make.com/xxx node scripts/push-multi-channel-webhook-payload.js
 *
 * Or ensure .env.local contains MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL and run:
 *   node -r dotenv/config scripts/push-multi-channel-webhook-payload.js dotenv_config_path=.env.local
 * (requires: npm i -D dotenv)
 *
 * Or source .env.local first (e.g. export $(grep -v '^#' .env.local | xargs)) then run the script.
 */

const fs = require('fs');
const path = require('path');

// Load .env.local if present (simple parser: KEY=value, supports quoted values)
function loadEnvLocal() {
	const envPath = path.resolve(__dirname, '..', '.env.local');
	if (fs.existsSync(envPath)) {
		const content = fs.readFileSync(envPath, 'utf8');
		content.split('\n').forEach((line) => {
			const match = line.match(/^([^#=]+)=(.*)$/);
			if (match) {
				const key = match[1].trim();
				let val = match[2].trim();
				if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
					val = val.slice(1, -1);
				process.env[key] = val;
			}
		});
	}
}

loadEnvLocal();

const WEBHOOK_URL = process.env.MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL;
if (!WEBHOOK_URL) {
	console.error('Missing MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL. Set it in .env.local or pass it when running:');
	console.error('  MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL=https://hook.xxx.make.com/xxx node scripts/push-multi-channel-webhook-payload.js');
	process.exit(1);
}

const generation_job_id = 'test-job-' + Date.now();
const request_id = 'test-request-' + Date.now();
const user_id = '00000000-0000-0000-0000-000000000001';
const brand_profile_id = process.env.MULTI_CHANNEL_TEST_BRAND_PROFILE_ID || 'recJXC2YIEdUsl0DF';

const payload = {
	generation_job_id,
	request_id,
	user_id,
	brand_profile_id,
	channels: process.env.MULTI_CHANNEL_TEST_CHANNELS
		? JSON.parse(process.env.MULTI_CHANNEL_TEST_CHANNELS)
		: [
				{ platform: 'X', count: 3, keys: [`${generation_job_id}:X:1`, `${generation_job_id}:X:2`, `${generation_job_id}:X:3`] },
			],
	brand_voice_context: {
		client_name: 'Acme Corp',
		brand_type: 'company',
		timezone: 'UTC',
		website: 'https://acme.com',
		audience: 'B2B decision makers',
		value_props: 'Speed, reliability, support',
		offers: 'Enterprise plans, support',
		brand_tone: null,
		brand_keywords: 'innovation, growth',
		exclude_keywords: 'cheap, discount',
		content_rules: 'No politics. Fact-based.',
		voice_rules: 'Professional but approachable. Short sentences.',
		compliance_notes: null,
		language_region: 'US English',
		spelling_variant: null,
		posting_windows: null,
		platforms_requested: ['LinkedIn', 'X'],
		risk_tolerance: null,
		tone_avoid: null,
		personal_voice_traits: null,
		personal_content_style: null,
		brand_goals: 'Thought leadership',
		additional_info: '',
		preferred_image_source: '',
	},
	strategy_json: {
		content_pillars: ['Product updates', 'Tips'],
		content_mix: { educational: 60, promotional: 20, engagement: 20 },
		platform_cadence: [{ platform: 'LinkedIn', postsPerWeek: 3 }, { platform: 'X', postsPerWeek: 5 }],
	},
	strategy_summary: 'Focus on product updates and tips. 60% educational, 20% promotional, 20% engagement.',
	monthly_brief: null,
	previous_content_json: [
		{ platform: 'LinkedIn', hook: 'Last week we launched...', post_type: 'single', created_time: '2026-01-20T10:00:00.000Z' },
	],
	scheduling_context: {
		timezone: 'UTC',
		posting_windows: null,
		cadence_defaults: { LinkedIn: 3, X: 5, Instagram: 2, Facebook: 2, Blog: 1 },
		now_iso: new Date().toISOString(),
	},
	x_algo_digest: {
		version: '2026-01-21',
		bullets: [
			'Engagement signals matter most: replies, retweets, likes (in that order)',
			'Recency is critical: fresh content ranks higher',
			'Hook in first line determines scroll-stop rate',
		],
		guardrails: {
			do: ['Hook in the first line (first 140 chars decide whether users engage)', 'Use line breaks for skimmability'],
			dont: ["Use LinkedIn-style formal language", "Ignore the 280 character limit"],
		},
	},
	triggered_at: new Date().toISOString(),
};

async function main() {
	console.log('Sending payload to Make webhook...');
	console.log('URL:', WEBHOOK_URL.replace(/\/[^/]+\/[^/]+$/, '/...'));
	console.log('generation_job_id:', generation_job_id);
	console.log('channels:', payload.channels.map((c) => ({ platform: c.platform, count: c.count })));

	const headers = { 'Content-Type': 'application/json' };
	if (process.env.MAKE_API_KEY) headers['x-make-apikey'] = process.env.MAKE_API_KEY;

	const res = await fetch(WEBHOOK_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify(payload),
	});

	console.log('Response status:', res.status, res.statusText);
	const text = await res.text();
	if (text) console.log('Response body:', text.slice(0, 500) + (text.length > 500 ? '...' : ''));

	if (!res.ok) {
		console.error('Webhook returned error. Check Make scenario logs.');
		process.exit(1);
	}

	console.log('Done. Check your Make scenario to see the received data shape.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
