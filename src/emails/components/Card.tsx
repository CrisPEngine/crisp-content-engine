import { ReactNode } from 'react';

interface EmailCardProps {
	children: ReactNode;
}

export function EmailCard({ children }: EmailCardProps) {
	return (
		<div style={cardStyle}>
			{children}
		</div>
	);
}

const cardStyle = {
	backgroundColor: '#1F2937',
	borderRadius: '8px',
	padding: '16px',
	margin: '16px 0',
	border: '1px solid #374151',
};


