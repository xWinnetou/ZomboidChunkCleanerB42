import { Paper } from '@mui/material';
import { useEffect, useMemo, useRef } from 'react';

import { MAP_PADDING } from '../constants';
import { useAppContext } from '../hooks';
import type { Coordinate, Region } from '../types';
import { expandRegion, isChildOf, isPointSelected } from '../utils';

enum Colors {
    SAFE_HOUSE = 'hsla(30, 100%, 50%, 0.3)', // Orange transparent fill
    SAFE_HOUSE_BORDER = 'hsla(30, 100%, 50%, 1)', // Solid Orange Border for safehouse
    SAFE_HOUSE_SURROUNDING = 'hsla(0, 100%, 50%, 0.1)', // Very light red for padding fill
    SAFE_HOUSE_PADDING_BORDER = 'hsla(0, 100%, 50%, 1)', // Solid Red Border for padding
    DELETE = 'hsla(0, 100%, 76%, 70%)',
    DEFAULT = 'hsla(41, 49%, 76%, 70%)',
    TEXT_BACKGROUND = 'rgba(0, 0, 0, 0.7)',
    TEXT_COLOR = '#fff'
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
    const mapCanvasRef = useRef<HTMLCanvasElement>(null);
    const selectionCanvasRef = useRef<HTMLCanvasElement>(null);

    // Calculate map tiles to display
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

        const tiles = [];
        for (let y = Math.floor(minY / 100); y <= Math.floor(maxY / 100); y++) {
            for (let x = Math.floor(minX / 100); x <= Math.floor(maxX / 100); x++) {
                tiles.push(`${x}_${y}`);
            }
        }

        const columnCount = Math.floor(maxX / 100) - Math.floor(minX / 100) + 1;

        return {
            maxX,
            maxY,
            minX,
            minY,
            tiles,
            columnCount
        };
    }, [mapData]);

    // Redraw chunks when map data or selection changes
    useEffect(() => {
        const mapCanvas = mapCanvasRef.current;
        const selectionCanvas = selectionCanvasRef.current;
        if (!mapCanvas || !selectionCanvas) {
            return;
        }

        const context = mapCanvas.getContext('2d');
        if (!context) {
            return;
        }

        const { maxX, maxY, minX, minY } = tileInfo;

        const canvasWidth = Math.max(1, (maxX - minX) * zoomLevel);
        const canvasHeight = Math.max(1, (maxY - minY) * zoomLevel);

        selectionCanvas.width = mapCanvas.width = canvasWidth;
        selectionCanvas.height = mapCanvas.height = canvasHeight;

        context.fillStyle = 'hsla(0, 0%, 10%, 0)';
        context.fillRect(0, 0, canvasWidth, canvasHeight);

        const fillRect = (x: number, y: number, w: number, h: number) => {
            context.fillRect((x - minX) * zoomLevel, (y - minY) * zoomLevel, w * zoomLevel, h * zoomLevel);
        };
        const fillRectRegion = (region: Region) => {
            const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = region;
            fillRect(x1, y1, x2 - x1, y2 - y1);
        };
        const writeTextAboveRegion = (region: Region, text: string) => {
            const { width: textWidth, ...rest } = context.measureText(text);

            const [{ x: x1, y: y1 }, { x: x2 }] = region;

            const w = x2 - x1;
            const x = x1 + w / 2 - textWidth / zoomLevel / 2;
            const padding = 4;
            const lineHeight = 8;
            const y = y1;
            const offsetY = -8;

            context.fillStyle = Colors.TEXT_BACKGROUND;
            context.fillRect(
                (x - minX) * zoomLevel - padding,
                (y - minY) * zoomLevel - lineHeight - padding + offsetY,
                textWidth + padding * 2,
                lineHeight + padding * 2
            );

            context.fillStyle = Colors.TEXT_COLOR;
            context.fillText(text, (x - minX) * zoomLevel, (y - minY) * zoomLevel + offsetY);
        };

        // Draw generated chunks
        for (const point of mapData) {
            const isSelected = selection && isPointSelected(point, selection, isSelectionInverted, excludedRegions);
            context.fillStyle = isSelected ? Colors.DELETE : Colors.DEFAULT;
            fillRect(point.x, point.y, 1, 1);
        }

        if (isSafeHouseProtectionEnabled) {
            // Draw safe houses
            for (const safeHouse of safeHouses) {
                const { region, owner, title } = safeHouse;

                // Draw Padding Area (red border)
                const expandedRegion = expandRegion(region, safeHousePadding);
                context.fillStyle = Colors.SAFE_HOUSE_SURROUNDING;
                fillRectRegion(expandedRegion);

                // Draw Padding Border (red)
                context.strokeStyle = Colors.SAFE_HOUSE_PADDING_BORDER;
                context.lineWidth = 2;
                const [{ x: px1, y: py1 }, { x: px2, y: py2 }] = expandedRegion;
                context.strokeRect((px1 - minX) * zoomLevel, (py1 - minY) * zoomLevel, (px2 - px1) * zoomLevel, (py2 - py1) * zoomLevel);

                // Draw Safehouse Area
                context.fillStyle = Colors.SAFE_HOUSE;
                fillRectRegion(region);

                // Draw Safehouse Border
                context.strokeStyle = Colors.SAFE_HOUSE_BORDER;
                context.lineWidth = 2;
                const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = region;
                context.strokeRect((x1 - minX) * zoomLevel, (y1 - minY) * zoomLevel, (x2 - x1) * zoomLevel, (y2 - y1) * zoomLevel);

                // Draw Title (use parsed title, not generic)
                writeTextAboveRegion(region, title || `${owner}'s safehouse`);
            }
        }
    }, [
        mapData,
        tileInfo,
        isSafeHouseProtectionEnabled,
        safeHousePadding,
        safeHouses,
        selection,
        isSelectionInverted,
        zoomLevel,
        excludedRegions
    ]);

    // Draw pending selection over map canvas
    useEffect(() => {
        const canvas = selectionCanvasRef.current;
        if (!canvas) {
            return;
        }

        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        let mousePos: Coordinate = { x: 0, y: 0 };
        let selectionStart: Coordinate | undefined;
        let isSelectionInverted: boolean;

        const { minX: offsetX, minY: offsetY } = tileInfo;

        const getMousePosition = (e: MouseEvent): Coordinate => {
            if (!mapCanvasRef.current) return { x: 0, y: 0 };

            const rect = mapCanvasRef.current.getBoundingClientRect();
            // Calculate absolute position relative to canvas
            const scaleX = mapCanvasRef.current.width / rect.width;
            const scaleY = mapCanvasRef.current.height / rect.height;

            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            // Adjust to map coordinates
            const mapX = (x / zoomLevel) + offsetX;
            const mapY = (y / zoomLevel) + offsetY;

            return { x: mapX, y: mapY };
        };

        const draw = () => {
            const mouseX = mousePos.x;
            const mouseY = mousePos.y;

            context.clearRect(0, 0, canvas.width, canvas.height);

            if (selectionStart) {
                const selectionX = selectionStart.x;
                const selectionY = selectionStart.y;

                const rectX = (selectionX - offsetX) * zoomLevel;
                const rectY = (selectionY - offsetY) * zoomLevel;
                const rectWidth = (mouseX - selectionX) * zoomLevel;
                const rectHeight = (mouseY - selectionY) * zoomLevel;

                context.fillStyle = '#f664';
                if (isSelectionInverted) {
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.clearRect(rectX, rectY, rectWidth, rectHeight);
                } else {
                    context.fillRect(rectX, rectY, rectWidth, rectHeight);
                }

                context.strokeStyle = '#f66c';
                context.strokeRect(rectX, rectY, rectWidth, rectHeight);
            }

            // Draw real tile coordinates in top-left corner (B42: chunk × 8)
            const chunkX = Math.floor(mousePos.x);
            const chunkY = Math.floor(mousePos.y);
            const tileX = chunkX * 8;  // B42 uses 8x8 tile chunks
            const tileY = chunkY * 8;
            const text = `X: ${tileX}, Y: ${tileY}`;

            context.fillStyle = Colors.TEXT_BACKGROUND;
            const { width } = context.measureText(text);
            context.fillRect(0, 0, width + 12, 18);
            context.fillStyle = Colors.TEXT_COLOR;
            context.font = '12px Segoe UI';
            context.textBaseline = 'top';
            context.fillText(text, 4, 4);
        };

        const handleMouseMove = (e: MouseEvent) => {
            mousePos = getMousePosition(e);
            draw();
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
            isSelectionInverted = e.ctrlKey;
            unselectRegion();
            draw();
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (e.button !== 0) {
                return;
            }

            if (!selectionStart) {
                return;
            }

            e.preventDefault();

            const mouseX = mousePos.x;
            const mouseY = mousePos.y;
            const selectionX = selectionStart.x;
            const selectionY = selectionStart.y;

            const topLeft = {
                x: Math.min(mouseX, selectionX),
                y: Math.min(mouseY, selectionY)
            };
            const bottomRight = {
                x: Math.max(mouseX, selectionX),
                y: Math.max(mouseY, selectionY)
            };

            selectionStart = undefined;
            draw();
            selectRegion([topLeft, bottomRight], isSelectionInverted);
        };

        document.body.addEventListener('mousemove', handleMouseMove);
        document.body.addEventListener('mousedown', handleMouseDown);
        document.body.addEventListener('mouseup', handleMouseUp);

        // Mouse wheel zoom handler
        const handleWheel = (e: WheelEvent) => {
            if (!(e.target instanceof HTMLElement) || !mapRootRef.current || !isChildOf(e.target, mapRootRef.current)) {
                return;
            }
            e.preventDefault();

            const zoomLevels = [0.5, 1, 2, 4, 8];
            const currentIndex = zoomLevels.indexOf(zoomLevel);

            if (e.deltaY < 0 && currentIndex < zoomLevels.length - 1) {
                setZoomLevel(zoomLevels[currentIndex + 1]);
            } else if (e.deltaY > 0 && currentIndex > 0) {
                setZoomLevel(zoomLevels[currentIndex - 1]);
            }
        };

        // Ctrl+C to copy coordinates
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'c' && mousePos.x !== 0 && mousePos.y !== 0) {
                const chunkX = Math.floor(mousePos.x);
                const chunkY = Math.floor(mousePos.y);
                const tileX = chunkX * 8;
                const tileY = chunkY * 8;
                const coordText = `${tileX}, ${tileY}`;

                navigator.clipboard.writeText(coordText).then(() => {
                    // Show temporary notification
                    const notification = document.createElement('div');
                    notification.textContent = `📋 Coordenadas copiadas: ${coordText}`;
                    notification.style.cssText = `
                        position: fixed;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(76, 175, 80, 0.95);
                        color: white;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-family: Segoe UI, sans-serif;
                        font-weight: bold;
                        z-index: 9999;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        animation: fadeIn 0.2s ease;
                    `;
                    document.body.appendChild(notification);

                    setTimeout(() => {
                        notification.style.opacity = '0';
                        notification.style.transition = 'opacity 0.3s ease';
                        setTimeout(() => notification.remove(), 300);
                    }, 2000);
                }).catch(err => {
                    console.error('Error al copiar:', err);
                });
            }
        };

        mapRootRef.current?.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('keydown', handleKeyDown);

        draw();

        return () => {
            document.body.removeEventListener('mousemove', handleMouseMove);
            document.body.removeEventListener('mousedown', handleMouseDown);
            document.body.removeEventListener('mouseup', handleMouseUp);
            mapRootRef.current?.removeEventListener('wheel', handleWheel);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [tileInfo, selectRegion, unselectRegion, zoomLevel, setZoomLevel]);

    if (!mapData.length) {
        return null;
    }

    return (
        <Paper
            style={{
                padding: '1rem',
                userSelect: 'none'
            }}
        >
            <div
                ref={mapRootRef}
                style={{
                    display: mapData.length > 0 ? 'grid' : 'none',
                    contain: 'paint',
                    overflow: 'auto',
                    maxHeight: '80vh',
                    maxWidth: '80vw'
                }}
            >
                {isMapDisplayed && (
                    <div
                        style={{
                            width: zoomLevel * (tileInfo.maxX - tileInfo.minX),
                            height: zoomLevel * (tileInfo.maxY - tileInfo.minY),
                            overflow: 'hidden',
                            gridArea: '1 / 1',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            position: 'relative'
                        }}
                    >
                        {/* Single map image background - B42 */}
                        {/* Image: 19500x15600px, top-left at tile (95, 100) */}
                        {/* Scale: needs to match chunk coordinates. 
                            If image covers ~76 cells wide (19500px), and B42 uses 256 tiles/cell:
                            19500 / (76 * 256) ≈ 1 pixel per tile
                            Actually let's use: 19500 / (76 * 32 chunks * 8 tiles) ≈ 1px/tile
                            The image likely uses 1 pixel = 1 tile, so at zoom=1, we scale accordingly */}
                        <img
                            src="./assets/map_b42.png"
                            alt="B42 Map"
                            style={{
                                position: 'absolute',
                                // Map image offset - adjust these values to align the map:
                                // DECREASE first number = move RIGHT, INCREASE = move LEFT
                                // DECREASE second number = move DOWN, INCREASE = move UP
                                left: zoomLevel * ((0 / 8) - tileInfo.minX),
                                top: zoomLevel * ((0 / 8) - tileInfo.minY),
                                width: 19500 * (zoomLevel / 8),
                                height: 15600 * (zoomLevel / 8),
                                imageRendering: 'pixelated',
                                opacity: 0.8,
                                pointerEvents: 'none'
                            }}
                            loading="eager"
                        />
                    </div>
                )}
                <canvas
                    ref={mapCanvasRef}
                    style={{ zIndex: 1, gridArea: '1 / 1', backgroundColor: isMapDisplayed ? undefined : '#2a2a2a' }}
                ></canvas>
                <canvas ref={selectionCanvasRef} style={{ zIndex: 2, gridArea: '1 / 1' }}></canvas>
            </div>
        </Paper>
    );
};
