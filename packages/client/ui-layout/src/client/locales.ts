/** `layout` namespace dictionaries: mobile header chrome copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'session.switcher.label': '切换项目或会话',
  'session.switcher.placeholder': '选择项目或会话',
  'settings.open': '设置',
} satisfies Record<string, string>

/** The layout namespace key union. */
export type LayoutKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'session.switcher.label': 'Switch project or session',
  'session.switcher.placeholder': 'Choose a project or session',
  'settings.open': 'Settings',
} satisfies Record<LayoutKey, string>
