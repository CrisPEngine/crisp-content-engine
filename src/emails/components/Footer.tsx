export function EmailFooter() {
	const currentYear = new Date().getFullYear();
	
	return (
		<div style={footerStyle}>
			<p style={footerTextStyle}>
				© {currentYear} CrisP Digital — All rights reserved.
				<br />
				Made with ⚡ in Dubai.
			</p>
		</div>
	);
}

const footerStyle = {
	padding: '24px',
	borderTop: '1px solid #1F2937',
	textAlign: 'center' as const,
};

const footerTextStyle = {
	color: '#6B7280',
	fontSize: '12px',
	lineHeight: '18px',
	margin: '0',
};


