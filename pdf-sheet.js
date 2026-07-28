/* ===========================================================
   pdf-sheet.js — Embedded fillable PDF character sheet.

    - Renders assets/Wanted_Character_Sheet_Form_Fillable (4).pdf onto a canvas
     for every visible sheet card using pdf.js.
   - For every AcroForm widget on the page, creates an HTML <input>/
     <textarea>/<checkbox> positioned at the widget's exact PDF
     coordinates so editing happens "inside" the form.
   - Field changes call back into app.js so values land in
     sheet.pdfFields[fieldName] and propagate via the existing
     Firebase sync pipeline (sync.js → applyRemoteState).
   - "Download Filled PDF" uses pdf-lib to write the same values
     into a real copy of the PDF for printing.
   =========================================================== */
(function () {
  const PDF_URL = 'assets/Wanted_Character_Sheet_Form_Fillable (4).pdf';
  const PREVIEW_URL = 'assets/Wanted_Character_Sheet_Form_Fillable_4_preview.jpg';
  const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MAX_BITMAP_WIDTH = 1224;
  const CALCULATED_FIELDS = new Set([
    'strength_mod',
    'dexterity_mod',
    'constitution_mod',
    'intelligence_mod',
    'wisdom_mod',
    'charisma_mod',
  ]);

  function isCalculatedField(fieldName) {
    return CALCULATED_FIELDS.has(fieldName) || /^skill_.+_modifier$/.test(fieldName);
  }

  if (!window.pdfjsLib) {
    console.warn('[pdf-sheet] pdf.js global (pdfjsLib) is missing. Sheets will not render.');
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;

  // --- module-level caches ----------------------------------------------------
  let _pdfBytesPromise = null; // ArrayBuffer of the source PDF (for pdf-lib too)
  let _pdfDocPromise = null;   // pdf.js PDFDocumentProxy
  let _previewPromise = null;  // Fast raster background for the heavy source artwork
  const _mounts = new Map();   // sheetId -> { card, sheet, onChange, canEdit, fields: Map<name, el> }

  function loadPdfBytes() {
    if (!_pdfBytesPromise) {
      _pdfBytesPromise = fetch(PDF_URL).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch PDF: ' + r.status);
        return r.arrayBuffer();
      });
    }
    return _pdfBytesPromise;
  }

  function loadPdfDoc() {
    if (!_pdfDocPromise) {
      _pdfDocPromise = loadPdfBytes().then((buf) =>
        // pdf.js mutates the buffer — give it its own copy.
        pdfjsLib.getDocument({ data: buf.slice(0) }).promise
      );
    }
    return _pdfDocPromise;
  }

  function loadPreview() {
    if (!_previewPromise) {
      _previewPromise = fetch(PREVIEW_URL).then((response) => {
        if (!response.ok) throw new Error('Failed to fetch PDF preview: ' + response.status);
        return response.blob();
      }).then((blob) => createImageBitmap(blob));
    }
    return _previewPromise;
  }

  function setStatus(card, text) {
    const el = card.querySelector('.pdf-sheet-status');
    if (el) el.textContent = text || '';
  }

  function fitFieldText(el) {
    if (!el || el.type === 'checkbox') return;

    const styles = getComputedStyle(el);
    const verticalSpace = el.clientHeight
      - parseFloat(styles.paddingTop)
      - parseFloat(styles.paddingBottom);
    const maxSize = Math.max(4, Math.min(24, verticalSpace / 1.1));
    let low = Math.min(4, maxSize);
    let high = maxSize;

    for (let i = 0; i < 7; i += 1) {
      const size = (low + high) / 2;
      el.style.fontSize = size + 'px';
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) {
        low = size;
      } else {
        high = size;
      }
    }
    el.style.fontSize = low + 'px';
  }

  /* Build one HTML input/textarea/checkbox for a single AcroForm widget. */
  function buildWidget(annotation, viewport, currentValue, canEdit) {
    const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(annotation.rect);
    const left = Math.min(vx1, vx2);
    const top = Math.min(vy1, vy2);
    const width = Math.abs(vx2 - vx1);
    const height = Math.abs(vy2 - vy1);

    let el;
    if (annotation.fieldType === 'Btn' && annotation.checkBox) {
      el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = Boolean(currentValue);
    } else {
      if (annotation.multiLine) {
        el = document.createElement('textarea');
      } else {
        el = document.createElement('input');
        el.type = 'text';
        if (annotation.maxLen) el.maxLength = annotation.maxLen;
      }
      el.value = currentValue != null ? String(currentValue) : '';
    }
    el.className = 'pdf-field' + (el.type === 'checkbox' ? ' pdf-check' : '');
    el.dataset.field = annotation.fieldName;
    el.spellcheck = false;
    if (!canEdit) el.disabled = true;
    if (isCalculatedField(annotation.fieldName)) el.readOnly = true;
    Object.assign(el.style, {
      position: 'absolute',
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px',
    });
    return el;
  }

  /* Render the PDF page to canvas + overlay an HTML widget for every field. */
  async function renderInto(card, sheet, onChange, canEdit) {
    const wrap = card.querySelector('.pdf-sheet-wrap');
    if (!wrap) return;
    setStatus(card, 'Loading fillable character sheet…');

    let pdf;
    try {
      pdf = await loadPdfDoc();
    } catch (e) {
      console.error('[pdf-sheet] failed to load PDF', e);
      setStatus(card, 'Could not load PDF: ' + (e?.message || e));
      return;
    }
    const page = await pdf.getPage(1);

    // Pick a render scale that targets the wrapper's current visible width.
    const baseVp = page.getViewport({ scale: 1 });
    const targetWidth = wrap.clientWidth || baseVp.width;
    const scale = targetWidth / baseVp.width;
    const viewport = page.getViewport({ scale });

    const canvas = card.querySelector('canvas.pdf-sheet-canvas');
    const layer = card.querySelector('.pdf-sheet-widgets');
    if (!canvas || !layer) return;

    // Account for hi-DPI screens for the canvas bitmap, but keep CSS size
    // in viewport pixels so widget coordinates line up.
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_BITMAP_WIDTH / viewport.width);
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    layer.style.width = viewport.width + 'px';
    layer.style.height = viewport.height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const preview = await loadPreview();
    ctx.drawImage(preview, 0, 0, viewport.width, viewport.height);

    // Build widgets from the annotations.
    layer.innerHTML = '';
    const annotations = await page.getAnnotations();
    const fieldEls = new Map();

    for (const a of annotations) {
      if (a.subtype !== 'Widget' || !a.fieldName) continue;
      const stored = sheet.pdfFields ? sheet.pdfFields[a.fieldName] : undefined;
      const el = buildWidget(a, viewport, stored, canEdit);
      layer.appendChild(el);
      fitFieldText(el);
      fieldEls.set(a.fieldName, el);

      if (canEdit) {
        const fire = () => {
          fitFieldText(el);
          const v = el.type === 'checkbox' ? el.checked : el.value;
          try { onChange(a.fieldName, v); } catch (err) { console.error(err); }
        };
        if (el.type === 'checkbox') {
          el.addEventListener('change', fire);
        } else {
          el.addEventListener('input', fire);
          el.addEventListener('change', fire);
        }
      }
    }

    wrap.dataset.pdfMount = 'ready';
    setStatus(card, '');

    const entry = _mounts.get(sheet.id);
    if (entry) {
      Object.assign(entry, { card, sheet, onChange, canEdit, fields: fieldEls, renderWidth: viewport.width });
    }
  }

  /* Public: mount the fillable PDF into a card. */
  function mount(card, sheet, opts) {
    const onChange = (opts && opts.onChange) || (() => {});
    const canEdit = !!(opts && opts.canEdit);
    const previous = _mounts.get(sheet.id);
    if (previous && previous.resizeObserver) previous.resizeObserver.disconnect();

    const entry = { card, sheet, onChange, canEdit, fields: new Map(), renderWidth: 0, rendering: false, pending: false };
    _mounts.set(sheet.id, entry);

    const renderAtCurrentWidth = () => {
      const wrap = card.querySelector('.pdf-sheet-wrap');
      const width = wrap ? wrap.clientWidth : 0;
      if (!width || Math.abs(width - entry.renderWidth) < 1) return;
      if (entry.rendering) {
        entry.pending = true;
        return;
      }
      entry.rendering = true;
      const fresh = (window.__getState ? window.__getState().playerSheets : [])
        .find((candidate) => candidate && candidate.id === sheet.id) || entry.sheet;
      renderInto(card, fresh, onChange, canEdit).catch((e) => {
        console.error('[pdf-sheet] mount failed', e);
        setStatus(card, 'Render failed: ' + (e?.message || e));
      }).finally(() => {
        entry.rendering = false;
        if (entry.pending) {
          entry.pending = false;
          renderAtCurrentWidth();
        }
      });
    };

    entry.resizeObserver = new ResizeObserver(renderAtCurrentWidth);
    entry.resizeObserver.observe(card.querySelector('.pdf-sheet-wrap'));
    entry.renderAtCurrentWidth = renderAtCurrentWidth;
    renderAtCurrentWidth();
  }

  function renderVisible() {
    for (const entry of _mounts.values()) {
      if (!entry.card.hidden && entry.renderAtCurrentWidth) entry.renderAtCurrentWidth();
    }
  }

  /* Public: push remote field values back into the rendered widgets.
     Skips the currently-focused element so live typing isn't clobbered. */
  function refreshAll() {
    for (const [sheetId, entry] of _mounts.entries()) {
      // The sheet object reference can be stale after applyRemoteState
      // (which deletes/repopulates state). Re-resolve by id.
      const fresh = (window.__getState ? window.__getState().playerSheets : [])
        .find((s) => s && s.id === sheetId);
      if (!fresh) {
        // Sheet was deleted remotely — drop our entry; the next render pass
        // will rebuild any remaining cards.
        _mounts.delete(sheetId);
        continue;
      }
      entry.sheet = fresh;
      const fields = fresh.pdfFields || {};
      entry.fields.forEach((el, name) => {
        if (el === document.activeElement) return;
        const val = fields[name];
        if (el.type === 'checkbox') {
          const next = Boolean(val);
          if (el.checked !== next) el.checked = next;
        } else {
          const next = val != null ? String(val) : '';
          if (el.value !== next) {
            el.value = next;
            fitFieldText(el);
          }
        }
      });
    }
  }

  /* Public: generate a filled copy of the PDF for download. */
  async function download(sheet) {
    if (!window.PDFLib) throw new Error('pdf-lib not loaded');
    const buf = await loadPdfBytes();
    const doc = await PDFLib.PDFDocument.load(buf.slice(0));
    const form = doc.getForm();
    const fields = (sheet && sheet.pdfFields) || {};
    for (const f of form.getFields()) {
      const name = f.getName();
      const v = fields[name];
      if (v === undefined || v === null) continue;
      try {
        if (f instanceof PDFLib.PDFCheckBox) {
          if (v) f.check(); else f.uncheck();
        } else if (typeof f.setText === 'function') {
          f.setText(String(v));
        }
      } catch (e) {
        console.warn('[pdf-sheet] could not write field', name, e?.message);
      }
    }
    const out = await doc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (sheet?.pdfFields?.character_name || sheet?.name || sheet?.player || 'character')
      .toString().replace(/[^a-z0-9_\-]+/gi, '_');
    a.href = url;
    a.download = `wanted_${safe}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.pdfSheet = { mount, refreshAll, renderVisible, download };
})();
