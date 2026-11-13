// LSS Patienten-Übersicht
// Listet alle Einsätze aus der Einsatzliste, bei denen Patienten noch auf Fahrzeuge warten
// ("Wir benötigen: RTW, NEF"), z.B. offene Übergabeorte nach Bergeinsätzen. Ein Klick öffnet den Einsatz.
// Liest nur die Einsatzliste der Hauptseite, alarmiert nichts.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const STYLE = `
        .pt-list { overflow:auto; flex:1; padding:6px 0 12px; }
        .pt-section { color:#8b929c; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:12px 18px 6px; }
        .pt-row { display:grid; grid-template-columns:minmax(0,1.4fr) 90px minmax(0,1fr); align-items:center; gap:12px; padding:8px 18px; font-size:13px; border-bottom:1px solid #2e3238; }
        .pt-row:hover { background:#2a2e34; }
        .pt-name { color:#fff !important; font-weight:600; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pt-name:hover { text-decoration:underline; }
        .pt-addr { display:block; color:#8b929c; font-size:11px; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pt-count { color:#e6e6e6; font-variant-numeric:tabular-nums; }
        .pt-needs { display:flex; flex-wrap:wrap; gap:4px; }
        .pt-need { background:#6b2b28; color:#ffd2cf; border-radius:4px; padding:1px 7px; font-size:12px; font-weight:600; }
        .pt-ok { color:#5cd178; }
        .pt-tag { margin-left:6px; background:#7a5a1f; color:#fff; border-radius:4px; padding:0 5px; font-size:10px; font-weight:600; }
        .pt-empty { padding:30px; text-align:center; color:#8b929c; }
        .pt-foot { padding:8px 18px; color:#8b929c; font-size:11px; border-top:1px solid #3a3f47; }
    `;

    function injectStyle() {
        if (document.getElementById('pt-style')) return;
        const style = document.createElement('style');
        style.id = 'pt-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const ONCE = /^(LNA|OrgL)$/i;

    // "Wir benötigen: NEF, RTW" → ['NEF', 'RTW']
    const needsOf = text => (text.match(/Wir benötigen:\s*(.+)/i)?.[1] ?? '')
        .split(/,\s*|\s+und\s+/).map(s => s.trim()).filter(Boolean);

    // Alle Einsätze der Einsatzliste mit Patienten
    function readMissions() {
        const out = [];
        document.querySelectorAll('.missionSideBarEntry').forEach(entry => {
            const id = entry.getAttribute('mission_id');
            const box = document.getElementById(`mission_patients_${id}`);
            if (!id || !box || !box.textContent.trim()) return;
            let info = {};
            try { info = JSON.parse(entry.getAttribute('data-sortable-by') || '{}'); } catch (e) { /* egal */ }
            const needs = {};
            const add = (name, n) => { needs[name] = (needs[name] || 0) + n; };
            let patients = 0;
            let waiting = 0;
            const cards = [...box.querySelectorAll('[id^="patient_"]')].filter(el => /^patient_\d+$/.test(el.id));
            if (cards.length) {
                for (const card of cards) {
                    patients++;
                    const list = needsOf(card.querySelector('[id^="patients_missing_"]')?.textContent ?? '');
                    if (list.length) waiting++;
                    list.forEach(n => add(n, 1));
                }
            } else {
                // Zusammengefasst bei vielen Patienten: "13 Patienten 13x Wir benötigen: LNA"
                const text = box.textContent.replace(/\s+/g, ' ');
                patients = Number(text.match(/(\d+)\s+Patient/i)?.[1] ?? 0);
                for (const m of text.matchAll(/(\d+)\s*x\s*Wir benötigen:\s*([^0-9]+)/gi)) {
                    const n = Number(m[1]);
                    waiting += n;
                    needsOf(`Wir benötigen: ${m[2]}`).forEach(name => add(name, n));
                }
            }
            if (!patients) return;
            // LNA und OrgL braucht der ganze Einsatz nur einmal, nicht jeder Patient
            for (const name of Object.keys(needs)) if (ONCE.test(name)) needs[name] = 1;
            const caption = info.caption || document.getElementById(`mission_caption_${id}`)?.firstChild?.textContent.replace(/,\s*$/, '').trim() || 'Einsatz';
            out.push({
                id, caption, patients, waiting, needs,
                address: document.getElementById(`mission_address_${id}`)?.textContent.trim() ?? '',
                href: entry.querySelector('.mission-alarm-button')?.getAttribute('href') || `/missions/${id}`,
                handover: /Übergabe/i.test(caption),
                alliance: !!entry.closest('#mission_list_alliance, #mission_list_alliance_event, #mission_list_sicherheitswache_alliance'),
            });
        });
        return out;
    }

    function rowHtml(m) {
        const e = lss.escapeHtml;
        const needs = Object.entries(m.needs).sort((a, b) => b[1] - a[1]);
        return `
            <div class="pt-row">
                <a class="pt-name lightbox-open" href="${e(m.href)}">${e(m.caption)}${m.handover ? '<span class="pt-tag">⛰ Übergabe</span>' : ''}${m.alliance && !/^\[Verband\]/.test(m.caption) ? '<span class="pt-tag" style="background:#2b4a6b">Verband</span>' : ''}
                    <span class="pt-addr">${e(m.address)}</span></a>
                <span class="pt-count">${m.patients} Patient${m.patients === 1 ? '' : 'en'}</span>
                <span class="pt-needs">${needs.length
                    ? needs.map(([n, c]) => `<span class="pt-need">${c}× ${e(n)}</span>`).join('')
                    : '<span class="pt-ok">✓ versorgt / in Behandlung</span>'}</span>
            </div>`;
    }

    function start() {
        if (!document.querySelector('.missionSideBarEntry, #missions')) {
            alert('Die Patienten-Übersicht liest die Einsatzliste. Bitte auf der Hauptseite (Karte mit Einsatzliste) öffnen.');
            return;
        }
        injectStyle();
        const panel = lss.openPanel({ title: 'Patienten-Übersicht', count: '', body: '<div class="pt-list"></div><div class="pt-foot">Aktualisiert sich alle paar Sekunden. Klick auf einen Einsatz öffnet ihn.</div>' });
        const list = panel.root.querySelector('.pt-list');
        const count = panel.root.closest('.lssr-dialog').querySelector('.lssr-count');
        let last = '';
        const draw = () => {
            const missions = readMissions();
            const waiting = missions.filter(m => Object.keys(m.needs).length)
                .sort((a, b) => b.handover - a.handover || b.waiting - a.waiting);
            const treated = missions.filter(m => !Object.keys(m.needs).length);
            const html = `
                <div class="pt-section">Warten auf Fahrzeuge (${waiting.length})</div>
                ${waiting.length ? waiting.map(rowHtml).join('') : '<div class="pt-empty">✔ Kein Patient wartet gerade auf ein Fahrzeug.</div>'}
                ${treated.length ? `<div class="pt-section">Versorgt oder in Behandlung (${treated.length})</div>${treated.map(rowHtml).join('')}` : ''}`;
            const sum = waiting.reduce((s, m) => s + m.waiting, 0);
            count.textContent = `${sum} Patient${sum === 1 ? '' : 'en'} warten · ${waiting.length} Einsätze`;
            if (html !== last) {
                list.innerHTML = html;
                last = html;
            }
        };
        draw();
        const timer = setInterval(() => {
            if (!document.body.contains(list)) return clearInterval(timer);
            draw();
        }, 3000);
        // Erst nach dem Klick schließen: das Spiel öffnet das Alarmfenster nur, solange der Link noch auf der Seite ist
        list.addEventListener('click', e => { if (e.target.closest('.pt-name')) setTimeout(panel.close, 0); });
    }

    lss.actions.patients = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '🚑 Patienten-Übersicht', scope: 'all', order: 46, run: start });
})();
