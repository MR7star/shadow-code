import React, { useRef, useMemo, useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import './CodeEditor.css';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  onReset?: () => void;
  disabled?: boolean;
}

export default function CodeEditor({
  value,
  onChange,
  onRun,
  onReset,
  disabled = false,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Split code into lines for gutter line numbers
  const lines = useMemo(() => {
    return value.split('\n');
  }, [value]);

  // Highlight python syntax using Prism
  const highlightedCode = useMemo(() => {
    try {
      return Prism.highlight(value || ' ', Prism.languages.python, 'python');
    } catch {
      return value;
    }
  }, [value]);

  // Synchronize scroll position between textarea, highlight layer, and line numbers
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Keyboard ergonomics: Tab indentation, smart Enter indentation, and Ctrl+Enter run
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Ctrl+Enter or Cmd+Enter -> Run Code
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
      return;
    }

    // Tab / Shift+Tab handling
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (e.shiftKey) {
        // Unindent 4 spaces if possible
        const before = value.substring(0, start);
        const after = value.substring(end);
        if (before.endsWith('    ')) {
          const newVal = before.slice(0, -4) + after;
          onChange(newVal);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start - 4;
          }, 0);
        }
      } else {
        // Insert 4 spaces
        const newVal = value.substring(0, start) + '    ' + value.substring(end);
        onChange(newVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 4;
        }, 0);
      }
      return;
    }

    // Smart Enter auto-indentation
    if (e.key === 'Enter') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const linesBefore = value.substring(0, start).split('\n');
      const currentLine = linesBefore[linesBefore.length - 1];

      // Match leading whitespace of current line
      const match = currentLine.match(/^(\s*)/);
      let indent = match ? match[1] : '';

      // If line ends with ':', indent further by 4 spaces
      if (currentLine.trim().endsWith(':')) {
        indent += '    ';
      }

      const insertion = '\n' + indent;
      const newVal =
        value.substring(0, start) + insertion + value.substring(textarea.selectionEnd);
      onChange(newVal);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
      }, 0);
      return;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  useEffect(() => {
    // Initial sync
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [value]);

  return (
    <div className="code-editor-wrapper">
      <div className="code-editor-topbar">
        <div className="code-editor-lang-tag">
          <span>🐍</span>
          <span>PYTHON 3.12</span>
        </div>
        <div className="code-editor-actions-mini">
          <button
            type="button"
            className="editor-mini-btn"
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            📋 Copy
          </button>
          {onReset && (
            <button
              type="button"
              className="editor-mini-btn"
              onClick={onReset}
              title="Reset to starter template"
            >
              ↺ Reset
            </button>
          )}
        </div>
      </div>

      <div className="code-editor-body">
        {/* Line numbers gutter */}
        <div className="code-editor-linenumbers" ref={lineNumbersRef} aria-hidden="true">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Scrollable overlaid editor layers */}
        <div className="code-editor-scroll">
          <textarea
            ref={textareaRef}
            className="code-editor-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder="# Write your Python solution here..."
          />
          <pre ref={preRef} className="code-editor-highlight" aria-hidden="true">
            <code
              className="language-python"
              dangerouslySetInnerHTML={{ __html: highlightedCode + '\n' }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
}
