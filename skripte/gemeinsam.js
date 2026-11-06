// Gemeinsame Hilfsfunktionen und das Fenster-Design für alle LSS-Skripte.
// Muss im Lade-Skript als erstes @require stehen.

/* exported lss */
const lss = (() => {
    'use strict';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content;

    const getJSON = url => fetch(url, { credentials: 'include' }).then(r => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.json();
    });

    // Fahrzeugtypen von der LSSM-API (Kurzname, Besatzung, Ausbildungen), nur einmal pro Seite geladen
    let vehicleTypes;
    const getVehicleTypes = () => vehicleTypes ??= new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.lss-manager.de/de_DE/vehicles',
            onload: r => {
                try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); }
            },
            onerror: reject,
        });
    });

    const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Unsichtbare Hilfsfenster der Skripte selbst sollen keine Knöpfe bekommen
    const isWorkerFrame = window.name === 'lss-worker';

    const STYLE = `
        .lssr-overlay { position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center;
            background:rgba(0,0,0,.65); backdrop-filter:blur(2px); font-family:"Helvetica Neue",Arial,sans-serif; animation:lssr-fade .15s ease-out; }
        .lssr-dialog { width:min(640px,94vw); max-height:86vh; display:flex; flex-direction:column; overflow:hidden;
            background:#22252a; color:#e6e6e6; border:1px solid #3a3f47; border-radius:10px; box-shadow:0 20px 60px rgba(0,0,0,.6); }
        .lssr-head { display:flex; align-items:center; gap:10px; padding:14px 18px; background:linear-gradient(135deg,#c9302c,#8f1f1c); color:#fff; }
        .lssr-head h3 { margin:0; font-size:17px; font-weight:600; flex:1; }
        .lssr-count { background:rgba(255,255,255,.2); border-radius:999px; padding:2px 10px; font-size:13px; font-weight:600; }
        .lssr-x { background:none; border:0; color:#fff; font-size:22px; line-height:1; cursor:pointer; opacity:.8; padding:0 2px; }
        .lssr-x:hover { opacity:1; }
        .lssr-list { overflow:auto; flex:1; padding:6px 0; }
        .lssr-row { display:grid; grid-template-columns:minmax(0,1fr) 22px minmax(0,1.4fr) 30px; align-items:center; gap:8px;
            padding:8px 18px; border-bottom:1px solid #2e3238; font-size:14px; transition:background .2s; }
        .lssr-row:last-child { border-bottom:0; }
        .lssr-row:hover { background:#2a2e34; }
        .lssr-old { color:#8b929c; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lssr-arrow { color:#c9302c; text-align:center; font-weight:700; }
        .lssr-new { color:#fff; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lssr-state { min-width:22px; height:22px; padding:0 4px; box-sizing:border-box; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; }
        .lssr-row.busy .lssr-state { width:22px; border:2px solid #555; border-top-color:#c9302c; animation:lssr-spin .7s linear infinite; }
        .lssr-row.ok { background:rgba(46,160,67,.08); }
        .lssr-row.ok .lssr-state { background:#2ea043; color:#fff; }
        .lssr-row.skip .lssr-state { background:#3a3f47; color:#aab0b8; }
        .lssr-row.err { background:rgba(201,48,44,.12); }
        .lssr-row.err .lssr-state { background:#c9302c; color:#fff; cursor:help; }
        .lssr-empty { padding:30px 18px; text-align:center; color:#8b929c; }
        .lssr-foot { padding:12px 18px 16px; border-top:1px solid #3a3f47; background:#1c1f23; }
        .lssr-bar { height:6px; background:#33373e; border-radius:999px; overflow:hidden; margin-bottom:10px; display:none; }
        .lssr-bar > div { height:100%; width:0; background:linear-gradient(90deg,#c9302c,#e8584f); transition:width .25s; }
        .lssr-status { font-size:13px; color:#aab0b8; min-height:18px; margin-bottom:12px; }
        .lssr-status.done { color:#5cd178; font-weight:600; }
        .lssr-actions { display:flex; gap:8px; justify-content:flex-end; }
        .lssr-btn { border:0; border-radius:6px; padding:8px 16px; font-size:14px; font-weight:600; cursor:pointer; transition:filter .15s, opacity .15s; }
        .lssr-btn:hover:not(:disabled) { filter:brightness(1.15); }
        .lssr-btn:disabled { opacity:.45; cursor:default; }
        .lssr-btn-ghost { background:#33373e; color:#e6e6e6; }
        .lssr-btn-primary { background:#c9302c; color:#fff; }
        @keyframes lssr-spin { to { transform:rotate(360deg); } }
        @keyframes lssr-fade { from { opacity:0; } }
    `;

    function injectStyle() {
        if (document.getElementById('lssr-style')) return;
        const style = document.createElement('style');
        style.id = 'lssr-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    // Fenster mit Liste "links → rechts" und Start-Knopf.
    // run(api) wird beim Klick auf Start aufgerufen und arbeitet die Zeilen ab.
    function openDialog({ title, count, rows, empty, hint, startLabel, run }) {
        injectStyle();
        const overlay = document.createElement('div');
        overlay.className = 'lssr-overlay';
        overlay.innerHTML = `
            <div class="lssr-dialog">
                <div class="lssr-head">
                    <h3>${escapeHtml(title)}</h3>
                    <span class="lssr-count">${escapeHtml(count)}</span>
                    <button class="lssr-x" title="Schließen">×</button>
                </div>
                <div class="lssr-list">${rows.length
                    ? rows.map((r, i) => `
                        <div class="lssr-row" data-row="${i}">
                            <span class="lssr-old" title="${escapeHtml(r.left)}">${escapeHtml(r.left)}</span>
                            <span class="lssr-arrow">→</span>
                            <span class="lssr-new" title="${escapeHtml(r.right)}">${escapeHtml(r.right)}</span>
                            <span class="lssr-state"></span>
                        </div>`).join('')
                    : `<div class="lssr-empty">✔ ${escapeHtml(empty)}</div>`}
                </div>
                <div class="lssr-foot">
                    <div class="lssr-bar"><div></div></div>
                    <div class="lssr-status">${rows.length ? escapeHtml(hint) : ''}</div>
                    <div class="lssr-actions">
                        <button class="lssr-btn lssr-btn-ghost lssr-close">Schließen</button>
                        <button class="lssr-btn lssr-btn-primary lssr-start" ${rows.length ? '' : 'disabled'}>${escapeHtml(startLabel)}</button>
                    </div>
                </div>
            </div>`;
        document.body.append(overlay);

        const status = overlay.querySelector('.lssr-status');
        const bar = overlay.querySelector('.lssr-bar');
        const startBtn = overlay.querySelector('.lssr-start');
        const closeBtn = overlay.querySelector('.lssr-close');
        const rowEl = i => overlay.querySelector(`[data-row="${i}"]`);
        let running = false, finished = false, cancelled = false;

        const close = () => {
            cancelled = true;
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            if (finished) location.reload();
        };
        const onKey = e => { if (e.key === 'Escape' && !running) close(); };
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.lssr-x').onclick = close;
        closeBtn.onclick = close;
        overlay.onclick = e => { if (e.target === overlay && !running) close(); };

        const api = {
            cancelled: () => cancelled,
            busy(i) {
                rowEl(i).classList.add('busy');
                rowEl(i).scrollIntoView({ block: 'nearest' });
            },
            // state: 'ok' | 'skip' | 'err'
            done(i, state, badge, tooltip = '') {
                const row = rowEl(i);
                row.classList.remove('busy');
                row.classList.add(state);
                row.querySelector('.lssr-state').textContent = badge;
                row.querySelector('.lssr-state').title = tooltip;
            },
            setRight(i, text) {
                const el = rowEl(i).querySelector('.lssr-new');
                el.textContent = text;
                el.title = text;
            },
            progress(doneCount, text) {
                bar.firstElementChild.style.width = `${(doneCount / rows.length) * 100}%`;
                status.textContent = text;
            },
        };

        startBtn.onclick = async () => {
            running = true;
            startBtn.disabled = true;
            closeBtn.textContent = 'Abbrechen';
            bar.style.display = 'block';
            let summary;
            try {
                summary = await run(api);
            } catch (e) {
                summary = `Abgebrochen: ${e.message}`;
            }
            running = false;
            finished = true;
            status.classList.add('done');
            status.textContent = summary;
            closeBtn.textContent = 'Schließen & neu laden';
            closeBtn.classList.replace('lssr-btn-ghost', 'lssr-btn-primary');
            startBtn.style.display = 'none';
        };
    }

    // Knopf auf einer Spielseite einfügen
    function addPageButton(target, label, onClick) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-xs btn-danger';
        btn.textContent = label;
        btn.style.cssText = 'margin:6px 6px 6px 0;font-weight:600;border-radius:4px';
        btn.onclick = e => {
            e.preventDefault();
            onClick();
        };
        target.before(btn);
        return btn;
    }

    return { sleep, csrfToken, getJSON, getVehicleTypes, escapeHtml, isWorkerFrame, openDialog, addPageButton };
})();
