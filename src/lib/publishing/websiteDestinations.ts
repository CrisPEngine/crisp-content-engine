export function websitePublishingEnabled(): boolean {
	return process.env.CCE_WEBSITE_PUBLISH_ENABLED === 'true';
}
