export type ColorSchemeId =
  | "sand"
  | "slate"
  | "sage"
  | "rose"
  | "sky"
  | "graphite"
  | "forest"
  | "orchid"
  | "copper"
  | "ocean"
  | "custom";

export type FontFamilyId = "system" | "inter" | "serif" | "mono";

export type FontSizeId = "small" | "default" | "large" | "comfortable";

export type LanguageStyleId =
  | "professional"
  | "friendly"
  | "direct"
  | "imaginative"
  | "efficient"
  | "roast";

export type ShortcutActionId =
  | "openSettings"
  | "newChat"
  | "toggleColorScheme"
  | "cycleLanguageStyle"
  | "increaseFontSize"
  | "decreaseFontSize"
  | "focusComposer";

export type CustomColorScheme = {
  accent: string;
  canvas: string;
  muted: string;
  user: string;
};

export type ShortcutPreference = {
  enabled: boolean;
  keys: string;
};

export type UserPreferences = {
  colorScheme: ColorSchemeId;
  customColorScheme: CustomColorScheme;
  fontFamily: FontFamilyId;
  fontSize: FontSizeId;
  memoryEnabled: boolean;
  languageStyle: LanguageStyleId;
  globalInstructions: string;
  shortcuts: Record<ShortcutActionId, ShortcutPreference>;
};

type ColorScheme = {
  id: ColorSchemeId;
  label: string;
  description: string;
  swatches: CustomColorScheme;
  vars: Record<string, string>;
};

type FontOption = {
  id: FontFamilyId;
  label: string;
  value: string;
};

type FontSizeOption = {
  id: FontSizeId;
  label: string;
  value: string;
};

type LanguageStyleOption = {
  id: LanguageStyleId;
  label: string;
  description: string;
  instruction: string;
};

type ShortcutAction = {
  id: ShortcutActionId;
  label: string;
  description: string;
  defaultKeys: string;
};

const preferenceStorageKey = "salty:user-preferences:v1";

export const defaultCustomColorScheme: CustomColorScheme = {
  accent: "#273244",
  canvas: "#ffffff",
  muted: "#f7f7f4",
  user: "#f1f0eb",
};

export const shortcutActions: ShortcutAction[] = [
  {
    id: "openSettings",
    label: "Open settings",
    description: "Jump to the settings page.",
    defaultKeys: "Cmd ,",
  },
  {
    id: "newChat",
    label: "New chat",
    description: "Start a fresh conversation.",
    defaultKeys: "Cmd Shift O",
  },
  {
    id: "toggleColorScheme",
    label: "Toggle color scheme",
    description: "Switch to the next saved color palette.",
    defaultKeys: "Cmd Shift T",
  },
  {
    id: "cycleLanguageStyle",
    label: "Cycle language style",
    description: "Switch to the next assistant language style.",
    defaultKeys: "Cmd Shift L",
  },
  {
    id: "increaseFontSize",
    label: "Increase font size",
    description: "Move typography one size up.",
    defaultKeys: "Cmd +",
  },
  {
    id: "decreaseFontSize",
    label: "Decrease font size",
    description: "Move typography one size down.",
    defaultKeys: "Cmd -",
  },
  {
    id: "focusComposer",
    label: "Focus composer",
    description: "Place the cursor in the message input.",
    defaultKeys: "Cmd K",
  },
];

export const defaultShortcuts = shortcutActions.reduce(
  (shortcuts, action) => ({
    ...shortcuts,
    [action.id]: {
      enabled: true,
      keys: action.defaultKeys,
    },
  }),
  {} as Record<ShortcutActionId, ShortcutPreference>,
);

export const defaultUserPreferences: UserPreferences = {
  colorScheme: "sand",
  customColorScheme: defaultCustomColorScheme,
  fontFamily: "system",
  fontSize: "default",
  memoryEnabled: false,
  languageStyle: "professional",
  globalInstructions: "",
  shortcuts: defaultShortcuts,
};

export const colorSchemes: ColorScheme[] = [
  {
    id: "sand",
    label: "Sand",
    description: "Warm neutral",
    swatches: {
      accent: "#273244",
      canvas: "#ffffff",
      muted: "#f7f7f4",
      user: "#f1f0eb",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#f7f7f4",
      "--app-soft": "#f1f0eb",
      "--app-hover": "#eceae5",
      "--app-accent": "#273244",
      "--app-user-bubble": "#f1f0eb",
    },
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool neutral",
    swatches: {
      accent: "#334155",
      canvas: "#ffffff",
      muted: "#f4f7fb",
      user: "#e8edf5",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#f4f7fb",
      "--app-soft": "#e8edf5",
      "--app-hover": "#dde6f0",
      "--app-accent": "#334155",
      "--app-user-bubble": "#e8edf5",
    },
  },
  {
    id: "sage",
    label: "Sage",
    description: "Soft green",
    swatches: {
      accent: "#2f5f4f",
      canvas: "#ffffff",
      muted: "#f3f8f4",
      user: "#e5f0e8",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#f3f8f4",
      "--app-soft": "#e5f0e8",
      "--app-hover": "#d9eadf",
      "--app-accent": "#2f5f4f",
      "--app-user-bubble": "#e5f0e8",
    },
  },
  {
    id: "rose",
    label: "Rose",
    description: "Muted red",
    swatches: {
      accent: "#8f3f55",
      canvas: "#ffffff",
      muted: "#fbf4f6",
      user: "#f3e3e8",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#fbf4f6",
      "--app-soft": "#f3e3e8",
      "--app-hover": "#ead4dc",
      "--app-accent": "#8f3f55",
      "--app-user-bubble": "#f3e3e8",
    },
  },
  {
    id: "sky",
    label: "Sky",
    description: "Light blue",
    swatches: {
      accent: "#256278",
      canvas: "#ffffff",
      muted: "#f0f8fb",
      user: "#ddedf5",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#f0f8fb",
      "--app-soft": "#ddedf5",
      "--app-hover": "#cfdfeb",
      "--app-accent": "#256278",
      "--app-user-bubble": "#ddedf5",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "High contrast",
    swatches: {
      accent: "#111827",
      canvas: "#ffffff",
      muted: "#f4f4f5",
      user: "#e7e7ea",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#f4f4f5",
      "--app-soft": "#e7e7ea",
      "--app-hover": "#dcdce1",
      "--app-accent": "#111827",
      "--app-user-bubble": "#e7e7ea",
    },
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep green",
    swatches: {
      accent: "#24513f",
      canvas: "#ffffff",
      muted: "#f2f7f1",
      user: "#dfeee3",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#f2f7f1",
      "--app-soft": "#dfeee3",
      "--app-hover": "#d1e4d7",
      "--app-accent": "#24513f",
      "--app-user-bubble": "#dfeee3",
    },
  },
  {
    id: "orchid",
    label: "Orchid",
    description: "Quiet violet",
    swatches: {
      accent: "#5b4b8a",
      canvas: "#ffffff",
      muted: "#f7f4fb",
      user: "#ebe4f5",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#f7f4fb",
      "--app-soft": "#ebe4f5",
      "--app-hover": "#ded4ec",
      "--app-accent": "#5b4b8a",
      "--app-user-bubble": "#ebe4f5",
    },
  },
  {
    id: "copper",
    label: "Copper",
    description: "Muted amber",
    swatches: {
      accent: "#87552b",
      canvas: "#ffffff",
      muted: "#fbf6ef",
      user: "#f0dfc9",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#fbf6ef",
      "--app-soft": "#f0dfc9",
      "--app-hover": "#e8d2b6",
      "--app-accent": "#87552b",
      "--app-user-bubble": "#f0dfc9",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Clear teal",
    swatches: {
      accent: "#17606b",
      canvas: "#ffffff",
      muted: "#eff8f8",
      user: "#d9eeee",
    },
    vars: {
      "--app-canvas": "#ffffff",
      "--app-muted": "#eff8f8",
      "--app-soft": "#d9eeee",
      "--app-hover": "#cae3e4",
      "--app-accent": "#17606b",
      "--app-user-bubble": "#d9eeee",
    },
  },
  {
    id: "custom",
    label: "Custom",
    description: "User defined",
    swatches: defaultCustomColorScheme,
    vars: buildCustomColorVars(defaultCustomColorScheme),
  },
];

export const fontFamilies: FontOption[] = [
  {
    id: "system",
    label: "System",
    value:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "inter",
    label: "Inter",
    value:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    value: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    id: "mono",
    label: "Mono",
    value:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
];

export const fontSizes: FontSizeOption[] = [
  { id: "small", label: "Small", value: "12px" },
  { id: "default", label: "Default", value: "13px" },
  { id: "large", label: "Large", value: "14px" },
  { id: "comfortable", label: "Comfortable", value: "15px" },
];

export const languageStyles: LanguageStyleOption[] = [
  {
    id: "professional",
    label: "专业可靠",
    description: "结构清晰，判断稳健，适合默认工作场景。",
    instruction:
      "使用专业可靠的语言风格：表达准确、克制、结构清晰，避免夸张和随意调侃。",
  },
  {
    id: "friendly",
    label: "亲和友善",
    description: "语气更温和，解释更照顾阅读感受。",
    instruction:
      "使用亲和友善的语言风格：语气温和，解释耐心，保持准确，不使用空泛鼓励。",
  },
  {
    id: "direct",
    label: "直言不讳",
    description: "先给结论，直接指出问题和取舍。",
    instruction:
      "使用直言不讳的语言风格：先给结论，明确指出问题、风险和取舍，避免绕弯。",
  },
  {
    id: "imaginative",
    label: "天马行空",
    description: "更开放，适合创意和探索性任务。",
    instruction:
      "使用天马行空的语言风格：在保持事实准确的前提下，允许更开放、更有想象力的表达和方案。",
  },
  {
    id: "efficient",
    label: "高效务实",
    description: "减少铺垫，优先给可执行步骤。",
    instruction:
      "使用高效务实的语言风格：减少铺垫，优先给可执行结论、步骤和代码层面的建议。",
  },
  {
    id: "roast",
    label: "犀利吐槽",
    description: "更锋利，但不做人身攻击。",
    instruction:
      "使用犀利吐槽的语言风格：可以尖锐地评价方案和代码问题，但不要人身攻击，不要影响专业判断。",
  },
];

export function loadUserPreferences(): UserPreferences {
  if (typeof window === "undefined") return defaultUserPreferences;

  try {
    const raw = window.localStorage.getItem(preferenceStorageKey);
    if (!raw) return defaultUserPreferences;
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return defaultUserPreferences;
  }
}

export function saveUserPreferences(preferences: UserPreferences) {
  if (typeof window === "undefined") return;
  const normalized = normalizePreferences(preferences);
  window.localStorage.setItem(
    preferenceStorageKey,
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent("salty:user-preferences-updated", {
      detail: normalized,
    }),
  );
}

export function applyUserPreferences(preferences: UserPreferences) {
  if (typeof document === "undefined") return;

  const normalized = normalizePreferences(preferences);
  const root = document.documentElement;
  const scheme = colorSchemes.find((item) => item.id === normalized.colorScheme);
  const fontFamily = fontFamilies.find((item) => item.id === normalized.fontFamily);
  const fontSize = fontSizes.find((item) => item.id === normalized.fontSize);
  const colorVars =
    normalized.colorScheme === "custom"
      ? buildCustomColorVars(normalized.customColorScheme)
      : (scheme?.vars ?? colorSchemes[0].vars);

  root.dataset.colorScheme = normalized.colorScheme;
  for (const [property, value] of Object.entries(colorVars)) {
    root.style.setProperty(property, value);
  }
  root.style.setProperty(
    "--app-font-family",
    fontFamily?.value ?? fontFamilies[0].value,
  );
  root.style.setProperty("--app-font-size", fontSize?.value ?? fontSizes[1].value);
}

export function loadGlobalInstructions() {
  return composeGlobalInstructions(loadUserPreferences());
}

export function composeGlobalInstructions(preferences: UserPreferences) {
  const normalized = normalizePreferences(preferences);
  const style =
    languageStyles.find((item) => item.id === normalized.languageStyle) ??
    languageStyles[0];
  const memoryInstruction = normalized.memoryEnabled
    ? "记忆已开启：可以使用系统明确提供的已保存用户记忆作为额外上下文；不要编造未提供的记忆。"
    : "记忆已关闭：不要使用跨会话记忆，只依据当前对话、当前文件上下文和用户显式指令回答。";
  const globalInstructions = normalized.globalInstructions.trim();

  return [style.instruction, memoryInstruction, globalInstructions]
    .filter(Boolean)
    .join("\n\n");
}

function normalizePreferences(value: unknown): UserPreferences {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<UserPreferences>)
      : {};

  return {
    colorScheme: isColorScheme(candidate.colorScheme)
      ? candidate.colorScheme
      : defaultUserPreferences.colorScheme,
    customColorScheme: normalizeCustomColorScheme(candidate.customColorScheme),
    fontFamily: isFontFamily(candidate.fontFamily)
      ? candidate.fontFamily
      : defaultUserPreferences.fontFamily,
    fontSize: isFontSize(candidate.fontSize)
      ? candidate.fontSize
      : defaultUserPreferences.fontSize,
    memoryEnabled:
      typeof candidate.memoryEnabled === "boolean"
        ? candidate.memoryEnabled
        : defaultUserPreferences.memoryEnabled,
    languageStyle: isLanguageStyle(candidate.languageStyle)
      ? candidate.languageStyle
      : defaultUserPreferences.languageStyle,
    globalInstructions:
      typeof candidate.globalInstructions === "string"
        ? candidate.globalInstructions
        : defaultUserPreferences.globalInstructions,
    shortcuts: normalizeShortcuts(candidate.shortcuts),
  };
}

function normalizeCustomColorScheme(value: unknown): CustomColorScheme {
  const candidate =
    value && typeof value === "object" ? (value as Partial<CustomColorScheme>) : {};

  return {
    accent: normalizeColor(candidate.accent, defaultCustomColorScheme.accent),
    canvas: normalizeColor(candidate.canvas, defaultCustomColorScheme.canvas),
    muted: normalizeColor(candidate.muted, defaultCustomColorScheme.muted),
    user: normalizeColor(candidate.user, defaultCustomColorScheme.user),
  };
}

function normalizeShortcuts(value: unknown) {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<Record<ShortcutActionId, Partial<ShortcutPreference>>>)
      : {};

  return shortcutActions.reduce((shortcuts, action) => {
    const shortcut = candidate[action.id];
    shortcuts[action.id] = {
      enabled:
        typeof shortcut?.enabled === "boolean"
          ? shortcut.enabled
          : defaultShortcuts[action.id].enabled,
      keys:
        typeof shortcut?.keys === "string" && shortcut.keys.trim()
          ? shortcut.keys.trim()
          : defaultShortcuts[action.id].keys,
    };
    return shortcuts;
  }, {} as Record<ShortcutActionId, ShortcutPreference>);
}

function buildCustomColorVars(colors: CustomColorScheme) {
  return {
    "--app-canvas": colors.canvas,
    "--app-muted": colors.muted,
    "--app-soft": colors.user,
    "--app-hover": `color-mix(in srgb, ${colors.muted} 72%, ${colors.accent})`,
    "--app-accent": colors.accent,
    "--app-user-bubble": colors.user,
  };
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function isColorScheme(value: unknown): value is ColorSchemeId {
  return colorSchemes.some((item) => item.id === value);
}

function isFontFamily(value: unknown): value is FontFamilyId {
  return fontFamilies.some((item) => item.id === value);
}

function isFontSize(value: unknown): value is FontSizeId {
  return fontSizes.some((item) => item.id === value);
}

function isLanguageStyle(value: unknown): value is LanguageStyleId {
  return languageStyles.some((item) => item.id === value);
}
