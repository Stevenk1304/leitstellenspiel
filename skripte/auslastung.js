// LSS Krankenhaus- und Zellen-Auslastung
// Liest von jeder Krankenhaus- und Polizeiseite, wie viele Betten bzw. Zellen belegt sind.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const HOSPITAL = 4;
    // Gebäudetypen mit Zellen und wie viele Zellen sie ohne Ausbau haben
    const CELL_TYPES = { 6: 0, 16: 1, 19: 0, 29: 0 };
    // So viele Gebäudeseiten werden gleichzeitig geladen
    const PARALLEL = 4;

    const STYLE = `
        .al-summary { display:flex; gap:10px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid #3a3f47; background:#1c1f23; }
        .al-tile { flex:1; min-width:200px; background:#2a2e34; border:1px solid #3a3f47; border-radius:8px; padding:10px 14px; }
        .al-tile b { display:block; font-size:22px; color:#fff; font-variant-numeric:tabular-nums; }
        .al-tile span { color:#8b929c; font-size:12px; }
        .al-list { overflow:auto; flex:1; padding:6px 0 12px; }
        .al-section { color:#8b929c; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:12px 18px 6px; }
        .al-row { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 70px 46px; align-items:center; gap:12px; padding:7px 18px; font-size:13px; border-bottom:1px solid #2e3238; }
        .al-row:hover { background:#2a2e34; }
        .al-name { color:#fff !important; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration:none; }
        .al-name:hover { text-decoration:underline; }
        .al-meter { height:8px; border-radius:4px; background:#33373e; overflow:hidden; }
        .al-meter > div { height:100%; border-radius:4px; transition:width .3s; }
        .al-num { text-align:right; color:#e6e6e6; font-variant-numeric:tabular-nums; }
        .al-pct { text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }
        .al-muted { color:#8b929c; }
        .al-loading { padding:30px; text-align:center; color:#8b929c; }
    `;

    function injectStyle() {
        if (document.getElementById('al-style')) return;
        const style = document.createElement('style');
        style.id = 'al-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const color = pct => pct >= 90 ? '#c9302c' : pct >= 70 ? '#e6a23c' : '#2ea043';

    async function loadPage(id) {
        const r = await fetch(`/buildings/${id}`, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return new DOMParser().parseFromString(await r.text(), 'text/html');
    }

    // "Derzeit liegen 4 Patienten in der Notaufnahme ... maximal 30 Patienten aufnehmen."
    function readHospital(doc) {
        const text = doc.body.textContent.replace(/\s+/g, ' ');
        const m = text.match(/(\d+)\s+Patienten[^.]*\.[^.]*?maximal\s+(\d+)\s+Patienten/i);
        return m ? { used: Number(m[1]), max: Number(m[2]) } : null;
    }

    // Belegte Zellen: bisher kein Beispiel mit Gefangenen gesehen, deshalb vorsichtig nach Text suchen
    function readCells(doc) {
        const text = doc.body.textContent.replace(/\s+/g, ' ');
        const m = text.match(/(\d+)\s+(?:Gefangene|Häftlinge|Personen in Gewahrsam)/i);
        return m ? Number(m[1]) : null;
    }

    function cellCapacity(b) {
        const built = (b.extensions ?? []).filter(e => /zelle/i.test(e.caption) && e.available && e.enabled).length;
        return CELL_TYPES[b.building_type] + built;
    }

    async function pool(items, worker, onEach) {
        let next = 0;
        await Promise.all(Array.from({ length: PARALLEL }, async () => {
            while (next < items.length) {
                const item = items[next++];
                try { await worker(item); } catch (e) { item.error = e.message; }
                onEach();
            }
        }));
    }

    function rowHtml(r) {
        const e = lss.escapeHtml;
        const known = r.used != null && r.max > 0;
        const pct = known ? Math.round((r.used / r.max) * 100) : null;
        return `
            <div class="al-row">
                <a class="al-name lightbox-open" href="/buildings/${r.b.id}">${e(r.b.caption)}</a>
                <div class="al-meter">${known ? `<div style="width:${Math.min(pct, 100)}%;background:${color(pct)}"></div>` : ''}</div>
                <span class="al-num">${known ? `${r.used} / ${r.max}` : `<span class="al-muted" title="${e(r.error || 'Belegung nicht lesbar')}">? / ${r.max ?? '?'}</span>`}</span>
                <span class="al-pct" style="color:${known ? color(pct) : '#8b929c'}">${known ? `${pct}%` : ''}</span>
            </div>`;
    }

    function tile(label, list) {
        const known = list.filter(r => r.used != null);
        const used = known.reduce((s, r) => s + r.used, 0);
        const max = known.reduce((s, r) => s + r.max, 0);
        const pct = max ? Math.round((used / max) * 100) : 0;
        return `<div class="al-tile"><span>${label}</span><b style="color:${max ? color(pct) : '#fff'}">${used} / ${max}</b><span>${max ? `${pct}% belegt` : 'keine Daten'}${known.length < list.length ? ` · ${list.length - known.length} nicht lesbar` : ''}</span></div>`;
    }

    async function start() {
        let buildings;
        try {
            buildings = await lss.getJSON('/api/buildings');
        } catch (e) {
            alert(`Auslastung: Fehler beim Laden der Daten\n${e.message}`);
            return;
        }
        const hospitals = buildings.filter(b => b.building_type === HOSPITAL).map(b => ({ b, used: null, max: null }));
        const cells = buildings.filter(b => b.building_type in CELL_TYPES && cellCapacity(b) > 0).map(b => ({ b, used: null, max: cellCapacity(b) }));
        const total = hospitals.length + cells.length;

        injectStyle();
        const panel = lss.openPanel({
            title: 'Krankenhaus- & Zellen-Auslastung',
            count: `${hospitals.length} Krankenhäuser · ${cells.length} mit Zellen`,
            body: '<div class="al-summary"></div><div class="al-list"><div class="al-loading">Lade Gebäude … 0 von ' + total + '</div></div>',
        });
        const list = panel.root.querySelector('.al-list');
        let done = 0;

        await pool([...hospitals, ...cells], async r => {
            const doc = await loadPage(r.b.id);
            if (r.b.building_type === HOSPITAL) {
                const h = readHospital(doc);
                if (!h) throw new Error('Bettenanzeige nicht gefunden');
                r.used = h.used;
                r.max = h.max;
            } else {
                r.used = readCells(doc);
            }
        }, () => {
            const loading = list.querySelector('.al-loading');
            if (loading) loading.textContent = `Lade Gebäude … ${++done} von ${total}`;
        });

        const byLoad = (a, b) => (b.used ?? -1) / (b.max || 1) - (a.used ?? -1) / (a.max || 1) || a.b.caption.localeCompare(b.b.caption);
        panel.root.querySelector('.al-summary').innerHTML = tile('🏥 Betten belegt', hospitals) + tile('🚔 Zellen belegt', cells);
        list.innerHTML = `
            ${hospitals.length ? `<div class="al-section">Krankenhäuser</div>${hospitals.sort(byLoad).map(rowHtml).join('')}` : ''}
            ${cells.length ? `<div class="al-section">Zellen</div>${cells.sort(byLoad).map(rowHtml).join('')}` : ''}
            ${total ? '' : '<div class="al-loading">Keine Krankenhäuser oder Zellen gefunden.</div>'}`;
        list.addEventListener('click', e => { if (e.target.closest('.al-name')) panel.close(); });
    }

    lss.actions.occupancy = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '🏥 Krankenhaus- & Zellen-Auslastung', scope: 'all', order: 45, run: start });
})();
