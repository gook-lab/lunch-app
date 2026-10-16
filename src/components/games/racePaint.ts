const PAINT_INTERVAL_MS = 1000 / 30;

export function shouldPaintRaceFrame(now: number, lastPaint: number, finalFrame: boolean): boolean {
  return finalFrame || now - lastPaint >= PAINT_INTERVAL_MS;
}
