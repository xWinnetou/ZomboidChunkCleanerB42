import { Alert, Link } from '@mui/material';
import React, { useEffect, useState } from 'react';

export const CompatibilityAlert: React.FC = () => {
    const [showError, setShowError] = useState(false);
    useEffect(() => {
        const isSupported = !!window.showDirectoryPicker;
        setShowError(!isSupported);
    }, []);
    if (!showError) {
        return null;
    }
    return (
        <Alert severity="error" sx={{ maxWidth: 800 }}>
            Esta herramienta requiere un navegador compatible con <code>window.showDirectoryPicker</code>.{' '}
            Por favor, usa <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong>.{' '}
            <Link href="https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker#browser_compatibility">
                Ver compatibilidad en MDN
            </Link>
        </Alert>
    );
};
