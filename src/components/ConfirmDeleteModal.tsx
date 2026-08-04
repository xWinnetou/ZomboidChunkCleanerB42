import { Alert, Box, Button, Modal, Typography } from '@mui/material';
import { useMemo } from 'react';

import { useAppContext } from '../hooks';
import { isPointSelected } from '../utils';

interface ConfirmDeleteModalProps {
    isModalOpen?: boolean;
    onClose?: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = (props) => {
    const { isModalOpen = false, onClose } = props;

    const {
        actions: { deleteMapData },
        state: {
            deleteOptions,
            isSafeHouseProtectionEnabled,
            isSelectionInverted,
            mapData,
            safeHouses,
            safeHouseScanMethod,
            selection,
            excludedRegions
        }
    } = useAppContext();

    const filesToDelete = useMemo(() => {
        if (!selection) {
            return 0;
        }
        return mapData.filter((point) => isPointSelected(point, selection, isSelectionInverted, excludedRegions)).length;
    }, [mapData, selection, isSelectionInverted, excludedRegions]);

    const extras = [
        deleteOptions.isoRegionData && 'datos de región',
        deleteOptions.aggregates && 'agregados de celda',
        deleteOptions.vehicles && 'vehículos en esos chunks',
        deleteOptions.animals && 'animales errantes en esos chunks',
        deleteOptions.resetPopulation && 'repoblación de zombis y animales (celdas sin refugio)',
        deleteOptions.corruptedChunks && 'chunks corruptos (blam)'
    ].filter(Boolean) as string[];

    const isProtectionUnreliable = !isSafeHouseProtectionEnabled || safeHouseScanMethod !== 'structured';

    return (
        <Modal
            open={isModalOpen}
            onClose={() => onClose?.()}
            onMouseDownCapture={(e) => {
                e.nativeEvent.stopImmediatePropagation();
                e.nativeEvent.stopPropagation();
            }}
            onMouseUpCapture={(e) => {
                e.nativeEvent.stopImmediatePropagation();
                e.nativeEvent.stopPropagation();
            }}
        >
            <Box className="modal-box">
                <Typography variant="h6" className="modal-title">
                    ¿Eliminar {filesToDelete.toLocaleString('es-ES')} {filesToDelete === 1 ? 'celda' : 'celdas'}?
                </Typography>

                <Typography className="modal-warning">
                    Esta acción no se puede deshacer. Recuerda tener el servidor parado y una copia de seguridad.
                </Typography>

                <Typography sx={{ mb: 1 }}>
                    Se borrarán los chunks seleccionados{extras.length > 0 && <>, y además: {extras.join(', ')}</>}.
                </Typography>

                {isSafeHouseProtectionEnabled ? (
                    <Alert severity={safeHouseScanMethod === 'structured' ? 'info' : 'warning'} sx={{ mb: 2 }}>
                        Protegiendo <strong>{safeHouses.length}</strong> refugio(s)
                        {safeHouseScanMethod !== 'structured' && <> — detectados de forma aproximada, pueden faltar refugios.</>}
                    </Alert>
                ) : (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        La protección de refugios está <strong>desactivada</strong>. Se borrarán también las bases reclamadas por jugadores.
                    </Alert>
                )}

                <div className="modal-actions">
                    <Button
                        className="btn-danger"
                        variant="contained"
                        color={isProtectionUnreliable ? 'error' : undefined}
                        disabled={!filesToDelete}
                        onClick={() => {
                            deleteMapData();
                            onClose?.();
                        }}
                    >
                        Eliminar
                    </Button>
                    <Button className="btn-secondary" variant="outlined" onClick={() => onClose?.()}>
                        Cancelar
                    </Button>
                </div>
            </Box>
        </Modal>
    );
};
