import { useRef, useEffect, useCallback, useState } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
import { Check } from "lucide-react";
import styles from "./MQLEditor.module.scss";

interface MQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  isValid?: boolean;
  maxLength?: number;
  placeholder?: string;
}

const MQL_LANGUAGE_ID = "mql";
const MQL_THEME_ID = "neoguard-dark";

const SINGLE_LINE_HEIGHT = 38;
const MAX_LINE_HEIGHT = 90;
const LINE_PX = 19;

/** Registers the MQL language and NeoGuard dark theme (once per Monaco instance). */
function registerMQLLanguage(monaco: Parameters<BeforeMount>[0]): void {
  // Guard: only register once
  const registered = monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === MQL_LANGUAGE_ID);
  if (!registered) {
    monaco.languages.register({ id: MQL_LANGUAGE_ID });

    monaco.languages.setMonarchTokensProvider(MQL_LANGUAGE_ID, {
      tokenizer: {
        root: [
          // $variable references — match before identifiers
          [/\$[a-zA-Z_][a-zA-Z0-9_]*/, "variable"],
          // Aggregator keywords
          [/\b(avg|sum|min|max|count|p50|p95|p99|last)\b/, "keyword"],
          // Post-processing functions (after dot)
          [/\.(rate|derivative|moving_average|as_rate|as_count|abs|log|rollup)\b/, "support.function"],
          // IN keyword (for tag filters)
          [/\bIN\b/, "keyword"],
          // Brackets / braces / parens
          [/[{}()]/, "delimiter.bracket"],
          // Delimiters
          [/[,:]/, "delimiter"],
          // Negation operator
          [/!/, "operator"],
          // Wildcard
          [/\*/, "operator"],
          // Numbers (including negative)
          [/-?\b\d+(\.\d+)?\b/, "number"],
          // Identifiers (metric names, tag keys/values — can contain dots, hyphens)
          [/[a-zA-Z_][a-zA-Z0-9_.\-/]*/, "identifier"],
        ],
      },
    });
  }

  // Always (re-)define the theme — idempotent
  monaco.editor.defineTheme(MQL_THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "c084fc" },          // purple — aggregators
      { token: "variable", foreground: "22d3ee" },          // cyan — $variables
      { token: "support.function", foreground: "fbbf24" },  // amber — .rate() etc.
      { token: "identifier", foreground: "e2e8f0" },        // light — metric names
      { token: "number", foreground: "34d399" },             // green — numbers
      { token: "delimiter", foreground: "94a3b8" },          // muted — , :
      { token: "delimiter.bracket", foreground: "94a3b8" },  // muted — {} ()
      { token: "operator", foreground: "f87171" },           // red — ! *
    ],
    colors: {
      "editor.background": "#1a1a2e",
      "editor.foreground": "#e2e8f0",
      "editor.lineHighlightBackground": "#1a1a2e",         // no visible line highlight
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": "#635bff",
      "editor.selectionBackground": "#635bff44",
      "editorWidget.background": "#1a1a2e",
      "editorSuggestWidget.background": "#1a1a2e",
      "input.background": "#1a1a2e",
      "scrollbar.shadow": "#00000000",
      "editorOverviewRuler.border": "#00000000",
    },
  });
}

export function MQLEditor({
  value,
  onChange,
  error,
  isValid,
  maxLength = 2000,
  placeholder = 'avg:aws.rds.cpu{env:prod}.rate()',
}: MQLEditorProps) {
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const [editorHeight, setEditorHeight] = useState(SINGLE_LINE_HEIGHT);

  /** Compute height based on line count. */
  const computeHeight = useCallback((val: string): number => {
    if (!val) return SINGLE_LINE_HEIGHT;
    const lineCount = val.split("\n").length;
    const contentHeight = Math.max(SINGLE_LINE_HEIGHT, lineCount * LINE_PX);
    return Math.min(contentHeight, MAX_LINE_HEIGHT);
  }, []);

  /** Update error decorations (red squiggly underline on entire content). */
  const updateDecorations = useCallback(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;

    const model = ed.getModel();
    if (!model) return;

    if (error) {
      const lastLine = model.getLineCount();
      const lastCol = model.getLineMaxColumn(lastLine);

      // Use model markers for squiggly underline
      monaco.editor.setModelMarkers(model, "mql-validation", [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: lastLine,
          endColumn: lastCol,
          message: error,
          severity: monaco.MarkerSeverity.Error,
        },
      ]);
    } else {
      monaco.editor.setModelMarkers(model, "mql-validation", []);
    }
  }, [error]);

  // Update decorations when error changes
  useEffect(() => {
    updateDecorations();
  }, [error, updateDecorations]);

  // Recompute height when value changes externally
  useEffect(() => {
    setEditorHeight(computeHeight(value));
  }, [value, computeHeight]);

  const handleBeforeMount: BeforeMount = (monaco) => {
    registerMQLLanguage(monaco);
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Apply decorations if error was set before mount
    updateDecorations();

    // Disable unwanted features for single-line-ish editor
    editor.updateOptions({
      contextmenu: false,
      links: false,
      colorDecorators: false,
      lightbulb: { enabled: undefined },
      quickSuggestions: false,
      parameterHints: { enabled: false },
      suggestOnTriggerCharacters: false,
      acceptSuggestionOnEnter: "off",
      folding: false,
      renderLineHighlight: "none",
      matchBrackets: "always",
    });
  };

  const handleChange = (val: string | undefined) => {
    const newVal = val ?? "";
    // Enforce maxLength
    if (newVal.length > maxLength) return;
    onChange(newVal);
    setEditorHeight(computeHeight(newVal));
  };

  const containerClass = [
    styles.container,
    error ? styles.containerError : "",
    isValid && !error ? styles.containerValid : "",
  ]
    .filter(Boolean)
    .join(" ");

  const nearLimit = value.length > maxLength - 100;

  return (
    <div>
      <div className={containerClass} data-testid="mql-editor-container">
        <Editor
          height={editorHeight}
          language={MQL_LANGUAGE_ID}
          theme={MQL_THEME_ID}
          value={value}
          onChange={handleChange}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          loading={<div className={styles.loadingOverlay}>Loading editor...</div>}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            lineNumbers: "off",
            glyphMargin: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 0,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            wrappingStrategy: "advanced",
            overviewRulerLanes: 0,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              vertical: "hidden",
              horizontal: "hidden",
              handleMouseWheel: false,
            },
            padding: { top: 9, bottom: 9 },
            renderWhitespace: "none",
            occurrencesHighlight: "off",
            selectionHighlight: false,
            find: { addExtraSpaceOnTop: false, autoFindInSelection: "never" },
            placeholder: placeholder,
          }}
        />
      </div>

      <div className={styles.footer} data-testid="mql-editor-footer">
        <div className={styles.statusLeft}>
          {error && (
            <span className={styles.errorText} data-testid="mql-editor-error">
              {error}
            </span>
          )}
          {isValid && !error && (
            <span className={styles.validText} data-testid="mql-editor-valid">
              <Check size={12} /> Valid query
            </span>
          )}
        </div>
        <span
          className={`${styles.charCounter} ${nearLimit ? styles.charCounterDanger : ""}`}
          data-testid="mql-editor-counter"
        >
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
