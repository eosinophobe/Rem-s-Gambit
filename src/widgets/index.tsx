import {
  declareIndexPlugin,
  type ReactRNPlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import {
  CHESS_POWERUP_CODE,
  DEFAULT_FLASHCARD_DARK_SQUARE,
  DEFAULT_FLASHCARD_LIGHT_SQUARE,
  DEFAULT_PREVIEW_STYLE,
  FLASHCARD_DARK_SQUARE_SETTING_ID,
  FLASHCARD_LIGHT_SQUARE_SETTING_ID,
  PGN_SLOT_CODE,
  PLAY_SIDE_SLOT_CODE,
  PREVIEW_STYLE_OPTIONS,
  PREVIEW_STYLE_SETTING_ID,
  SHOW_BOARD_PREVIEW_SETTING_ID,
} from '../chessPlugin';
import '../style.css';
import '../index.css';

const chessQueueWidgetSelector =
  'iframe[src*="sample_widget"], iframe[src*="widgetName=sample_widget"], iframe[src*="sample_widget-sandbox"]';

const chessQueueCSS = `
.rn-queue:has(${chessQueueWidgetSelector}) .spaced-repetition__bottom:not(:has(${chessQueueWidgetSelector})) {
  display: none !important;
}

.rn-queue:has(${chessQueueWidgetSelector}) .rn-queue-container .rn-content-and-right-sidebar
  > :not(:has(${chessQueueWidgetSelector})) {
  display: none !important;
}

.rn-queue:has(${chessQueueWidgetSelector}) ${chessQueueWidgetSelector} {
  display: block !important;
}
`;

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.app.registerPowerup({
    name: 'Chess Opening',
    code: CHESS_POWERUP_CODE,
    description: 'Practice a PGN as an interactive chess opening flashcard.',
    options: {
      slots: [
        {
          code: PGN_SLOT_CODE,
          name: 'PGN',
        },
        {
          code: PLAY_SIDE_SLOT_CODE,
          name: 'Play Side',
        },
      ],
    },
  });

  await plugin.app.registerCSS('chess-opening-queue-css', chessQueueCSS);
  await plugin.settings.registerBooleanSetting({
    id: SHOW_BOARD_PREVIEW_SETTING_ID,
    title: 'Show board preview',
    description: 'Show a small board image on newly inserted chess opening cards.',
    defaultValue: true,
  });
  await plugin.settings.registerDropdownSetting({
    id: PREVIEW_STYLE_SETTING_ID,
    title: 'Preview style',
    description: 'Choose the board style used for newly inserted board previews.',
    defaultValue: DEFAULT_PREVIEW_STYLE,
    options: PREVIEW_STYLE_OPTIONS,
  });
  await plugin.settings.registerStringSetting({
    id: FLASHCARD_LIGHT_SQUARE_SETTING_ID,
    title: 'Flashcard board light squares',
    description: 'Hex color for the light squares in the flashcard queue board.',
    defaultValue: DEFAULT_FLASHCARD_LIGHT_SQUARE,
    validators: [{ type: 'regex', arg: '^#[0-9a-fA-F]{6}$' }],
  });
  await plugin.settings.registerStringSetting({
    id: FLASHCARD_DARK_SQUARE_SETTING_ID,
    title: 'Flashcard board dark squares',
    description: 'Hex color for the dark squares in the flashcard queue board.',
    defaultValue: DEFAULT_FLASHCARD_DARK_SQUARE,
    validators: [{ type: 'regex', arg: '^#[0-9a-fA-F]{6}$' }],
  });
  await Promise.all([
    plugin.app.unregisterWidget('sample_widget', WidgetLocation.FlashcardUnder).catch(() => undefined),
    plugin.app.unregisterWidget('sample_widget', WidgetLocation.FlashcardAnswer).catch(() => undefined),
    plugin.app.unregisterWidget('sample_widget', WidgetLocation.Flashcard).catch(() => undefined),
    plugin.app.unregisterWidget('create_chess_card_popup', WidgetLocation.Popup).catch(() => undefined),
  ]);

  await plugin.app.registerWidget('sample_widget', WidgetLocation.Flashcard, {
    powerupFilter: CHESS_POWERUP_CODE,
    dimensions: { height: 500, width: '100%' },
  });

  await plugin.app.registerWidget('create_chess_card_popup', WidgetLocation.Popup, {
    dimensions: { height: 480, width: 460 },
  });

  await plugin.app.registerCommand({
    id: 'tag-rem-as-chess-opening',
    name: 'Insert a chess opening',
    description: 'Create a chess opening flashcard from the focused rem.',
    keywords: 'chess opening pgn practice',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();

      if (!focusedRem) {
        return;
      }

      await plugin.widget.openPopup('create_chess_card_popup', { remId: focusedRem._id }, true);
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
