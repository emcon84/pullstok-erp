// src/components/ProductUpload.tsx
import React, { useState } from 'react';
import { useUploadProductsCsv } from '../../../hooks/useUploadProductCsv';
import { Button } from '../../button';


export const ModalContentUploadCsv: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const { submitUpload, loading, error, success } = useUploadProductsCsv();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setFile(event.target.files[0]);
        }
    };

    const handleUpload = () => {
        if (file) {
            submitUpload(file);
        }
    };

    return (
        <div className="p-4 flex-jc-ac">
            <input type="file" accept=".csv" onChange={handleFileChange}/>
            <Button 
                onClick={handleUpload} 
                disabled={loading || !file}
            >
                {loading ? 'Subiendo...' : 'Subir CSV'}
            </Button>

            {success && <p className="text-green-500 mt-2">Products uploaded successfully!</p>}
            {error && <p className="text-red-500 mt-2">Error uploading products</p>}
        </div>
    );
};


