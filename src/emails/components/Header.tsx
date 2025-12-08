import { Img } from '@react-email/components';

export function EmailHeader() {
	return (
		<div style={headerStyle}>
			<Img
				src="https://res.cloudinary.com/dr75zvtso/image/upload/f_auto,q_auto,w_360/v1762325831/CrispContentEngineLogo_white_1200x627_ojrxn6.png"
				alt="CrisP Content Engine"
				width="180"
				height="94"
				style={logoStyle}
			/>
		</div>
	);
}

const headerStyle = {
	padding: '32px 24px 16px 24px',
	textAlign: 'center' as const,
};

const logoStyle = {
	marginBottom: '24px',
	border: 'none',
	display: 'block',
	margin: '0 auto',
};


