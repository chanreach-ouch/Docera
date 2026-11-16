# Docera — Premium UI/UX Frontend Audit

## 1. Overview & Audit Scope

This audit evaluates the complete frontend of Docera (`frontend/src`), covering the application shell, dashboard, PDF editor, individual tool workspaces, typography, accessibility, responsive behavior, and micro-interactions.

---

## 2. Priority Defect & Friction Inventory

### 2.1 Dashboard & Navigation (Priority: High)
1. **Redundant & Fragmented Sidebar Links:**
   - The sidebar contains anchor links (`/#tools`, `/#recent`) that cause page jumps rather than dedicated views or smooth filter transitions.
   - Tool links in the sidebar are a flat list without visual categorization or active badge count.
2. **Repetitive "Ready" Badges & Visual Noise:**
   - Every single card in the tool directory displays a `Ready` badge. Across 18 cards, this creates cognitive fatigue without imparting new information.
   - Tool cards have an isolated small link (`Open tool ->`) at the bottom instead of the entire card surface being an intuitive, accessible hit target.
3. **Hero & Quick Access Competition:**
   - The "Ready when you are" quick access grid duplicates tools from the main directory below, forcing the user to process the same choices twice.
4. **Accordion Overuse in Tool Directory:**
   - Using `<details open>` for every category creates unnecessary nested summary bars and expand/collapse icons that break the visual rhythm.

### 2.2 PDF Editor Workspace (Flagship Experience — Priority: Critical)
1. **Toolbar Overcrowding & Cognitive Overload:**
   - Over 25 tools are packed into a single horizontal toolbar. On viewports below 1400px, icons wrap or cause horizontal overflow.
   - Lack of clear tool grouping: View tools (zoom, pan, fit) are intermingled with Object tools (draw, rect, line) and Native Text Editing tools.
2. **Contextual Text Editing Bar Polish:**
   - The contextual toolbar appears when editing text, but requires tighter grouping, a clear font-family dropdown with Khmer script labeling, precise size stepper, accessible color swatches, and alignment toggles.
3. **Canvas Focus & Distraction:**
   - The document canvas needs to feel like a high-end drafting table: clean subtle canvas background (`#F8FAFC` / dark `#101817`), crisp drop shadow on document pages, smooth collapsible page thumbnail rail, and clear zoom controls.
4. **Direct On-Page Editing Perfection:**
   - Must preserve the direct in-document editing with caret placement, Khmer Unicode normalization (0 dotted circles), and automatic word wrapping at the right margin.

### 2.3 Typography & Design Tokens (Priority: High)
1. **Khmer UI Font Stack:**
   - While PDF document fonts load KhmerOS fonts for rendering text content, the application UI itself lacked a modern Khmer web font fallback (such as `Kantumruy Pro` / `Noto Sans Khmer`), resulting in inconsistent UI text on devices without Khmer OS installed.
2. **Type Scale & Hierarchy:**
   - Missing explicit semantic typographic tokens for Page Titles (`28px/1.2`), Section Headings (`20px/1.3`), Subheads (`15px/1.4`), Body Text (`14px/1.5`), and Metadata/Badges (`11-12px/1.4`).
3. **Selection & Focus Theming:**
   - `::selection` was default OS blue instead of branded Docera forest green (`#23665a` with light foreground).
   - Scrollbars were default OS gray.

### 2.4 Tool Workspaces (Organize, Compress, Convert, Forms & Sign, Security)
1. **Inconsistent Header Banners:**
   - Each workspace had slightly different padding, header layout, and back navigation.
2. **File Selection Drag-and-Drop:**
   - Drop zones varied in height, dashed border width, and empty state iconography.

---

## 3. Prioritized Transformation Plan

1. **Phase 1: Design Tokens & Global System Architecture**
   - Expand `frontend/src/styles/app.css` with a complete semantic token system (backgrounds, surfaces, borders, text, brand accents, radius, shadows, typography scale, focus rings).
   - Implement custom scrollbars, themed text selection, and smooth transitions.
   - Add `@font-face` / font-family rules for `Kantumruy Pro` and `Noto Sans Khmer` UI fallbacks.

2. **Phase 2: Premium Dashboard Transformation**
   - Clean, elegant, confident hero with streamlined upload zone.
   - Instant search with tag filter pills (All, Edit, Organize, Convert, Optimize, Sign, Protect).
   - Entire tool cards become interactive with hover elevation, refined typography, and clear action affordances.
   - Recent documents shelf with quick actions, timestamps, and thumbnail previews.

3. **Phase 3: Flagship PDF Editor Transformation**
   - Document-first layout: 85%+ viewport dedicated to PDF canvas.
   - Clean top header: Document title pill, auto-save status, Zoom controls, and prominent primary Export PDF button.
   - Segmented secondary toolbar: Cursor/Select, Edit Text (Primary), Annotate, Forms & Sign.
   - Polished contextual formatting bar: Font selector, size stepper, color swatches, text alignment.
   - Collapsible thumbnail sidebar with smooth toggle.

4. **Phase 4: Tool Workspaces & Responsive Polish**
   - Unify workspace headers with consistent layout and back-to-workspace affordances.
   - Responsive layouts tested from 360px mobile to 1920px desktop.
   - WCAG 2.2 AA accessibility verification.
