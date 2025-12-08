import {
	Body,
	Container,
	Head,
	Html,
	Preview,
} from '@react-email/components';
import { ReactNode } from 'react';

interface LayoutProps {
	children: ReactNode;
	preview?: string;
}

export function EmailLayout({ children, preview }: LayoutProps) {
	return (
		<Html>
			<Head />
			{preview && <Preview>{preview}</Preview>}
			<Body style={bodyStyle}>
				<Container style={containerStyle}>
					{children}
				</Container>
			</Body>
		</Html>
	);
}

const bodyStyle = {
	backgroundColor: '#0E0F11',
	color: '#E5E7EB',
	fontFamily: "'Inter', Arial, sans-serif",
	margin: '0',
	padding: '0',
};

const containerStyle = {
	backgroundColor: '#121417',
	borderRadius: '16px',
	border: '1px solid #1F2937',
	margin: '40px auto',
	maxWidth: '480px',
	padding: '0',
};


