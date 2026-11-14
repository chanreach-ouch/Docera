# Competitor UX Research: In-Document Direct PDF Editing
**Benchmark Target:** iLovePDF & Modern Direct PDF Editors  
**Date:** November 14, 2026  
**Document Author:** Docera Principal Product Designer & Frontend Architect  
**Source Status:** Synthesized from public product documentation, published engineering blogs, and public web editor inspection.

---

## 1. Executive Summary & Core Insight

Modern users expect web PDF editors to function like Google Docs, Figma, or Adobe Acrobat: **direct manipulation on the page**. 

The legacy workflow—where a user selects text on a canvas, moves their gaze to a sidebar Properties panel, types into a detached input box, clicks "Apply", and waits for a preview—creates massive cognitive friction. It feels disconnected, slow, and robotic.

iLovePDF, Adobe Acrobat Web, and Smallpdf have all transitioned to **Direct On-Page Editing**:
1. Hovering text reveals subtle bounding box affordances.
2. Clicking/Double-clicking places a blinking text cursor (**I-beam caret**) directly inside the words on the page.
3. The user types, deletes, and pastes inline with zero latency.
4. Formatting controls (font family, size, color, bold, alignment) are presented in a clean, compact toolbar docked at the top of the viewport or floating non-intrusively above the selection—**never blocking the line being edited**.
5. The sidebar remains strictly for secondary properties (page dimensions, layer order, metadata) rather than routine typing.

---

## 2. Interaction Breakdown: iLovePDF Workflow

Based on iLovePDF's published documentation (`/edit-pdf`, `/blog/edit-pdf-text`, `/blog/new-advanced-pdf-editing-ilovepdf`):

| Interaction Step | User Action | System Feedback |
|------------------|-------------|-----------------|
| **1. Tool Activation** | User clicks "Edit" or "Edit Content" in top toolbar | Mouse cursor changes to crosshair / text selection mode. Text layer becomes interactively selectable. |
| **2. Text Block Hover** | Mouse moves over a line or paragraph | A subtle, thin dashed/solid bounding box (1px) indicates the editable boundaries of the text cluster. |
| **3. Block Selection** | Single click on text | Text block is selected. A compact formatting bar appears at top. Bounding box shows corner resize handles. |
| **4. In-Place Editing** | Double-click or single click inside text | Text caret enters the text block. The bounding box becomes an active editable field matching document background and font. |
| **5. Live Typing** | User types, edits, deletes | Text updates character-by-character in real-time. Text flow wraps within the bounding box margins. Natural line-height prevents ascender/descender clipping. |
| **6. De-selection / Commit** | Click outside, press Escape, or select another tool | Bounding box reverts to normal canvas text. Content stream is updated seamlessly. |

---

## 3. Comparison: Adobe Acrobat Web vs. iLovePDF vs. Docera Legacy

| Dimension | Adobe Acrobat Web | iLovePDF Content Editor | Docera Legacy | **Docera Next-Gen (Target)** |
|:---|:---|:---|:---|:---|
| **Editing Location** | Directly on canvas | Directly on canvas | Right sidebar textarea | **Directly on canvas** |
| **Caret Support** | Native blinking I-beam | Native blinking I-beam | Only in sidebar | **Native blinking I-beam** |
| **Visual Latency** | 0ms immediate DOM text | 0ms immediate DOM text | High (Requires clicking "Apply") | **0ms immediate local + debounced HarfBuzz vector** |
| **Font Preservation** | Embeds original or font match | Matches document font | Detects font, sidebar only | **Eager preloaded TrueType font + exact fallback** |
| **Complex Script (Khmer)** | Acrobat engine | Varies by cloud engine | Distorted (Double-rendering/clipping) | **HarfBuzz OpenType vector + native browser shaping** |
| **Toolbar Placement** | Contextual top bar / floating | Sticky top bar | Heavy right sidebar | **Unified contextual top bar + subtle canvas affordance** |
| **Disruption to Page** | None | None | Floating boxes covered text | **Zero occlusion; exact in-place overlay** |

---

## 4. Key UX Principles for Docera's Transformation

1. **Zero Occlusion Principle:**
   * Never render large white modals, floating toolbars with bulky buttons (`+128px`, `Done`, `Close`), or opaque boxes over neighboring lines.
   * The editable surface must exactly cover the target text block and seamlessly inherit page background and styling.

2. **Native Typography First:**
   * Never horizontally scale (`transform: scaleX`) or artificially squeeze complex scripts.
   * Provide adequate vertical line-height (`1.5` - `1.6`) and generous padding to ensure complex Khmer consonant clusters (subscript coengs like `ក្ក`, `ញ្ជ`, `ប្ដ`) and vowel marks (`ី`, `ឺ`, `ុ`, `ូ`) are never clipped.

3. **Two-Stage WYSIWYG Architecture:**
   * **Stage A (Typing):** Direct DOM input element with resolved TrueType font, responsive keyboard caret, native IME support, and instant visual feedback.
   * **Stage B (Authoritative):** On blur or debounced idle, PyMuPDF + HarfBuzz injects the exact vector glyph stream and PDF.js re-renders the crisp PDF page.

4. **Contextual Toolbars:**
   * Put primary formatting controls (Font family, Font size, Color, Bold, Align) in the top toolbar where the user's tools already live.
   * Keep the right sidebar for document info, page operations, and advanced parameters—users should never be forced into the sidebar for simple text changes.
