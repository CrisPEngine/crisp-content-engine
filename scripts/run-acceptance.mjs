import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

function load(file, env) {
	let text = '';
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		return;
	}
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq < 1) continue;
		const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		if (value) env[key] = value;
	}
}

const env = { ...process.env };
load('.env.local', env);
load('.env.vercel.production', env);

const child = spawn('npx', ['--yes', 'tsx', '--tsconfig', 'tsconfig.json', 'scripts/folian-pilot-acceptance.ts', ...process.argv.slice(2)], {
	env,
	stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
