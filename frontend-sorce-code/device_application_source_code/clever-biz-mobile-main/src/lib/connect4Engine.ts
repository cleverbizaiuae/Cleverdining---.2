export const CONNECT4_ROWS = 6;
export const CONNECT4_COLUMNS = 7;

export type Connect4Piece = "red" | "yellow" | null;
export type Connect4Player = Exclude<Connect4Piece, null>;
export type Connect4Board = Connect4Piece[][];

type DropResult = {
  board: Connect4Board;
  row: number;
  column: number;
};

const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];
const WIN_SCORE = 1_000_000;

export const createConnect4Board = (): Connect4Board =>
  Array.from(
    { length: CONNECT4_ROWS },
    () => Array.from({ length: CONNECT4_COLUMNS }, () => null),
  );

export const getConnect4ValidColumns = (board: Connect4Board): number[] =>
  COLUMN_ORDER.filter((column) => !board[0]?.[column]);

export const dropConnect4Piece = (
  board: Connect4Board,
  column: number,
  player: Connect4Player,
): DropResult | null => {
  if (!Number.isInteger(column) || column < 0 || column >= CONNECT4_COLUMNS) return null;

  for (let row = CONNECT4_ROWS - 1; row >= 0; row -= 1) {
    if (!board[row]?.[column]) {
      const nextBoard = board.map((currentRow) => [...currentRow]);
      nextBoard[row][column] = player;
      return { board: nextBoard, row, column };
    }
  }

  return null;
};

export const hasConnect4 = (board: Connect4Board, player: Connect4Player): boolean => {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;

  for (let row = 0; row < CONNECT4_ROWS; row += 1) {
    for (let column = 0; column < CONNECT4_COLUMNS; column += 1) {
      if (board[row]?.[column] !== player) continue;
      for (const [rowStep, columnStep] of directions) {
        let connected = 1;
        for (let distance = 1; distance < 4; distance += 1) {
          const nextRow = row + rowStep * distance;
          const nextColumn = column + columnStep * distance;
          if (board[nextRow]?.[nextColumn] !== player) break;
          connected += 1;
        }
        if (connected === 4) return true;
      }
    }
  }

  return false;
};

const scoreWindow = (
  window: Connect4Piece[],
  cpu: Connect4Player,
  opponent: Connect4Player,
): number => {
  const cpuCount = window.filter((piece) => piece === cpu).length;
  const opponentCount = window.filter((piece) => piece === opponent).length;
  const emptyCount = window.filter((piece) => piece === null).length;

  if (cpuCount === 4) return 100_000;
  if (opponentCount === 4) return -100_000;
  if (cpuCount === 3 && emptyCount === 1) return 120;
  if (opponentCount === 3 && emptyCount === 1) return -140;
  if (cpuCount === 2 && emptyCount === 2) return 18;
  if (opponentCount === 2 && emptyCount === 2) return -22;
  return 0;
};

const scoreBoard = (
  board: Connect4Board,
  cpu: Connect4Player,
  opponent: Connect4Player,
): number => {
  let score = 0;

  for (let row = 0; row < CONNECT4_ROWS; row += 1) {
    if (board[row]?.[3] === cpu) score += 8;
    if (board[row]?.[3] === opponent) score -= 8;
  }

  for (let row = 0; row < CONNECT4_ROWS; row += 1) {
    for (let column = 0; column <= CONNECT4_COLUMNS - 4; column += 1) {
      score += scoreWindow(board[row].slice(column, column + 4), cpu, opponent);
    }
  }

  for (let column = 0; column < CONNECT4_COLUMNS; column += 1) {
    for (let row = 0; row <= CONNECT4_ROWS - 4; row += 1) {
      score += scoreWindow(
        [0, 1, 2, 3].map((offset) => board[row + offset][column]),
        cpu,
        opponent,
      );
    }
  }

  for (let row = 0; row <= CONNECT4_ROWS - 4; row += 1) {
    for (let column = 0; column <= CONNECT4_COLUMNS - 4; column += 1) {
      score += scoreWindow(
        [0, 1, 2, 3].map((offset) => board[row + offset][column + offset]),
        cpu,
        opponent,
      );
    }
  }

  for (let row = 0; row <= CONNECT4_ROWS - 4; row += 1) {
    for (let column = 3; column < CONNECT4_COLUMNS; column += 1) {
      score += scoreWindow(
        [0, 1, 2, 3].map((offset) => board[row + offset][column - offset]),
        cpu,
        opponent,
      );
    }
  }

  return score;
};

const minimax = (
  board: Connect4Board,
  depth: number,
  maximizing: boolean,
  cpu: Connect4Player,
  opponent: Connect4Player,
  alphaValue: number,
  betaValue: number,
): number => {
  if (hasConnect4(board, cpu)) return WIN_SCORE + depth;
  if (hasConnect4(board, opponent)) return -WIN_SCORE - depth;

  const validColumns = getConnect4ValidColumns(board);
  if (!validColumns.length) return 0;
  if (depth === 0) return scoreBoard(board, cpu, opponent);

  let alpha = alphaValue;
  let beta = betaValue;

  if (maximizing) {
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const column of validColumns) {
      const move = dropConnect4Piece(board, column, cpu);
      if (!move) continue;
      bestScore = Math.max(
        bestScore,
        minimax(move.board, depth - 1, false, cpu, opponent, alpha, beta),
      );
      alpha = Math.max(alpha, bestScore);
      if (alpha >= beta) break;
    }
    return bestScore;
  }

  let bestScore = Number.POSITIVE_INFINITY;
  for (const column of validColumns) {
    const move = dropConnect4Piece(board, column, opponent);
    if (!move) continue;
    bestScore = Math.min(
      bestScore,
      minimax(move.board, depth - 1, true, cpu, opponent, alpha, beta),
    );
    beta = Math.min(beta, bestScore);
    if (alpha >= beta) break;
  }
  return bestScore;
};

export const chooseConnect4CpuColumn = (
  board: Connect4Board,
  cpu: Connect4Player = "yellow",
  opponent: Connect4Player = "red",
  searchDepth = 5,
): number | null => {
  const validColumns = getConnect4ValidColumns(board);
  if (!validColumns.length) return null;

  for (const column of validColumns) {
    const move = dropConnect4Piece(board, column, cpu);
    if (move && hasConnect4(move.board, cpu)) return column;
  }

  for (const column of validColumns) {
    const move = dropConnect4Piece(board, column, opponent);
    if (move && hasConnect4(move.board, opponent)) return column;
  }

  let bestColumn = validColumns[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  const normalizedDepth = Math.max(1, Math.floor(searchDepth));

  for (const column of validColumns) {
    const move = dropConnect4Piece(board, column, cpu);
    if (!move) continue;
    const score = minimax(
      move.board,
      normalizedDepth - 1,
      false,
      cpu,
      opponent,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    if (score > bestScore) {
      bestScore = score;
      bestColumn = column;
    }
  }

  return bestColumn;
};
