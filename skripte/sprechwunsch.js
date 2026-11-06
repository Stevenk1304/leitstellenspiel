// LSS Sprechwunsch-Helfer
// Im Fahrzeugfenster mit Sprechwunsch: markiert das beste Ziel (passende Fachabteilung, freie Plätze,
// kurze Entfernung, wenig Abgabe) und springt nach dem Anfahren auf Wunsch direkt zum nächsten
// Fahrzeug mit Sprechwunsch. Das Ziel wählt immer der Spieler selbst.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const AUTO_KEY = 'sprechwunsch.autoNext';
    // Gerade bearbeitete Fahrzeuge; die API meldet sie noch ein paar Sekunden als Status 5
    const DONE_KEY = 'sprechwunsch.done';
    const DONE_SECONDS = 120;
    // 25 % Abgabe an den Verband zählen wie 5 km Umweg
    const KM_PER_PERCENT_TAX = 0.2;
    // Links zum Anfahren: Patienten ins Krankenhaus, Gefangene in eine Zelle
    const TARGET_LINK = 'a[href*="/patient/"], a[href*="/gefangener/"], a[href*="/prisoner/"]';

    const STYLE = `
        .sw-box { margin:10px 0; background:#22252a; color:#e6e6e6; border:1px solid #3a3f47; border-radius:8px; overflow:hidden; font-size:13px; }
        .sw-head { display:flex; align-items:center; gap:10px; padding:8px 12px; background:linear-gradient(135deg,var(--lssr-accent,#c9302c),var(--lssr-accent-dark,#8f1f1c)); color:#fff; }
        .sw-head b { flex:1; font-size:14px; }
        .sw-best { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 12px; }
        .sw-best .sw-name { color:#fff; font-weight:700; font-size:15px; }
        .sw-meta { color:#aab0b8; }
        .sw-meta b { color:#fff; }
        .sw-go { margin-left:auto; background:#2ea043; color:#fff !important; border:0; border-radius:6px; padding:7px 16px; font-weight:700; text-decoration:none !important; cursor:pointer; }
        .sw-go:hover { filter:brightness(1.15); }
        .sw-foot { display:flex; align-items:center; gap:10px; padding:7px 12px; border-top:1px solid #3a3f47; background:#1c1f23; color:#aab0b8; flex-wrap:wrap; }
        .sw-foot label { margin:0; font-weight:normal; cursor:pointer; display:flex; align-items:center; gap:6px; }
        .sw-foot input { margin:0; }
        .sw-none { padding:10px 12px; color:#ff8a84; }
        tr.sw-row-best td { box-shadow:inset 0 2px 0 #2ea043, inset 0 -2px 0 #2ea043; background:rgba(46,160,67,.12) !important; }
        tr.sw-row-best td:first-child { box-shadow:inset 2px 2px 0 #2ea043, inset 0 -2px 0 #2ea043; }
        .sw-done { padding:12px; color:#5cd178; font-weight:700; }
    `;

    function injectStyle() {
        if (document.getElementById('sw-style')) return;
        const style = document.createElement('style');
        style.id = 'sw-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const autoNext = () => { try { return GM_getValue(AUTO_KEY, true); } catch (e) { return true; } };

    // Spaltennummern anhand der Überschriften finden
    function columns(table) {
        const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim().toLowerCase());
        const find = re => heads.findIndex(h => re.test(h));
        return { dist: find(/entfernung/), free: find(/frei/), dept: find(/fachabteilung/), tax: find(/abgabe/) };
    }

    const cellText = (row, i) => (i >= 0 ? row.cells[i]?.textContent.replace(/\s+/g, ' ').trim() ?? '' : '');

    // Alle möglichen Ziele aus den Tabellen des Fensters
    function targets() {
        const list = [];
        document.querySelectorAll('table').forEach(table => {
            if (!table.querySelector(TARGET_LINK)) return;
            const col = columns(table);
            const own = /own/.test(table.id) || col.tax < 0;
            table.querySelectorAll('tbody tr').forEach(row => {
                const link = row.querySelector(TARGET_LINK);
                if (!link) return;
                const free = cellText(row, col.free).match(/(\d+)\s*\/\s*(\d+)/);
                const deptCell = col.dept >= 0 ? row.cells[col.dept] : null;
                const dept = deptCell ? !!deptCell.querySelector('.label-success') || /\bja\b/i.test(deptCell.textContent) : true;
                list.push({
                    row, link, own, dept,
                    name: (row.cells[0]?.childNodes[0]?.textContent ?? row.cells[0]?.textContent ?? '').trim(),
                    dist: parseFloat(cellText(row, col.dist).replace(',', '.')) || Infinity,
                    free: free ? Number(free[1]) : null,
                    max: free ? Number(free[2]) : null,
                    tax: parseFloat(cellText(row, col.tax)) || 0,
                });
            });
        });
        return list;
    }

    // Bestes Ziel: passende Fachabteilung und freie Plätze, dann Entfernung plus Abgabe-Umweg
    function best(list) {
        const ok = list.filter(t => t.dept && (t.free == null || t.free > 0));
        const cost = t => t.dist + t.tax * KM_PER_PERCENT_TAX;
        return ok.sort((a, b) => cost(a) - cost(b) || (b.own - a.own))[0] ?? null;
    }

    const loadDone = () => {
        try {
            const list = JSON.parse(sessionStorage.getItem(DONE_KEY) || '[]');
            return list.filter(d => Date.now() - d.t < DONE_SECONDS * 1000);
        } catch (e) { return []; }
    };
    const markDone = id => {
        try { sessionStorage.setItem(DONE_KEY, JSON.stringify([...loadDone(), { id: String(id), t: Date.now() }])); } catch (e) { /* kein Speicher */ }
    };

    // Nächstes Fahrzeug mit Sprechwunsch; frisch geladen, weil sich Status schnell ändern
    async function nextTalker(currentId) {
        const r = await fetch('/api/vehicles', { credentials: 'include' });
        if (!r.ok) throw new Error(`/api/vehicles: HTTP ${r.status}`);
        const done = new Set([String(currentId), ...loadDone().map(d => d.id)]);
        return (await r.json()).filter(v => v.fms_real === 5 && !done.has(String(v.id))).sort((a, b) => a.id - b.id)[0] ?? null;
    }

    const setStatus = (box, text) => {
        const el = box.querySelector('.sw-status');
        if (el) el.textContent = text;
    };

    // Ziel anfahren und danach zum nächsten Sprechwunsch springen. Ohne weiteren Sprechwunsch wird
    // dieses Fenster neu geladen, damit keine veraltete Ziel-Liste mehr zum Anklicken dasteht.
    async function approachAndNext(href, vehicleId, box) {
        setStatus(box, 'Fahre an …');
        const r = await fetch(href, { credentials: 'include' });
        if (!r.ok) throw new Error(`Anfahren: HTTP ${r.status}`);
        markDone(vehicleId);
        const next = await nextTalker(vehicleId);
        if (next) {
            location.href = `/vehicles/${next.id}`;
        } else {
            box.innerHTML = '<div class="sw-done">✔ Alle Sprechwünsche erledigt!</div>';
            setTimeout(() => location.reload(), 1500);
        }
    }

    function init() {
        const m = location.pathname.match(/^\/vehicles\/(\d+)\/?$/);
        const heading = document.querySelector('#h2_sprechwunsch');
        if (!m || !heading) return;
        const vehicleId = m[1];
        const list = targets();
        if (!list.length) return;
        const choice = best(list);
        const e = lss.escapeHtml;
        const kind = list[0].link.href.includes('/patient/') ? 'Krankenhaus' : 'Zelle';

        injectStyle();
        const box = document.createElement('div');
        box.className = 'sw-box';
        box.innerHTML = `
            <div class="sw-head"><b>📻 Sprechwunsch-Helfer</b><span>${list.length} Ziele</span></div>
            ${choice ? `
            <div class="sw-best">
                <span>⭐</span>
                <div>
                    <div class="sw-name">${e(choice.name)}${choice.own ? '' : ' <small class="sw-meta">(Verband)</small>'}</div>
                    <div class="sw-meta"><b>${Number.isFinite(choice.dist) ? choice.dist.toLocaleString('de-DE') : '?'} km</b>
                        ${choice.free != null ? ` · <b>${choice.free} / ${choice.max}</b> frei` : ''}
                        ${choice.tax ? ` · ${choice.tax} % Abgabe` : ''}
                        ${kind === 'Krankenhaus' ? ' · Fachabteilung ✓' : ''}</div>
                </div>
                <a class="sw-go" href="${e(choice.link.getAttribute('href'))}">${kind === 'Krankenhaus' ? '🚑' : '🚔'} Anfahren</a>
            </div>` : `<div class="sw-none">Kein ${kind === 'Krankenhaus' ? 'Krankenhaus mit passender Fachabteilung und freien Betten' : 'Ziel mit freien Zellen'} gefunden.</div>`}
            <div class="sw-foot">
                <label><input type="checkbox" class="sw-auto" ${autoNext() ? 'checked' : ''}> Danach automatisch zum nächsten Sprechwunsch</label>
                <span class="sw-status" style="margin-left:auto"></span>
            </div>`;
        (heading.closest('.alert') ?? heading).after(box);
        choice?.row.classList.add('sw-row-best');

        box.querySelector('.sw-auto').addEventListener('change', ev => {
            try { GM_setValue(AUTO_KEY, ev.target.checked); } catch (err) { /* kein Speicher */ }
        });

        // Jeder Anfahren-Klick (unser Knopf oder einer in den Tabellen) springt danach weiter, wenn eingeschaltet.
        // Nur ein Anfahren pro Fenster: weitere Klicks während oder nach dem Anfahren werden ignoriert.
        let sent = false;
        document.addEventListener('click', ev => {
            const link = ev.target.closest(`${TARGET_LINK}, .sw-go`);
            if (!link || !autoNext()) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (sent) return;
            sent = true;
            approachAndNext(link.getAttribute('href'), vehicleId, box).catch(err => {
                sent = false;
                lss.report('Sprechwunsch-Helfer', err);
                setStatus(box, 'Fehler, bitte von Hand anfahren');
            });
        }, true);
    }

    if (lss.isWorkerFrame) return;
    lss.safe('Sprechwunsch-Helfer', init)();
})();
