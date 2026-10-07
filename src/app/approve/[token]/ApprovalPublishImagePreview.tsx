import type { ApprovalPublishImagePreview as Preview } from '@/lib/publish/approvalPublishImage';

export function ApprovalPublishImagePreview({ preview }: { preview: Preview }) {
	return (
		<figure className="card overflow-hidden p-3 space-y-2">
			<figcaption className="text-sm font-medium text-text-soft">{preview.label}</figcaption>
			<img
				src={preview.url}
				alt={preview.altText?.trim() || 'Preview of the image attached to this content'}
				loading="lazy"
				decoding="async"
				className="mx-auto w-full max-h-[min(70vh,520px)] rounded-xl object-contain bg-bg"
			/>
		</figure>
	);
}
