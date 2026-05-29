import { Button, Checkbox, Collapse, FormControlLabel, Slider, TextField, Tooltip } from '@mui/material';
import { useMemo, useState } from 'react';

import { useAppContext } from '../hooks';
import { isPointSelected } from '../utils';

interface MenuProps {
    onDelete?: () => void;
}

export const Menu: React.FC<MenuProps> = (props) => {
    const { onDelete } = props;

    const {
        actions: { loadMapData, setZoomLevel, toggleMap, setIsSafeHouseProtectionEnabled, setSafeHousePadding },
        state: {
            isMapDisplayed,
            isSelectionInverted,
            mapData,
            selection,
            zoomLevel,
            isSafeHouseProtectionEnabled,
            excludedRegions,
            safeHousePadding
        }
    } = useAppContext();

    const [showInfo, setShowInfo] = useState(false); // Default OFF

    const filesToDelete = useMemo(() => {
        if (!selection) {
            return 0;
        }
        return mapData.filter((point) => isPointSelected(point, selection, isSelectionInverted, excludedRegions)).length;
    }, [mapData, selection, isSelectionInverted, excludedRegions]);

    return (
        <div className="menu-container">
            {/* Main Actions */}
            <div className="menu-row">
                <Button
                    className="btn-primary"
                    variant="contained"
                    onClick={() => loadMapData()}
                >
                    📂 Cargar Partida
                </Button>

                {filesToDelete > 0 ? (
                    <Button
                        className="btn-danger"
                        variant="contained"
                        onClick={() => onDelete?.()}
                    >
                        🗑️ Eliminar {filesToDelete} celdas
                    </Button>
                ) : (
                    <span className="no-selection">Sin celdas seleccionadas</span>
                )}
            </div>

            {/* Options Row */}
            <div className="menu-row options-row">
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={isMapDisplayed}
                            onChange={(_, value) => toggleMap(value)}
                            size="small"
                        />
                    }
                    label="🗺️ Mostrar Mapa"
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={isSafeHouseProtectionEnabled}
                            onChange={(_, value) => setIsSafeHouseProtectionEnabled(value)}
                            size="small"
                        />
                    }
                    label="🛡️ Proteger Refugios"
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={showInfo}
                            onChange={(_, value) => setShowInfo(value)}
                            size="small"
                        />
                    }
                    label="📖 Mostrar Guía"
                />

                <Tooltip title={`Zoom actual: ${Math.round(zoomLevel * 100)}%`}>
                    <div className="zoom-display">
                        🔍 {Math.round(zoomLevel * 100)}%
                    </div>
                </Tooltip>
            </div>

            {/* Safehouse Padding Slider */}
            <Collapse in={isSafeHouseProtectionEnabled}>
                <div className="padding-control">
                    <span className="padding-label">
                        🛡️ Relleno de seguridad:
                    </span>
                    <Slider
                        value={safeHousePadding}
                        onChange={(_, value) => setSafeHousePadding(value as number)}
                        min={0}
                        max={20}
                        step={1}
                        valueLabelDisplay="auto"
                        sx={{ width: 200, mx: 3 }}
                    />
                    <TextField
                        type="number"
                        value={safeHousePadding}
                        onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 0) setSafeHousePadding(val);
                        }}
                        size="small"
                        sx={{ width: 70 }}
                        inputProps={{ min: 0, max: 50 }}
                    />
                    <span className="padding-hint">celdas extra</span>
                </div>
            </Collapse>

            {/* Guide */}
            <Collapse in={showInfo}>
                <div className="guide-box">
                    <div className="guide-grid">
                        <div className="guide-card">
                            <div className="guide-icon">📂</div>
                            <div className="guide-text">
                                <strong>Cargar Partida</strong>
                                Busca tu carpeta en: <code>Users\TuNombre\Zomboid\Saves</code>
                            </div>
                        </div>
                        <div className="guide-card">
                            <div className="guide-icon">🖱️</div>
                            <div className="guide-text">
                                <strong>Seleccionar</strong>
                                Arrastra el ratón para marcar zonas rojas a eliminar.
                            </div>
                        </div>
                        <div className="guide-card">
                            <div className="guide-icon">🔄</div>
                            <div className="guide-text">
                                <strong>Invertir</strong>
                                Mantén <code>Ctrl</code> mientras arrastras para desmarcar.
                            </div>
                        </div>
                        <div className="guide-card">
                            <div className="guide-icon">🔍</div>
                            <div className="guide-text">
                                <strong>Navegar</strong>
                                Usa la rueda del ratón para acercar y alejar el mapa.
                            </div>
                        </div>
                        <div className="guide-card">
                            <div className="guide-icon">📋</div>
                            <div className="guide-text">
                                <strong>Copiar Coordenadas</strong>
                                Presiona <code>Ctrl+C</code> para copiar las coordenadas actuales.
                            </div>
                        </div>
                    </div>
                </div>
            </Collapse>
        </div>
    );
};
