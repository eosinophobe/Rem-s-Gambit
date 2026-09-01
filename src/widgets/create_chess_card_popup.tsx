import { renderWidget, usePlugin, WidgetLocation } from '@remnote/plugin-sdk';
import type { RichTextImageInterface } from '@remnote/plugin-sdk';
import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import { Component } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  CHESS_POWERUP_CODE,
  DEFAULT_PREVIEW_STYLE,
  PGN_SLOT_CODE,
  PLAY_SIDE_SLOT_CODE,
  PREVIEW_STYLE_OPTIONS,
  PREVIEW_STYLE_SETTING_ID,
  SHOW_BOARD_PREVIEW_SETTING_ID,
  type PlaySide,
  type PreviewStyle,
} from '../chessPlugin';
import '../style.css';
import '../index.css';

type CreateChessCardPopupState = {
  targetRemId?: string;
  error: string;
  isSaving: boolean;
  name: string;
  pgn: string;
  playSide: PlaySide;
};
type PracticeLine = {
  startFen?: string;
  moves: Move[];
};

function cleanPgn(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\b(\d+)\.(?!\.)\s*/g, '$1. ')
    .replace(/\b(\d+)\.\.\.\s*/g, '$1... ')
    .trim();
}

function looksLikePgn(raw: string) {
  return Boolean(parsePracticeLine(raw));
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

    try {
      chess.move(move, { strict: false });
    } catch {
      return [];
    }
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
    const moves = parseSanMoves(pgn);
    return moves.length > 0 ? { moves } : undefined;
  }

  const headers = chess.getHeaders();
  const moves = chess.history({ verbose: true });
  if (moves.length > 0) {
    return {
      moves,
      startFen: headers.SetUp === '1' && headers.FEN ? headers.FEN : undefined,
    };
  }

  const sanMoves = parseSanMoves(pgn);
  return sanMoves.length > 0 ? { moves: sanMoves } : undefined;
}

function isPreviewStyle(value: unknown): value is PreviewStyle {
  return PREVIEW_STYLE_OPTIONS.some((option) => option.value === value);
}

function openingPreviewImage(
  pgn: string,
  playSide: PlaySide,
  previewStyle: PreviewStyle
): RichTextImageInterface | undefined {
  const line = parsePracticeLine(pgn);
  if (!line) return undefined;

  const chess = line.startFen ? new Chess(line.startFen) : new Chess();
  for (const move of line.moves) {
    chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || 'q',
    });
  }

  const imageUrl = new URL('https://backscattering.de/web-boardimage/board.png');
  imageUrl.searchParams.set('fen', chess.fen());
  imageUrl.searchParams.set('size', '240');
  imageUrl.searchParams.set('orientation', playSide === 'b' ? 'black' : 'white');
  imageUrl.searchParams.set('colors', previewStyle);

  return {
    i: 'i',
    url: imageUrl.toString(),
    width: 240,
    height: 240,
    percent: 25,
    title: 'Opening preview',
    transparent: true,
  };
}

class CreateChessCardPopupForm extends Component<
  { plugin: ReturnType<typeof usePlugin> },
  CreateChessCardPopupState
> {
  state: CreateChessCardPopupState = {
    targetRemId: undefined,
    error: '',
    isSaving: false,
    name: '',
    pgn: '',
    playSide: 'w',
  };

  async componentDidMount() {
    const context = await this.props.plugin.widget.getWidgetContext<WidgetLocation.Popup>();
    const remId = context.contextData?.remId;

    if (typeof remId === 'string') {
      this.setState({ targetRemId: remId });
    } else {
      this.setState({ error: 'Run this command while focused on the rem you want to turn into a card.' });
    }
  }

  createCard = async (event: FormEvent) => {
    event.preventDefault();

    const { name, pgn, playSide } = this.state;
    const title = name.trim() || 'Chess opening';
    const cleanedPgn = cleanPgn(pgn);

    if (!looksLikePgn(cleanedPgn)) {
      this.setState({ error: 'Enter a PGN move line, for example: 1.e4 e5 2.Nf3 Nc6' });
      return;
    }

    this.setState({ error: '', isSaving: true });

    try {
      if (!this.state.targetRemId) {
        throw new Error();
      }

      const targetRem = await this.props.plugin.rem.findOne(this.state.targetRemId);
      if (!targetRem) {
        throw new Error();
      }

      const showBoardPreviewSetting = await this.props.plugin.settings.getSetting<boolean>(SHOW_BOARD_PREVIEW_SETTING_ID);
      const previewStyleSetting = await this.props.plugin.settings.getSetting<string>(PREVIEW_STYLE_SETTING_ID);
      const previewStyle = isPreviewStyle(previewStyleSetting) ? previewStyleSetting : DEFAULT_PREVIEW_STYLE;
      const previewImage =
        showBoardPreviewSetting !== false ? openingPreviewImage(cleanedPgn, playSide, previewStyle) : undefined;

      await targetRem.setText(previewImage ? [previewImage, ' ', title] : [title]);
      await targetRem.setBackText([cleanedPgn]);
      await targetRem.setEnablePractice(true);
      await targetRem.setPracticeDirection('forward');
      await targetRem.addPowerup(CHESS_POWERUP_CODE);
      await targetRem.setPowerupProperty(CHESS_POWERUP_CODE, PGN_SLOT_CODE, [cleanedPgn]);
      await targetRem.setPowerupProperty(CHESS_POWERUP_CODE, PLAY_SIDE_SLOT_CODE, [playSide]);
      await this.props.plugin.widget.closePopup(true);
    } catch {
      this.setState({ error: 'Could not create this chess card.' });
    } finally {
      this.setState({ isSaving: false });
    }
  };

  render() {
    const { error, isSaving, name, pgn, playSide } = this.state;

    return (
      <form className="chess-card-popup" onSubmit={this.createCard}>
        <div>
          <h1>Create Chess Opening</h1>
          <p>Enter a PGN line and an optional opening name.</p>
        </div>

        <label>
          <span>Opening name</span>
          <input
            autoFocus
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) => this.setState({ name: event.target.value })}
            placeholder="Chess opening"
          />
        </label>

        <label>
          <span>PGN</span>
          <textarea
            value={pgn}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => this.setState({ pgn: event.target.value })}
            placeholder="1.e4 e5 2.Nf3 Nc6 3.Bb5 a6"
          />
        </label>

        <div className="chess-card-popup-side">
          <span>Play as</span>
          <div className="chess-card-popup-segmented" role="group" aria-label="Choose side to practice">
            <button
              type="button"
              className={playSide === 'w' ? 'active' : ''}
              onClick={() => this.setState({ playSide: 'w' })}
              disabled={isSaving}
            >
              White
            </button>
            <button
              type="button"
              className={playSide === 'b' ? 'active' : ''}
              onClick={() => this.setState({ playSide: 'b' })}
              disabled={isSaving}
            >
              Black
            </button>
          </div>
        </div>

        {error && <div className="chess-card-popup-error">{error}</div>}

        <div className="chess-card-popup-actions">
          <button type="button" onClick={() => this.props.plugin.widget.closePopup(true)} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Creating...' : 'Create card'}
          </button>
        </div>
      </form>
    );
  }
}

export const CreateChessCardPopup = () => {
  const plugin = usePlugin();
  return <CreateChessCardPopupForm plugin={plugin} />;
};

renderWidget(CreateChessCardPopup);
