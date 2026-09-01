import {
  QueueInteractionScore,
  WidgetLocation,
  renderWidget,
  usePlugin,
} from '@remnote/plugin-sdk';
import { Chess, Move, Square } from 'chess.js';
import { Component } from 'react';
import type { CSSProperties } from 'react';
import {
  CHESS_POWERUP_CODE,
  DEFAULT_FLASHCARD_DARK_SQUARE,
  DEFAULT_FLASHCARD_LIGHT_SQUARE,
  FLASHCARD_DARK_SQUARE_SETTING_ID,
  FLASHCARD_LIGHT_SQUARE_SETTING_ID,
  PGN_SLOT_CODE,
  PLAY_SIDE_SLOT_CODE,
  type PlaySide,
} from '../chessPlugin';
import '../style.css';
import '../index.css';

type PracticeLine = {
  pgn: string;
  startFen?: string;
  moves: Move[];
};

type DrillStatus = 'idle' | 'correct' | 'wrong' | 'complete';
type GradeOption = {
  label: string;
  score: QueueInteractionScore;
};
type FlashcardContext = Record<string, unknown>;
type ChessOpeningBoardState = {
  cardId?: string;
  error?: string;
  gradedCardId?: string;
  hintMove?: Move;
  line?: PracticeLine;
  darkSquareColor: string;
  lightSquareColor: string;
  missedMove?: Move;
  moveIndex: number;
  playSide: PlaySide;
  selected?: Square;
  status: DrillStatus;
  title?: string;
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
const gradeOptions: GradeOption[] = [
  { label: 'Again', score: QueueInteractionScore.AGAIN },
  { label: 'Hard', score: QueueInteractionScore.HARD },
  { label: 'Good', score: QueueInteractionScore.GOOD },
  { label: 'Easy', score: QueueInteractionScore.EASY },
];
const opponentReplyDelayMs = 200;
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

function unknownRichTextToPlainText(value: unknown): string {
  return textFromUnknown(value);
}

function textFromUnknown(value: unknown, seen = new WeakSet<object>()): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return '';

  if (Array.isArray(value)) {
    return value.map((part) => textFromUnknown(part, seen)).join('');
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '';
    seen.add(value);

    const record = value as Record<string, unknown>;
    if (record.i === 'i' || record.i === 'a' || record.i === 'p') return '';

    const directText = record.text ?? record._text ?? record.value ?? record.content ?? record.m;

    if (typeof directText === 'string') return directText;
    if (directText) return textFromUnknown(directText, seen);

    return Object.values(record)
      .map((part) => textFromUnknown(part, seen))
      .join('');
  }

  return '';
}

function getContextId(context: FlashcardContext | undefined, keys: string[]) {
  if (!context) return undefined;

  for (const key of keys) {
    const value = context[key];
    if (typeof value === 'string' && value) return value;
  }

  return undefined;
}

function playSideFromSlotValue(value: unknown): PlaySide | undefined {
  const text = unknownRichTextToPlainText(value).trim().toLowerCase();

  if (text === 'b' || text === 'black' || text.includes('play as black')) return 'b';
  if (text === 'w' || text === 'white' || text.includes('play as white')) return 'w';

  return undefined;
}

function validHexColor(value: unknown, fallback: string) {
  return typeof value === 'string' && hexColorPattern.test(value) ? value : fallback;
}

function pieceAssetPath(piece: { color: 'w' | 'b'; type: string }) {
  const colorName = piece.color === 'w' ? 'white' : 'black';
  const pieceNames: Record<string, string> = {
    b: 'Bishop',
    k: 'King',
    n: 'Knight',
    p: 'Pawn',
    q: 'Queen',
    r: 'Rook',
  };

  return `Own%20pieces/${pieceNames[piece.type]}%20${colorName}.svg`;
}

function squareCenterPercent(square: Square, playSide: PlaySide) {
  const file = square[0];
  const rank = square[1];
  const displayFiles = playSide === 'b' ? [...files].reverse() : files;
  const displayRanks = playSide === 'b' ? [...ranks].reverse() : ranks;

  return {
    x: (displayFiles.indexOf(file) + 0.5) * 100,
    y: (displayRanks.indexOf(rank) + 0.5) * 100,
  };
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="chess-opening-shell chess-opening-empty">
      <strong>Chess Opening</strong>
      <span>{message}</span>
    </div>
  );
}

function MoveArrow({ move, playSide }: { move: Move; playSide: PlaySide }) {
  const from = squareCenterPercent(move.from, playSide);
  const to = squareCenterPercent(move.to, playSide);
  const isKnightMove = move.piece === 'n';
  const bend =
    Math.abs(to.x - from.x) > Math.abs(to.y - from.y)
      ? { x: to.x, y: from.y }
      : { x: from.x, y: to.y };

  return (
    <svg className="chess-hint-arrow" viewBox="0 0 800 800" aria-hidden="true">
      <defs>
        <marker
          id="chess-hint-arrow-head"
          markerWidth="22"
          markerHeight="22"
          refX="20"
          refY="11"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 22 11 L 0 22 z" />
        </marker>
      </defs>
      {isKnightMove ? (
        <polyline
          points={`${from.x},${from.y} ${bend.x},${bend.y} ${to.x},${to.y}`}
          markerEnd="url(#chess-hint-arrow-head)"
        />
      ) : (
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#chess-hint-arrow-head)" />
      )}
      <circle cx={from.x} cy={from.y} r="13" />
    </svg>
  );
}

function withTimeout<T>(promise: Promise<T>, message: string, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function cleanPgn(raw: string): string {
  return raw
    .replace(/^pgn\s*[:=-]\s*/i, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\b(\d+)\.(?!\.)\s*/g, '$1. ')
    .replace(/\b(\d+)\.\.\.\s*/g, '$1... ')
    .trim();
}

function parseSanMoves(rawPgn: string): Move[] {
  const movetext = cleanPgn(rawPgn)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+\.(?:\.\.)?/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\b(?:1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');
  const tokens = movetext.split(/\s+/).filter(Boolean);
  const chess = new Chess();

  for (const token of tokens) {
    const move = token.replace(/[!?+#]+$/g, '');
    if (!move) continue;
    chess.move(move, { strict: false });
  }

  return chess.history({ verbose: true });
}

function parsePracticeLine(rawPgn: string): PracticeLine | undefined {
  const pgn = cleanPgn(rawPgn);
  if (!pgn) return undefined;

  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch {
    return parseSanPracticeLine(pgn);
  }

  const headers = chess.getHeaders();
  const moves = chess.history({ verbose: true });

  if (moves.length === 0) return parseSanPracticeLine(pgn);

  return {
    pgn,
    moves,
    startFen: headers.SetUp === '1' && headers.FEN ? headers.FEN : undefined,
  };
}

function parseSanPracticeLine(pgn: string): PracticeLine | undefined {
  const moves = parseSanMoves(pgn);
  if (moves.length === 0) return undefined;

  return {
    pgn,
    moves,
  };
}

function buildPosition(line: PracticeLine, moveIndex: number) {
  const chess = line.startFen ? new Chess(line.startFen) : new Chess();

  for (const move of line.moves.slice(0, moveIndex)) {
    chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || 'q',
    });
  }

  return chess;
}

function isSameMove(candidate: Move, expected: Move) {
  return (
    candidate.from === expected.from &&
    candidate.to === expected.to &&
    (candidate.promotion || 'q') === (expected.promotion || 'q')
  );
}

function nextPracticeMoveIndex(moves: Move[], startIndex: number, playSide: PlaySide) {
  for (let index = startIndex; index < moves.length; index += 1) {
    if (moves[index].color === playSide) return index;
  }

  return moves.length;
}

function previousPracticeMoveIndex(moves: Move[], startIndex: number, playSide: PlaySide) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (moves[index].color === playSide) return index;
  }

  return nextPracticeMoveIndex(moves, 0, playSide);
}

function practiceProgress(moves: Move[], moveIndex: number, playSide: PlaySide) {
  return moves.slice(0, moveIndex).filter((move) => move.color === playSide).length;
}

function practiceMoveTotal(moves: Move[], playSide: PlaySide) {
  return moves.filter((move) => move.color === playSide).length;
}

function statusText(status: DrillStatus, progress: number, total: number, playSide: PlaySide) {
  const sideName = playSide === 'w' ? 'White' : 'Black';
  if (status === 'complete') return `${progress} / ${total} ${sideName} moves`;
  if (status === 'wrong') return `${progress} / ${total} ${sideName} moves`;
  if (status === 'correct') return 'Correct.';
  return `${progress} / ${total} ${sideName} moves`;
}

class ChessOpeningBoard extends Component<{ plugin: ReturnType<typeof usePlugin> }, ChessOpeningBoardState> {
  private blackReplyTimeout?: ReturnType<typeof setTimeout>;
  private wrongMoveTimeout?: ReturnType<typeof setTimeout>;

  state: ChessOpeningBoardState = {
    darkSquareColor: DEFAULT_FLASHCARD_DARK_SQUARE,
    lightSquareColor: DEFAULT_FLASHCARD_LIGHT_SQUARE,
    moveIndex: 0,
    playSide: 'w',
    status: 'idle',
  };

  componentDidMount() {
    void this.loadLine();
  }

  componentWillUnmount() {
    this.clearBlackReplyTimeout();
    this.clearWrongMoveTimeout();
  }

  clearBlackReplyTimeout = () => {
    if (this.blackReplyTimeout) {
      clearTimeout(this.blackReplyTimeout);
      this.blackReplyTimeout = undefined;
    }
  };

  clearWrongMoveTimeout = () => {
    if (this.wrongMoveTimeout) {
      clearTimeout(this.wrongMoveTimeout);
      this.wrongMoveTimeout = undefined;
    }
  };

  loadLine = async () => {
    try {
      const context = (await withTimeout(
        this.props.plugin.widget.getWidgetContext<WidgetLocation.Flashcard>(),
        'Could not load this chess card.',
        1800
      )) as FlashcardContext;
      const [lightSquareSetting, darkSquareSetting] = await Promise.all([
        this.props.plugin.settings
          .getSetting<string>(FLASHCARD_LIGHT_SQUARE_SETTING_ID)
          .catch(() => DEFAULT_FLASHCARD_LIGHT_SQUARE),
        this.props.plugin.settings
          .getSetting<string>(FLASHCARD_DARK_SQUARE_SETTING_ID)
          .catch(() => DEFAULT_FLASHCARD_DARK_SQUARE),
      ]);
      const cardId = getContextId(context, ['cardId', 'cardID', 'card_id', 'card']);
      const remId = getContextId(context, ['remId', 'remID', 'rem_id', 'rem']);

      if (!remId) {
        this.setState({
          error: 'Could not load this chess card.',
        });
        return;
      }

      const candidate = await this.props.plugin.rem.findOne(remId);

      if (!candidate) {
        this.setState({
          cardId,
          error: 'Could not load this chess card.',
        });
        return;
      }

      const slotPgn = await candidate
        .getPowerupProperty(CHESS_POWERUP_CODE, PGN_SLOT_CODE)
        .catch(() => '');
      const slotPgnRichText = await candidate
        .getPowerupPropertyAsRichText(CHESS_POWERUP_CODE, PGN_SLOT_CODE)
        .catch(() => '');
      const slotPlaySide = await candidate
        .getPowerupProperty(CHESS_POWERUP_CODE, PLAY_SIDE_SLOT_CODE)
        .catch(() => '');
      const slotPlaySideRichText = await candidate
        .getPowerupPropertyAsRichText(CHESS_POWERUP_CODE, PLAY_SIDE_SLOT_CODE)
        .catch(() => '');
      const rawPgn = [slotPgn, slotPgnRichText]
        .map((value) => cleanPgn(unknownRichTextToPlainText(value)))
        .find((value) => value && parsePracticeLine(value));
      const line = rawPgn ? parsePracticeLine(rawPgn) : undefined;

      if (line) {
        const playSide = playSideFromSlotValue(slotPlaySide) || playSideFromSlotValue(slotPlaySideRichText) || 'w';
        const firstPracticeMoveIndex = nextPracticeMoveIndex(line.moves, 0, playSide);
        const title = unknownRichTextToPlainText(candidate.text).trim() || 'Chess Opening';
        this.setState({
          cardId,
          error: undefined,
          gradedCardId: undefined,
          line,
          hintMove: undefined,
          missedMove: undefined,
          darkSquareColor: validHexColor(darkSquareSetting, DEFAULT_FLASHCARD_DARK_SQUARE),
          lightSquareColor: validHexColor(lightSquareSetting, DEFAULT_FLASHCARD_LIGHT_SQUARE),
          moveIndex: firstPracticeMoveIndex,
          playSide,
          selected: undefined,
          status: firstPracticeMoveIndex === line.moves.length ? 'complete' : 'idle',
          title,
        });
        return;
      }

      this.setState({
        cardId,
        error: 'The PGN on this card could not be parsed.',
      });
    } catch {
      this.setState({
        error: 'Could not load this chess card.',
      });
    }
  };

  markLineComplete = () => {
    this.setState({ status: 'complete' });
  };

  gradeCard = async (score: QueueInteractionScore) => {
    const { cardId, gradedCardId } = this.state;
    if (cardId && gradedCardId !== cardId) {
      this.setState({ gradedCardId: cardId });
      await this.props.plugin.queue.rateCurrentCard(score);
    }
  };

  reset = () => {
    const { line, playSide } = this.state;
    this.clearBlackReplyTimeout();
    this.clearWrongMoveTimeout();
    this.setState({
      hintMove: undefined,
      moveIndex: line ? nextPracticeMoveIndex(line.moves, 0, playSide) : 0,
      missedMove: undefined,
      selected: undefined,
      status: 'idle',
      gradedCardId: undefined,
    });
  };

  undo = () => {
    const { line, moveIndex, playSide } = this.state;
    this.clearBlackReplyTimeout();
    this.clearWrongMoveTimeout();
    this.setState({
      hintMove: undefined,
      moveIndex: line ? previousPracticeMoveIndex(line.moves, moveIndex, playSide) : Math.max(0, moveIndex - 1),
      missedMove: undefined,
      selected: undefined,
      status: 'idle',
      gradedCardId: undefined,
    });
  };

  showForgottenMove = () => {
    const { missedMove } = this.state;
    if (!missedMove) return;

    this.setState({ hintMove: missedMove });
  };

  playMove = async (move: Move, expectedMove: Move) => {
    const { line, moveIndex, playSide } = this.state;
    if (!line) return;

    if (!isSameMove(move, expectedMove)) {
      this.clearWrongMoveTimeout();
      this.setState({ hintMove: undefined, missedMove: expectedMove, status: 'wrong', selected: undefined });
      this.wrongMoveTimeout = setTimeout(() => {
        this.setState({ status: 'idle' });
        this.wrongMoveTimeout = undefined;
      }, 400);
      return;
    }

    this.clearBlackReplyTimeout();
    this.clearWrongMoveTimeout();
    const afterPracticeIndex = moveIndex + 1;
    const nextIndex = nextPracticeMoveIndex(line.moves, afterPracticeIndex, playSide);
    this.setState({ hintMove: undefined, missedMove: undefined, moveIndex: afterPracticeIndex, selected: undefined });

    if (nextIndex === line.moves.length) {
      if (afterPracticeIndex === line.moves.length) {
        this.markLineComplete();
        return;
      }

      this.blackReplyTimeout = setTimeout(() => {
        this.setState({ moveIndex: nextIndex });
        this.markLineComplete();
        this.blackReplyTimeout = undefined;
      }, opponentReplyDelayMs);
      return;
    }

    this.setState({ status: 'correct' });
    this.blackReplyTimeout = setTimeout(() => {
      this.setState({ moveIndex: nextIndex, status: 'idle' });
      this.blackReplyTimeout = undefined;
    }, opponentReplyDelayMs);
  };

  onSquareClick = async (square: Square, chess: Chess, selectedMoves: Move[], expectedMove?: Move) => {
    const { line, playSide, status } = this.state;
    if (!line || status === 'complete' || expectedMove?.color !== playSide) return;

    const piece = chess.get(square);
    const moveFromSelected = selectedMoves.find((move) => move.to === square);

    if (moveFromSelected) {
      await this.playMove(moveFromSelected, expectedMove);
      return;
    }

    if (piece?.color === chess.turn()) {
      this.setState({ selected: square, status: 'idle' });
      return;
    }

    this.setState({ selected: undefined });
  };

  render() {
    const {
      cardId,
      darkSquareColor,
      error,
      gradedCardId,
      hintMove,
      lightSquareColor,
      line,
      missedMove,
      moveIndex,
      playSide,
      selected,
      status,
      title,
    } = this.state;

    if (error || !line) {
      if (error) {
        return <ErrorPanel message={error} />;
      }

      return <div className="chess-opening-shell">Loading chess drill...</div>;
    }

    const chess = buildPosition(line, moveIndex);
    const expectedMove = line.moves[moveIndex];
    const practiceMovesPlayed = practiceProgress(line.moves, moveIndex, playSide);
    const practiceMovesTotal = practiceMoveTotal(line.moves, playSide);
    const legalMoves = chess.moves({ verbose: true }) as Move[];
    const selectedMoves = selected ? legalMoves.filter((move) => move.from === selected) : [];
    const selectedTargets = new Set(selectedMoves.map((move) => move.to));
    const displayFiles = playSide === 'b' ? [...files].reverse() : files;
    const displayRanks = playSide === 'b' ? [...ranks].reverse() : ranks;

    const boardStyle = {
      '--chess-light-square': lightSquareColor,
      '--chess-dark-square': darkSquareColor,
    } as CSSProperties;

    return (
    <div className="chess-opening-shell" style={boardStyle}>
      <div className="chess-opening-header">
        <div>
          <div className="chess-opening-title">{title || 'Chess Opening'}</div>
          <div className={`chess-opening-status chess-opening-status-${status}`}>
            {statusText(status, practiceMovesPlayed, practiceMovesTotal, playSide)}
          </div>
        </div>
        <div className="chess-opening-actions">
          {missedMove && status !== 'wrong' && status !== 'complete' && (
            <button type="button" onClick={this.showForgottenMove} title="Show correct move">
              Forgot
            </button>
          )}
          <button type="button" onClick={this.undo} disabled={moveIndex === 0} title="Undo move">
            Undo
          </button>
          <button type="button" onClick={this.reset} title="Reset line">
            Reset
          </button>
        </div>
      </div>

      <div className={`chess-board ${status === 'wrong' ? 'chess-board-wrong' : ''}`} aria-label="Chess opening practice board">
        {displayRanks.flatMap((rank) =>
          displayFiles.map((file) => {
            const square = `${file}${rank}` as Square;
            const piece = chess.get(square);
            const isLight = (files.indexOf(file) + ranks.indexOf(rank)) % 2 === 0;
            const isSelected = selected === square;
            const isTarget = selectedTargets.has(square);
            return (
              <button
                key={square}
                type="button"
                className={[
                  'chess-square',
                  isLight ? 'chess-square-light' : 'chess-square-dark',
                  isSelected ? 'chess-square-selected' : '',
                  isTarget ? 'chess-square-target' : '',
                ].join(' ')}
                onClick={() => this.onSquareClick(square, chess, selectedMoves, expectedMove)}
                aria-label={square}
              >
                {piece && (
                  <img
                    className={`chess-piece chess-piece-image ${
                      piece.type === 'p' ? 'chess-piece-pawn' : ''
                    } ${piece.type === 'r' ? 'chess-piece-rook' : ''} ${
                      piece.type === 'n' ? 'chess-piece-knight' : ''
                    } ${
                      piece.type === 'q' || piece.type === 'k' ? 'chess-piece-wide' : ''
                    } ${piece.type === 'k' ? 'chess-piece-king' : ''}`}
                    src={pieceAssetPath(piece)}
                    alt=""
                    draggable={false}
                  />
                )}
              </button>
            );
          })
        )}
        {hintMove && <MoveArrow move={hintMove} playSide={playSide} />}
        {status === 'complete' && <div className="chess-complete-overlay">Done. Rate this line</div>}
        {status === 'wrong' && <div className="chess-wrong-overlay">X</div>}
      </div>

      {status === 'complete' && cardId && (
        <div className="chess-grade-actions" aria-label="Grade chess opening card">
          {gradeOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => this.gradeCard(option.score)}
              disabled={gradedCardId === cardId}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
    );
  }
}

export const ChessOpeningWidget = () => {
  const plugin = usePlugin();
  return <ChessOpeningBoard plugin={plugin} />;
};

renderWidget(ChessOpeningWidget);
