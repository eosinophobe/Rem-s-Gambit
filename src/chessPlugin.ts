export const CHESS_POWERUP_CODE = 'chess-opening';
export const PGN_SLOT_CODE = 'pgn';
export const PLAY_SIDE_SLOT_CODE = 'play-side';
export const SHOW_BOARD_PREVIEW_SETTING_ID = 'show-board-preview';
export const PREVIEW_STYLE_SETTING_ID = 'preview-style';
export const FLASHCARD_LIGHT_SQUARE_SETTING_ID = 'flashcard-light-square-color';
export const FLASHCARD_DARK_SQUARE_SETTING_ID = 'flashcard-dark-square-color';
export const DEFAULT_PREVIEW_STYLE = 'lichess-brown';
export const DEFAULT_FLASHCARD_LIGHT_SQUARE = '#f1dab5';
export const DEFAULT_FLASHCARD_DARK_SQUARE = '#b68964';
export const PREVIEW_STYLE_OPTIONS = [
  { key: 'lichess-brown', label: 'Lichess Brown', value: 'lichess-brown' },
  { key: 'lichess-blue', label: 'Lichess Blue', value: 'lichess-blue' },
  { key: 'wikipedia', label: 'Wikipedia', value: 'wikipedia' },
];
export type PlaySide = 'w' | 'b';
export type PreviewStyle = (typeof PREVIEW_STYLE_OPTIONS)[number]['value'];
