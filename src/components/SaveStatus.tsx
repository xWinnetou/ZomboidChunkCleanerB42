import { Alert, AlertTitle, LinearProgress } from '@mui/material';

import { B42_WORLD_VERSION } from '../constants';
import { useAppContext } from '../hooks';

/** Avisos sobre la partida cargada: versión, fiabilidad de los refugios, errores. */
export const SaveStatus: React.FC = () => {
    const {
        state: {
            deleteProgress,
            deleteReport,
            isLoading,
            isSafeHouseProtectionEnabled,
            loadError,
            mapData,
            safeHouses,
            safeHouseScanMethod,
            safeHouseWarnings,
            worldVersion
        }
    } = useAppContext();

    return (
        <div style={{ display: 'grid', gap: 8, maxWidth: 900 }}>
            <Alert severity="warning">
                <AlertTitle>Antes de tocar nada</AlertTitle>
                Cierra el juego y para el servidor, y haz una copia de la carpeta de la partida. Si el servidor está encendido volverá a
                escribir los ficheros que borres y puede corromper la partida.
            </Alert>

            {isLoading && <LinearProgress />}

            {loadError && <Alert severity="error">{loadError}</Alert>}

            {worldVersion !== null && worldVersion !== B42_WORLD_VERSION && (
                <Alert severity="warning">
                    Versión de mundo <strong>{worldVersion}</strong>. Esta herramienta está verificada contra{' '}
                    <strong>{B42_WORLD_VERSION}</strong> (Build 42.20). Revisa los resultados con lupa.
                </Alert>
            )}

            {safeHouseScanMethod === 'structured' && safeHouseWarnings.length === 0 && (
                <Alert severity="success">
                    Refugios leídos de <code>map_meta.bin</code>: <strong>{safeHouses.length}</strong>
                    {mapData.length > 0 && <> · chunks en la partida: {mapData.length.toLocaleString('es-ES')}</>}
                </Alert>
            )}

            {safeHouseWarnings.map((warning, index) => (
                <Alert key={index} severity={safeHouseScanMethod === 'structured' ? 'warning' : 'error'}>
                    {warning}
                </Alert>
            ))}

            {safeHouseScanMethod === 'failed' && (
                <Alert severity="error">
                    <AlertTitle>Protección de refugios no disponible</AlertTitle>
                    No se han podido leer los refugios. Si borras ahora puedes cargarte bases de jugadores.
                </Alert>
            )}

            {!isSafeHouseProtectionEnabled && (
                <Alert severity="error">
                    Has desactivado la protección de refugios: se borrará también lo que haya dentro de las bases reclamadas.
                </Alert>
            )}

            {deleteProgress && (
                <Alert severity="info" icon={false}>
                    <AlertTitle>
                        {deleteProgress.phase} ({deleteProgress.current.toLocaleString('es-ES')} /{' '}
                        {deleteProgress.total.toLocaleString('es-ES')})
                    </AlertTitle>
                    <LinearProgress
                        variant={deleteProgress.total > 0 ? 'determinate' : 'indeterminate'}
                        value={deleteProgress.total > 0 ? (deleteProgress.current / deleteProgress.total) * 100 : 0}
                    />
                </Alert>
            )}

            {deleteReport && (
                <Alert severity={deleteReport.errors.length ? 'warning' : 'success'}>
                    <AlertTitle>Borrado terminado</AlertTitle>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                        <li>Chunks del mapa: {deleteReport.chunks.toLocaleString('es-ES')}</li>
                        <li>Datos de región: {deleteReport.isoRegionData.toLocaleString('es-ES')}</li>
                        <li>Agregados por celda: {deleteReport.aggregates.toLocaleString('es-ES')}</li>
                        <li>Chunks corruptos (blam): {deleteReport.corruptedChunks.toLocaleString('es-ES')}</li>
                        <li>
                            Vehículos:{' '}
                            {deleteReport.vehicles === null ? 'no se ha tocado vehicles.db' : deleteReport.vehicles.toLocaleString('es-ES')}
                        </li>
                        <li>
                            Animales:{' '}
                            {deleteReport.animals === null
                                ? 'no se ha tocado map_animals.bin'
                                : deleteReport.animals.toLocaleString('es-ES')}
                        </li>
                    </ul>
                    {deleteReport.errors.length > 0 && (
                        <>
                            <strong>{deleteReport.errors.length} errores</strong> (primeros 5):
                            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                                {deleteReport.errors.slice(0, 5).map((error, index) => (
                                    <li key={index}>{error}</li>
                                ))}
                            </ul>
                        </>
                    )}
                </Alert>
            )}
        </div>
    );
};
