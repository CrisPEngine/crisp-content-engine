'use client';

import { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';

interface FileUploadProps {
	onUpload: (urls: string[]) => void;
	acceptedTypes?: string[];
	maxFiles?: number;
	maxSizeMB?: number;
}

export function FileUpload({ onUpload, acceptedTypes = ['image/*', 'application/pdf'], maxFiles = 5, maxSizeMB = 10 }: FileUploadProps) {
	const [uploading, setUploading] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length === 0) return;

		if (files.length > maxFiles) {
			setError(`Maximum ${maxFiles} files allowed`);
			return;
		}

		// Validate file sizes
		for (const file of files) {
			if (file.size > maxSizeMB * 1024 * 1024) {
				setError(`File ${file.name} exceeds ${maxSizeMB}MB limit`);
				return;
			}
		}

		setUploading(true);
		setError(null);

		try {
			const urls = await uploadToCloudinary(files);
			setUploadedFiles(prev => [...prev, ...urls]);
			onUpload([...uploadedFiles, ...urls]);
		} catch (err: any) {
			setError(err.message || 'Upload failed');
		} finally {
			setUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	const uploadToCloudinary = async (files: File[]): Promise<string[]> => {
		const urls: string[] = [];
		const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dr75zvtso';
		const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

		for (const file of files) {
			try {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('upload_preset', uploadPreset);

				// Use appropriate endpoint based on file type
				const endpoint = file.type.startsWith('image/') 
					? `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
					: `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;

				const res = await fetch(endpoint, {
					method: 'POST',
					body: formData,
				});

				if (!res.ok) {
					const errorData = await res.json().catch(() => ({}));
					throw new Error(errorData.error?.message || `Failed to upload ${file.name}`);
				}

				const data = await res.json();
				urls.push(data.secure_url || data.url);
			} catch (err: any) {
				throw new Error(err.message || `Failed to upload ${file.name}`);
			}
		}

		return urls;
	};

	const removeFile = (index: number) => {
		const newFiles = uploadedFiles.filter((_, i) => i !== index);
		setUploadedFiles(newFiles);
		onUpload(newFiles);
	};

	return (
		<div className="space-y-3">
			<div
				onClick={() => !uploading && fileInputRef.current?.click()}
				className={`
					border-2 border-dashed rounded-xl2 p-6 text-center cursor-pointer transition
					${uploading 
						? 'border-edge/40 bg-surface/30 cursor-not-allowed' 
						: 'border-edge/60 bg-surface/20 hover:border-primary/40 hover:bg-surface/30'
					}
				`}
			>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept={acceptedTypes.join(',')}
					onChange={handleFileSelect}
					className="hidden"
					disabled={uploading}
				/>
				{uploading ? (
					<div className="flex flex-col items-center gap-2">
						<Loader2 className="w-8 h-8 text-primary animate-spin" />
						<p className="text-sm text-text-soft">Uploading...</p>
					</div>
				) : (
					<div className="flex flex-col items-center gap-2">
						<Upload className="w-8 h-8 text-text-soft" />
						<p className="text-sm text-text-soft">
							Click to upload or drag and drop
						</p>
						<p className="text-xs text-text-dim">
							PDF, PNG, JPG up to {maxSizeMB}MB (max {maxFiles} files)
						</p>
					</div>
				)}
			</div>

			{error && (
				<div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg p-3">
					{error}
				</div>
			)}

			{uploadedFiles.length > 0 && (
				<div className="space-y-2">
					<p className="text-sm text-text-soft">Uploaded files:</p>
					<div className="space-y-2">
						{uploadedFiles.map((url, index) => (
							<div key={index} className="flex items-center justify-between p-2 rounded-lg border border-edge/60 bg-surface/30">
								<a
									href={url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-primary hover:underline truncate flex-1"
								>
									{url.split('/').pop()}
								</a>
								<button
									type="button"
									onClick={() => removeFile(index)}
									className="ml-2 p-1 hover:bg-danger/10 rounded text-danger"
								>
									<X className="w-4 h-4" />
								</button>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

