import './App.css';

import { useState } from 'react';

import { CompatibilityAlert, ConfirmDeleteModal, MapDisplay, Menu, SaveStatus } from './components';

export const App: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <CompatibilityAlert />
            <div style={{ display: 'grid', gap: 16 }}>
                <Menu onDelete={() => setIsModalOpen(true)} />
                <SaveStatus />
            </div>
            <div>
                <MapDisplay />
            </div>
            <ConfirmDeleteModal isModalOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </>
    );
};
