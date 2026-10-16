export interface LadderGeometry {
  cameraWidth: number;
  cameraHeight: number;
  boardWidth: number;
  boardHeight: number;
  boardTop: number;
}

export function readLadderGeometry(camera: HTMLElement | null, board: HTMLElement | null): LadderGeometry | null {
  if (!camera || !board || camera.offsetWidth <= 0 || camera.offsetHeight <= 0) return null;
  return {
    cameraWidth: camera.offsetWidth,
    cameraHeight: camera.offsetHeight,
    boardWidth: board.offsetWidth,
    boardHeight: board.offsetHeight,
    boardTop: board.offsetTop,
  };
}
