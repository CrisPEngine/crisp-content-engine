import { Link } from '@react-email/components';
import { ReactNode } from 'react';

interface EmailButtonProps {
	href: string;
	children: ReactNode;
	variant?: 'primary' | 'secondary';
}

export function EmailButton({ href, children, variant = 'primary' }: EmailButtonProps) {
	const style = variant === 'primary' ? primaryButtonStyle : secondaryButtonStyle;
	
	return (
		<Link href={href} style={style}>
			{children}
		</Link>
	);
}

const primaryButtonStyle = {
	display: 'inline-block',
	backgroundColor: '#39FF14',
	color: '#000000',
	textDecoration: 'none',
	padding: '14px 36px',
	borderRadius: '8px',
	fontWeight: '600',
	fontSize: '15px',
	margin: '16px 0',
};

const secondaryButtonStyle = {
	display: 'inline-block',
	color: '#39FF14',
	textDecoration: 'underline',
	padding: '8px 0',
	fontSize: '14px',
	margin: '8px 0',
};


