import 'server-only';

export type StrategyEngine = 'native' | 'make';

/** Default native once the generator ships. Set STRATEGY_ENGINE=make to roll back one release. */
export function resolveStrategyEngine(): StrategyEngine {
	const raw = process.env.STRATEGY_ENGINE?.trim().toLowerCase();
	if (raw === 'make') return 'make';
	return 'native';
}

export function isNativeStrategyEngine(): boolean {
	return resolveStrategyEngine() === 'native';
}
