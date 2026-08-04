import { Paper } from '@mui/material';
import { useEffect, useMemo, useRef } from 'react';

import { MAP_PADDING, TILES_PER_CHUNK } from '../constants';
import { useAppContext } from '../hooks';
import type { Coordinate, Region } from '../types';
import { expandRegion, isChildOf, isPointSelected } from '../utils';

const MAP_IMAGE_WIDTH_TILES = 19500;
const MAP_IMAGE_HEIGHT_TILES = 15600;
const ZOOM_LEVELS = [0.5, 1, 2, 4, 8];

enum Colors {
    SAFE_HOUSE = 'hsla(30, 100%, 50%, 0.35)',
    SAFE_HOUSE_BORDER = 'hsla(30, 100%, 50%, 1)',
    SAFE_HOUSE_SURROUNDING = 'hsla(0, 100%, 50%, 0.15)',
    SAFE_HOUSE_PADDING_BORDER = 'hsla(0, 100%, 50%, 1)',
    DELETE = 'hsla(0, 100%, 76%, 70%)',
    DEFAULT = 'hsla(41, 49%, 76%, 70%)'
}

export const MapDisplay: React.FC = () => {
    const {
        actions: { selectRegion, unselectRegion, setZoomLevel },
        state: {
            excludedRegions,
            isMapDisplayed,
            isSafeHouseProtectionEnabled,
            isSelectionInverted,
            mapData,
            safeHouses,
            safeHousePadding,
            selection,
            zoomLevel
        }
    } = useAppContext();

    const mapRootRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const mapCanvasRef = useRef<HTMLCanvasElement>(null);
    const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
    const readoutRef = useRef<HTMLSpanElement>(null);

    const tileInfo = useMemo(() => {
        let maxX = 0;
        let maxY = 0;
        let minX = 20000;
        let minY = 20000;

        for (const { x, y } of mapData) {
            maxX = Math.max(x, maxX);
            maxY = Math.max(y, maxY);
            minX = Math.min(x, minX);
            minY = Math.min(y, minY);
        }

        maxX += MAP_PADDING;
        maxY += MAP_PADDING;
        minX -= MAP_PADDING;
        minY -= MAP_PADDING;

        return { maxX, maxY, minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }, [mapData]);

    useEffect(() => {
        const canvas = mapCanvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) {
            return;
        }

        const { minX, minY, width, height } = tileInfo;

        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);

        for (const point of mapData) {
            const isSelected = selection && isPointSelected(point, selection, isSelectionInverted, excludedRegions);
            context.fillStyle = isSelected ? Colors.DELETE : Colors.DEFAULT;
            context.fillRect(point.x - minX, point.y - minY, 1, 1);
        }

        if (isSafeHouseProtectionEnabled) {
            context.lineWidth = 1;
            for (const { region } of safeHouses) {
                const strokeRegion = (target: Region, fill: string, stroke: string) => {
                    const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = target;
                    context.fillStyle = fill;
                    context.fillRect(x1 - minX, y1 - minY, x2 - x1, y2 - y1);
                    context.strokeStyle = stroke;
                    context.strokeRect(x1 - minX, y1 - minY, x2 - x1, y2 - y1);
                };

                strokeRegion(expandRegion(region, safeHousePadding), Colors.SAFE_HOUSE_SURROUNDING, Colors.SAFE_HOUSE_PADDING_BORDER);
                strokeRegion(region, Colors.SAFE_HOUSE, Colors.SAFE_HOUSE_BORDER);
            }
        }
    }, [excludedRegions, isSafeHouseProtectionEnabled, isSelectionInverted, mapData, safeHousePadding, safeHouses, selection, tileInfo]);

    useEffect(() => {
        const canvas = selectionCanvasRef.current;
        const context = canvas?.getContext('2d');
        const surface = surfaceRef.current;
        if (!canvas || !context || !surface) {
            return;
        }

        const { minX, minY, width, height } = tileInfo;
        canvas.width = width;
        canvas.height = height;

        let mousePos: Coordinate = { x: 0, y: 0 };
        let selectionStart: Coordinate | undefined;
        let inverted = false;

        const getMousePosition = (e: MouseEvent): Coordinate => {
            const rect = surface.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) / zoomLevel + minX,
                y: (e.clientY - rect.top) / zoomLevel + minY
            };
        };

        const updateReadout = () => {
            if (readoutRef.current) {
                const tileX = Math.floor(mousePos.x) * TILES_PER_CHUNK;
                const tileY = Math.floor(mousePos.y) * TILES_PER_CHUNK;
                readoutRef.current.textContent = `X: ${tileX}, Y: ${tileY}`;
            }
        };

        const drawSelection = () => {
            context.clearRect(0, 0, width, height);
            if (!selectionStart) {
                return;
            }

            const x = selectionStart.x - minX;
            const y = selectionStart.y - minY;
            const w = mousePos.x - selectionStart.x;
            const h = mousePos.y - selectionStart.y;

            context.fillStyle = '#f664';
            if (inverted) {
                context.fillRect(0, 0, width, height);
                context.clearRect(x, y, w, h);
            } else {
                context.fillRect(x, y, w, h);
            }

            context.strokeStyle = '#f66c';
            context.lineWidth = 1;
            context.strokeRect(x, y, w, h);
        };

        const handleMouseMove = (e: MouseEvent) => {
            mousePos = getMousePosition(e);
            updateReadout();
            if (selectionStart) {
                drawSelection();
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) {
                return;
            }
            if (!(e.target instanceof HTMLElement) || !mapRootRef.current || !isChildOf(e.target, mapRootRef.current)) {
                return;
            }

            e.preventDefault();
            selectionStart = getMousePosition(e);
            inverted = e.ctrlKey;
            unselectRegion();
            drawSelection();
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (e.button !== 0 || !selectionStart) {
                return;
            }
            e.preventDefault();

            const topLeft = {
                x: Math.min(mousePos.x, selectionStart.x),
                y: Math.min(mousePos.y, selectionStart.y)
            };
            const bottomRight = {
                x: Math.max(mousePos.x, selectionStart.x),
                y: Math.max(mousePos.y, selectionStart.y)
            };

            selectionStart = undefined;
            drawSelection();
            selectRegion([topLeft, bottomRight], inverted);
        };

        const handleWheel = (e: WheelEvent) => {
            if (!(e.target instanceof HTMLElement) || !mapRootRef.current || !isChildOf(e.target, mapRootRef.current)) {
                return;
            }
            e.preventDefault();

            const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
            if (e.deltaY < 0 && currentIndex < ZOOM_LEVELS.length - 1) {
                setZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
            } else if (e.deltaY > 0 && currentIndex > 0) {
                setZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey || e.key !== 'c' || !readoutRef.current) {
                return;
            }
            const tileX = Math.floor(mousePos.x) * TILES_PER_CHUNK;
            const tileY = Math.floor(mousePos.y) * TILES_PER_CHUNK;
            navigator.clipboard.writeText(`${tileX}, ${tileY}`).catch(() => undefined);
        };

        const root = mapRootRef.current;
        document.body.addEventListener('mousemove', handleMouseMove);
        document.body.addEventListener('mousedown', handleMouseDown);
        document.body.addEventListener('mouseup', handleMouseUp);
        root?.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.removeEventListener('mousemove', handleMouseMove);
            document.body.removeEventListener('mousedown', handleMouseDown);
            document.body.removeEventListener('mouseup', handleMouseUp);
            root?.removeEventListener('wheel', handleWheel);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectRegion, setZoomLevel, tileInfo, unselectRegion, zoomLevel]);

    if (!mapData.length) {
        return null;
    }

    const { minX, minY, width, height } = tileInfo;

    return (
        <Paper style={{ padding: '1rem', userSelect: 'none' }}>
            <div className="map-frame">
                <div className="coord-readout">
                    <span ref={readoutRef}>X: 0, Y: 0</span>
                </div>
                <div
                    ref={mapRootRef}
                    style={{
                        contain: 'paint',
                        overflow: 'auto',
                        maxHeight: '80vh',
                        maxWidth: '80vw',
                        backgroundColor: '#2a2a2a'
                    }}
                >
                    <div ref={surfaceRef} style={{ position: 'relative', width: width * zoomLevel, height: height * zoomLevel }}>
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width,
                                height,
                                overflow: 'hidden',
                                transform: `scale(${zoomLevel})`,
                                transformOrigin: '0 0'
                            }}
                        >
                            {isMapDisplayed && (
                                <img
                                    src="./assets/map_b42.png"
                                    alt=""
                                    style={{
                                        position: 'absolute',
                                        left: -minX,
                                        top: -minY,
                                        width: MAP_IMAGE_WIDTH_TILES / TILES_PER_CHUNK,
                                        height: MAP_IMAGE_HEIGHT_TILES / TILES_PER_CHUNK,
                                        imageRendering: 'pixelated',
                                        opacity: 0.8,
                                        pointerEvents: 'none'
                                    }}
                                    decoding="async"
                                />
                            )}
                            <canvas ref={mapCanvasRef} style={{ position: 'absolute', top: 0, left: 0, imageRendering: 'pixelated' }} />
                            <canvas
                                ref={selectionCanvasRef}
                                style={{ position: 'absolute', top: 0, left: 0, imageRendering: 'pixelated' }}
                            />
                        </div>

                        {isSafeHouseProtectionEnabled &&
                            safeHouses.map(({ region, owner }, index) => (
                                <div
                                    key={`${owner}-${index}`}
                                    className="safehouse-label"
                                    style={{
                                        left: ((region[0].x + region[1].x) / 2 - minX) * zoomLevel,
                                        top: (region[0].y - minY) * zoomLevel - 18
                                    }}
                                >
                                    Refugio de {owner}
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </Paper>
    );
};
