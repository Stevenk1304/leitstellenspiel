// LSS Sprechwunsch-Helfer
// Patienten (Fahrzeugfenster) und Gefangene (Alarmfenster): markiert das beste Ziel (passende
// Fachabteilung, freie Plätze, kurze Entfernung, wenig Abgabe) und springt nach dem Anfahren auf Wunsch
// direkt zum nächsten Fahrzeug mit Sprechwunsch. Das Ziel wählt immer der Spieler selbst.
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

    // Polizeifahrzeuge geben Gefangene im Alarmfenster ihres Einsatzes ab, alle anderen im Fahrzeugfenster
    const POLICE_BUILDINGS = [6, 11, 13, 17, 19, 24, 29];
    async function urlFor(vehicle) {
        const types = await lss.getVehicleTypes().catch(() => ({}));
        const police = (types[vehicle.vehicle_type]?.possibleBuildings ?? []).some(b => POLICE_BUILDINGS.includes(b));
        if (police && vehicle.target_type === 'mission' && vehicle.target_id) return `/missions/${vehicle.target_id}`;
        return `/vehicles/${vehicle.id}`;
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
        // Im Alarmfenster können mehrere Fahrzeuge Gefangene haben: erst die hier erledigen
        const done = new Set(loadDone().map(d => d.id));
        const moreHere = [...document.querySelectorAll('.prison-select[data-vehicle-id]')].some(s => !done.has(s.dataset.vehicleId));
        if (moreHere) {
            location.reload();
            return;
        }
        const next = await nextTalker(vehicleId);
        if (next) {
            location.href = await urlFor(next);
        } else {
            box.innerHTML = '<div class="sw-done">✔ Alle Sprechwünsche erledigt!</div>';
            setTimeout(() => location.reload(), 1500);
        }
    }

    function helperBox({ count, choice, kind, noneText }) {
        const e = lss.escapeHtml;
        const box = document.createElement('div');
        box.className = 'sw-box';
        box.innerHTML = `
            <div class="sw-head"><b>📻 Sprechwunsch-Helfer</b><span>${count} Ziele</span></div>
            ${choice ? `
            <div class="sw-best">
                <span>⭐</span>
                <div>
                    <div class="sw-name">${e(choice.name)}${choice.own ? '' : ' <small class="sw-meta">(Verband)</small>'}</div>
                    <div class="sw-meta"><b>${Number.isFinite(choice.dist) ? choice.dist.toLocaleString('de-DE') : '?'} km</b>
                        ${choice.free != null ? ` · <b>${choice.free}${choice.max ? ` / ${choice.max}` : ''}</b> frei` : ''}
                        ${choice.tax ? ` · ${choice.tax} % Abgabe` : ''}
                        ${kind === 'Krankenhaus' ? ' · Fachabteilung ✓' : ''}</div>
                </div>
                <a class="sw-go" href="${e(choice.link.getAttribute('href'))}">${kind === 'Krankenhaus' ? '🚑' : '🚔'} Anfahren</a>
            </div>` : `<div class="sw-none">${noneText}</div>`}
            <div class="sw-foot">
                <label><input type="checkbox" class="sw-auto" ${autoNext() ? 'checked' : ''}> Danach automatisch zum nächsten Sprechwunsch</label>
                <span class="sw-status" style="margin-left:auto"></span>
            </div>`;
        box.querySelector('.sw-auto').addEventListener('change', ev => {
            try { GM_setValue(AUTO_KEY, ev.target.checked); } catch (err) { /* kein Speicher */ }
        });
        return box;
    }

    // Klicks auf Anfahren-Links abfangen, wenn "automatisch weiter" an ist.
    // vehicleOf(link) liefert das Fahrzeug zum Link; pro Fenster wird nur einmal angefahren.
    function interceptClicks(selector, vehicleOf, boxOf) {
        let sent = false;
        document.addEventListener('click', ev => {
            const link = ev.target.closest(selector);
            if (!link || !autoNext()) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (sent) return;
            sent = true;
            const box = boxOf(link);
            approachAndNext(link.getAttribute('href'), vehicleOf(link), box).catch(err => {
                sent = false;
                lss.report('Sprechwunsch-Helfer', err);
                setStatus(box, 'Fehler, bitte von Hand anfahren');
            });
        }, true);
    }

    // Fahrzeugfenster: Patient ins Krankenhaus
    function initVehicle() {
        const m = location.pathname.match(/^\/vehicles\/(\d+)\/?$/);
        const heading = document.querySelector('#h2_sprechwunsch');
        if (!m || !heading) return;
        const vehicleId = m[1];
        // Krankenhäuser stehen in Tabellen, Zellen als Knöpfe ("Zelle wählen")
        let list = targets();
        if (!list.length) list = prisonButtons(document);
        if (!list.length) return;
        const choice = best(list);
        const kind = list[0].link.href.includes('/patient/') ? 'Krankenhaus' : 'Zelle';

        injectStyle();
        const box = helperBox({
            count: list.length, choice, kind,
            noneText: `Kein ${kind === 'Krankenhaus' ? 'Krankenhaus mit passender Fachabteilung und freien Betten' : 'Ziel mit freien Zellen'} gefunden.`,
        });
        (heading.closest('.alert') ?? heading).after(box);
        choice?.row?.classList.add('sw-row-best');
        if (choice && !choice.row) choice.link.style.outline = '3px solid #2ea043';
        interceptClicks(`${TARGET_LINK}, a[data-prison-id], .sw-go`, () => vehicleId, () => box);
    }

    // "Polizeistation Heringen(Freie Zellen: 2, Entfernung: 0,71 km, Abgabe an Besitzer: 0%)"
    const PRISON_TEXT = /^(.*?)\s*\(\s*Freie Zellen:\s*(\d+)\s*,\s*Entfernung:\s*([\d.,]+)\s*km(?:\s*,\s*Abgabe an Besitzer:\s*(\d+)\s*%)?\s*\)/i;

    // Zellen-Knöpfe eines Fahrzeugs; alles nach der Überschrift "Verbandszellen" gehört dem Verband
    function prisonTargets(select) {
        const list = [];
        let own = true;
        for (const el of select.children) {
            if (/^H\d$/.test(el.tagName) && /verband/i.test(el.textContent)) own = false;
            if (!el.matches('a[data-prison-id]')) continue;
            const m = el.textContent.replace(/\s+/g, ' ').trim().match(PRISON_TEXT);
            if (!m) continue;
            list.push({
                link: el, row: null, own, dept: true, name: m[1].trim(),
                free: Number(m[2]), max: null,
                dist: parseFloat(m[3].replace(',', '.')),
                tax: Number(m[4] ?? 0),
            });
        }
        return list;
    }

    // Zellen-Knöpfe im Fahrzeugfenster; alles hinter der Überschrift "Verbandszellen" gehört dem Verband
    function prisonButtons(root) {
        const verband = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,b,strong,p,div,span,label')]
            .find(el => !el.children.length && /^\s*Verbandszellen\s*:?\s*$/i.test(el.textContent));
        const list = [];
        const seen = new Set();
        root.querySelectorAll('a[data-prison-id], a[href*="/gefangener/"], a[href*="/prisoner/"]').forEach(el => {
            if (seen.has(el) || el.closest('.sw-box')) return;
            seen.add(el);
            const href = el.getAttribute('href') || '';
            if (!href || href === '#') return;
            const m = el.textContent.replace(/\s+/g, ' ').trim().match(PRISON_TEXT);
            if (!m) return;
            const own = !verband || !(verband.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
            list.push({
                link: el, row: null, own, dept: true, name: m[1].trim(),
                free: Number(m[2]), max: null,
                dist: parseFloat(m[3].replace(',', '.')),
                tax: Number(m[4] ?? 0),
            });
        });
        return list;
    }

    // Alarmfenster: Gefangene in eine Zelle (ein Block pro Polizeifahrzeug mit Gefangenen)
    function initMission() {
        if (!/^\/missions\/\d+/.test(location.pathname)) return;
        const selects = [...document.querySelectorAll('.prison-select[data-vehicle-id]')];
        if (!selects.length) return;
        injectStyle();
        for (const select of selects) {
            const list = prisonTargets(select);
            if (!list.length) continue;
            const choice = best(list);
            const box = helperBox({ count: list.length, choice, kind: 'Zelle', noneText: 'Keine Zelle mit freien Plätzen gefunden.' });
            box.dataset.vehicleId = select.dataset.vehicleId;
            select.before(box);
            if (choice) choice.link.style.outline = '3px solid #2ea043';
        }
        interceptClicks(
            '.prison-select a[data-prison-id], .sw-box[data-vehicle-id] .sw-go',
            link => link.closest('[data-vehicle-id]').dataset.vehicleId,
            link => {
                const id = link.closest('[data-vehicle-id]').dataset.vehicleId;
                return document.querySelector(`.sw-box[data-vehicle-id="${id}"]`) ?? document.createElement('div');
            },
        );
    }

    if (lss.isWorkerFrame) return;
    lss.safe('Sprechwunsch-Helfer', initVehicle)();
    lss.safe('Sprechwunsch-Helfer (Gefangene)', initMission)();
})();
