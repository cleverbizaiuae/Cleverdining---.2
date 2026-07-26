import assert from "node:assert/strict";
import {
  chooseConnect4CpuColumn,
  createConnect4Board,
  dropConnect4Piece,
  getConnect4ValidColumns,
  hasConnect4,
  type Connect4Board,
  type Connect4Player,
} from "../../src/lib/connect4Engine.ts";

const play = (
  board: Connect4Board,
  column: number,
  player: Connect4Player,
): Connect4Board => {
  const move = dropConnect4Piece(board, column, player);
  assert.ok(move, `expected a legal move in column ${column}`);
  return move.board;
};

let board = createConnect4Board();
board = play(board, 3, "red");
board = play(board, 3, "yellow");
assert.equal(board[5][3], "red");
assert.equal(board[4][3], "yellow");

for (let count = 2; count < 6; count += 1) {
  board = play(board, 3, count % 2 === 0 ? "red" : "yellow");
}
assert.equal(getConnect4ValidColumns(board).includes(3), false);
assert.equal(dropConnect4Piece(board, 3, "red"), null);

let winningBoard = createConnect4Board();
for (const column of [0, 1, 2]) winningBoard = play(winningBoard, column, "yellow");
assert.equal(chooseConnect4CpuColumn(winningBoard), 3);

let blockingBoard = createConnect4Board();
for (const column of [1, 2, 3]) blockingBoard = play(blockingBoard, column, "red");
assert.equal(chooseConnect4CpuColumn(blockingBoard), 4);

let verticalBoard = createConnect4Board();
for (let count = 0; count < 3; count += 1) verticalBoard = play(verticalBoard, 6, "red");
assert.equal(chooseConnect4CpuColumn(verticalBoard), 6);

let diagonalBoard = createConnect4Board();
diagonalBoard = play(diagonalBoard, 0, "red");
diagonalBoard = play(diagonalBoard, 1, "yellow");
diagonalBoard = play(diagonalBoard, 1, "red");
diagonalBoard = play(diagonalBoard, 2, "yellow");
diagonalBoard = play(diagonalBoard, 2, "yellow");
diagonalBoard = play(diagonalBoard, 2, "red");
diagonalBoard = play(diagonalBoard, 3, "yellow");
diagonalBoard = play(diagonalBoard, 3, "yellow");
diagonalBoard = play(diagonalBoard, 3, "yellow");
diagonalBoard = play(diagonalBoard, 3, "red");
assert.equal(hasConnect4(diagonalBoard, "red"), true);

assert.equal(chooseConnect4CpuColumn(createConnect4Board()), 3);

console.log("connect 4 engine checks passed");
