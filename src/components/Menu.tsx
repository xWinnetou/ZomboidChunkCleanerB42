import { Button, Checkbox, Collapse, FormControlLabel, Slider, TextField, Tooltip } from '@mui/material';
import { useMemo, useState } from 'react';

import { useAppContext } from '../hooks';
import type { DeleteOptions } from '../types';
import { isPointSelected } from '../utils';

const DELETE_OPTION_LABELS: { key: keyof DeleteOptions; label: string; hint: string }[] = [
    {
        key: 'isoRegionData',
        label: '🌍 Datos de región',
        hint: 'isoregiondata/datachunk_X_Y.bin — se regeneran solos.'
    },
    {
        key: 'aggregates',
        label: '📦 Agregados de celda',
        hint: 'chunkdata/, apop/, metagrid/, zpop/ — sólo si la celda de 32x32 chunks se queda vacía entera.'
    },
    {
        key: 'vehicles',
        label: '🚗 Vehículos',
        hint: 'Borra de vehicles.db los vehículos que estén en los chunks eliminados. Deja una copia en vehicles.db.bak.'
    },
    {
        key: 'animals',
        label: '🐄 Animales errantes',
        hint:
            'Animales de map_animals.bin: la población que va suelta por el mapa, fuera de los chunks. ' +
            'Deja una copia en map_animals.bin.bak.'
    },
    {
        key: 'resetPopulation',
        label: '♻️ Repoblar zombis y animales',
        hint:
            'Los animales asentados y los zombis virtuales viven en apop/ y zpop/, por celda de 32x32 chunks ' +
            '(256x256 tiles), no dentro del chunk. Sin esto siguen ahí después del borrado. Se salta las celdas ' +
            'que tocan un refugio protegido, así que las bases no pierden su ganado.'
    },
    {
        key: 'corruptedChunks',
        label: '💥 Chunks corruptos',
        hint: 'Carpeta blam/: copias de chunks que fallaron el CRC, junto a sus ficheros _error.txt.'
    }
];

interface MenuProps {
    onDelete?: () => void;
}

export const Menu: React.FC<MenuProps> = (props) => {
    const { onDelete } = props;

    const {
        actions: { loadMapData, setZoomLevel, toggleMap, setIsSafeHouseProtectionEnabled, setSafeHousePadding, setDeleteOption },
        state: {
            deleteOptions,
            deleteProgress,
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

    const isDeleting = !!deleteProgress;

    return (
        <div className="menu-container">
            <div className="menu-row">
                <Button className="btn-primary" variant="contained" disabled={isDeleting} onClick={() => loadMapData()}>
                    📂 Cargar Partida
                </Button>

                {filesToDelete > 0 ? (
                    <Button className="btn-danger" variant="contained" disabled={isDeleting} onClick={() => onDelete?.()}>
                        🗑️ Eliminar {filesToDelete.toLocaleString('es-ES')} celdas
                    </Button>
                ) : (
                    <span className="no-selection">Sin celdas seleccionadas</span>
                )}
            </div>

            <div className="menu-row options-row">
                <FormControlLabel
                    control={<Checkbox checked={isMapDisplayed} onChange={(_, value) => toggleMap(value)} size="small" />}
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
                    control={<Checkbox checked={showInfo} onChange={(_, value) => setShowInfo(value)} size="small" />}
                    label="📖 Mostrar Guía"
                />

                <Tooltip title={`Zoom actual: ${Math.round(zoomLevel * 100)}%`}>
                    <div className="zoom-display">🔍 {Math.round(zoomLevel * 100)}%</div>
                </Tooltip>
            </div>

            <div className="menu-row options-row">
                <span className="padding-label">Además de los chunks, borrar:</span>
                {DELETE_OPTION_LABELS.map(({ key, label, hint }) => (
                    <Tooltip key={key} title={hint}>
                        <FormControlLabel
                            control={
                                <Checkbox checked={deleteOptions[key]} onChange={(_, value) => setDeleteOption(key, value)} size="small" />
                            }
                            label={label}
                        />
                    </Tooltip>
                ))}
            </div>

            <Collapse in={isSafeHouseProtectionEnabled}>
                <div className="padding-control">
                    <span className="padding-label">🛡️ Relleno de seguridad:</span>
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
                            if (!isNaN(val) && val >= 0) {
                                setSafeHousePadding(val);
                            }
                        }}
                        size="small"
                        sx={{ width: 70 }}
                        inputProps={{ min: 0, max: 50 }}
                    />
                    <span className="padding-hint">celdas extra</span>
                </div>
            </Collapse>

            <Collapse in={showInfo}>
                <div className="guide-box">
                    <div className="guide-grid">
                        <div className="guide-card">
                            <div className="guide-icon">📂</div>
                            <div className="guide-text">
                                <strong>Cargar Partida</strong>
                                Elige la carpeta de la partida, la que tiene dentro <code>map/</code> y <code>map_meta.bin</code>. En un
                                servidor: <code>Zomboid\Saves\Multiplayer\servertest</code>.
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
