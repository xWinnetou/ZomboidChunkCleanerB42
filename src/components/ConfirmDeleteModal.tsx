import { Box, Button, Modal, Typography } from '@mui/material';
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
        state: { isSelectionInverted, mapData, selection, excludedRegions }
    } = useAppContext();

    const filesToDelete = useMemo(() => {
        if (!selection) {
            return 0;
        }
        return mapData.filter((point) => isPointSelected(point, selection, isSelectionInverted, excludedRegions)).length;
    }, [mapData, selection, isSelectionInverted]);

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
                    ¿Eliminar {filesToDelete} {filesToDelete === 1 ? 'celda' : 'celdas'}?
                </Typography>

                <Typography className="modal-warning">
                    Esta acción no se puede deshacer. Asegúrate de tener una copia de seguridad.
                </Typography>

                <div className="modal-actions">
                    <Button
                        className="btn-danger"
                        variant="contained"
                        onClick={() => {
                            if (!filesToDelete) {
                                onClose?.();
                                return;
                            }
                            deleteMapData();
                            onClose?.();
                        }}
                    >
                        Eliminar
                    </Button>
                    <Button
                        className="btn-secondary"
                        variant="outlined"
                        onClick={() => onClose?.()}
                    >
                        Cancelar
                    </Button>
                </div>
            </Box>
        </Modal>
    );
};
