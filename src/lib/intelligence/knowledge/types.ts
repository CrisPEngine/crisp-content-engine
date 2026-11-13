export const AVAILABILITY = [
	'available',
	'beta',
	'private_preview',
	'in_development',
	'planned',
	'deprecated',
	'discontinued',
	'unverified',
] as const;

export const VERIFICATION = [
	'verified',
	'unverified',
	'verification_required',
	'evidence_outdated',
	'disputed',
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY)[number];
export type VerificationStatus = (typeof VERIFICATION)[number];

export type KnowledgeProposal = {
	id: string;
	brandBrainId: string;
	sessionKey: string;
	recordType: 'source' | 'product' | 'capability' | 'claim';
	naturalKey: string;
	payload: Record<string, unknown>;
	status: 'proposed' | 'approved' | 'rejected' | 'deferred' | 'applied';
	appliedRecordId?: string | null;
};

export type StoredProduct = {
	id: string;
	name: string;
	description: string;
	category: string;
	availability: AvailabilityStatus;
	lifecycleStatus: string;
	commercialModel?: string | null;
	productUrl?: string | null;
};

export type StoredCapability = {
	id: string;
	productId?: string | null;
	name: string;
	description: string;
	userBenefit?: string | null;
	availability: AvailabilityStatus;
	verificationStatus: VerificationStatus;
	evidence?: string | null;
	evidenceUrl?: string | null;
	approvedLanguage?: string | null;
	limitations?: string | null;
	prohibitedClaims: string[];
	lastVerified?: string | null;
};

export type StoredClaim = {
	id: string;
	claimText: string;
	approvedWording?: string | null;
	verificationStatus: VerificationStatus;
	approvalStatus: string;
	prohibited: boolean;
	restrictions?: string | null;
};

export type StoredSource = {
	id: string;
	title: string;
	sourceType: string;
	url?: string | null;
	trust: string;
	reviewStatus: string;
	retrievedAt?: string | null;
};

export type KnowledgeSnapshot = {
	products: StoredProduct[];
	capabilities: StoredCapability[];
	claims: StoredClaim[];
	sources: StoredSource[];
	proposals: KnowledgeProposal[];
	available: boolean;
};
