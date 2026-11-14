import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NativeTextSpan } from './editorModel';

export interface DirectPageTextEditorProps {
  span: NativeTextSpan;
  scale: number;
  initialText: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  textAlign?: 'left' | 'center' | 'right';
  pageWidth: number;
  onCommit: (newText: string) => void;
  onCancel: () => void;
  onChange: (newText: string) => void;
}

export const DirectPageTextEditor: React.FC<DirectPageTextEditorProps> = ({
  span,
  scale,
  initialText,
  fontFamily,
  fontSize,
  color,
  textAlign = 'left',
  pageWidth,
  onCommit,
  onCancel,
  onChange,
}) => {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initial span dimensions in scaled screen pixels
  const initialWidth = Math.max(28, (span.bbox[2] - span.bbox[0]) * scale);
  const initialHeight = Math.max(20, (span.bbox[3] - span.bbox[1]) * scale);
  const maxAvailableWidth = Math.max(initialWidth, (pageWidth - span.bbox[0] - 8) * scale);

  const [boxWidth, setBoxWidth] = useState(initialWidth);
  const [boxHeight, setBoxHeight] = useState(initialHeight);

  // Auto-focus and place caret on mount
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      // Position caret at the end of the text
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  // Dynamically expand container width and height to fit typed text without distortion
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Temporarily reset height and width to calculate content size
    el.style.height = 'auto';
    el.style.width = 'auto';

    const scrollW = el.scrollWidth + 10; // 10px buffer for cursor
    const scrollH = el.scrollHeight + 4;

    const newW = Math.min(Math.max(initialWidth, scrollW), maxAvailableWidth);
    const newH = Math.max(initialHeight, scrollH);

    setBoxWidth(newW);
    setBoxHeight(newH);

    el.style.width = '100%';
    el.style.height = '100%';
  }, [text, initialWidth, initialHeight, maxAvailableWidth]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Prevent global editor shortcuts (e.g. Esc clearing tool, Delete deleting objects)
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }

    if (e.key === 'Enter') {
      // If single-line original text, plain Enter commits the edit
      // Shift+Enter or multiline spans allow newlines
      const isMultiline = initialText.includes('\n') || text.includes('\n');
      if (!isMultiline || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onCommit(text);
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      onCommit(text);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      // Scope select-all strictly to this textarea
      e.stopPropagation();
    }
  }

  function handleBlur() {
    // When clicking outside the editing field, commit seamlessly
    onCommit(text);
  }

  return (
    <div
      ref={containerRef}
      className="direct-page-text-editor-container"
      style={{
        position: 'absolute',
        left: span.bbox[0] * scale,
        top: Math.max(0, span.bbox[1] * scale - 2),
        width: boxWidth,
        height: boxHeight,
        zIndex: 55,
        backgroundColor: '#FFFFFF',
        border: '1.5px solid var(--forest, #23665a)',
        borderRadius: '3px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.16)',
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        className="direct-page-textarea"
        value={text}
        aria-label="Direct page text editor"
        autoFocus
        rows={1}
        onChange={e => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          margin: 0,
          padding: '2px 4px',
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          resize: 'none',
          overflow: 'hidden',
          fontFamily: `'${fontFamily}', sans-serif`,
          fontSize: `${fontSize * scale}px`,
          lineHeight: 1.5,
          color: color || '#000000',
          textAlign,
          caretColor: 'var(--forest, #23665a)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          letterSpacing: 'normal',
          transform: 'none',
        }}
      />
    </div>
  );
};
