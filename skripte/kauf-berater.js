// LSS Kauf-Berater: "Was soll ich als Nächstes kaufen?"
// Merkt sich, welche Einsätze bei dir vorkommen (geöffnete Einsätze und die Einsatzliste der Hauptseite)
// und wofür "Fehlendes auswählen" kein freies Fahrzeug gefunden hat. Daraus wird berechnet,
// welche Fahrzeuge oft gebraucht werden, aber bei dir knapp sind.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js und einsatz-helfer.js.

(function () {
    'use strict';

    const MISSIONS_KEY = 'kaufBerater.missions';
    const SHORTAGES_KEY = 'kaufBerater.shortages';
    const KEEP_DAYS = 14;
    const MAX_ENTRIES = 5000;
    // Wie oft die Einsatzliste der Hauptseite nach neuen Einsätzen durchsucht wird
    const SCAN_SECONDS = 60;

    // Wo man ein Fahrzeug kaufen kann: Gebäudetyp-Nummern des Spiels → kurzer Name.
    // Kleinwachen zählen wie die normale Wache, Komplexe werden nicht extra genannt.
    const BUILDING_NAMES = {
        0: 'Feuerwache', 18: 'Feuerwache', 2: 'Rettungswache', 20: 'Rettungswache', 5: 'RTH-Station',
        6: 'Polizeiwache', 19: 'Polizeiwache', 9: 'THW', 11: 'Bereitschaftspolizei', 12: 'SEG',
        13: 'Polizeihubschrauber-Station', 15: 'Wasserrettung', 17: 'Polizei-Sondereinheiten',
        21: 'Rettungshundestaffel', 24: 'Reiterstaffel', 25: 'Bergrettung', 26: 'Seenotrettung',
        28: 'Seenot-Hubschrauberstation', 29: 'Autobahnpolizei',
    };

    // Alle Wachenarten, an denen irgendein passendes Fahrzeug gekauft werden kann
    function whereToBuy(typeIds, types) {
        const names = new Set();
        for (const t of typeIds) {
            for (const b of types[t]?.possibleBuildings ?? []) if (BUILDING_NAMES[b]) names.add(BUILDING_NAMES[b]);
        }
        return [...names];
    }

    const now = () => Date.now();
    const cutoff = () => now() - KEEP_DAYS * 864e5;
    const load = key => { try { return GM_getValue(key, []); } catch (e) { return []; } };
    const save = (key, list) => {
        try { GM_setValue(key, list.filter(x => x.t >= cutoff()).slice(-MAX_ENTRIES)); } catch (e) { /* kein Speicher */ }
    };

    // Ein Einsatz zählt nur einmal, egal wie oft er geöffnet oder in der Liste gesehen wird
    function recordMission(id, type) {
        const list = load(MISSIONS_KEY);
        if (list.some(x => x.id === String(id))) return;
        list.push({ id: String(id), type: String(type), t: now() });
        save(MISSIONS_KEY, list);
    }

    // Engpass: für diese Anforderung war bei diesem Einsatz kein freies Fahrzeug da (pro Einsatz einmal)
    function recordShortage(missionId, key) {
        const list = load(SHORTAGES_KEY);
        if (list.some(x => x.id === String(missionId) && x.key === key)) return;
        list.push({ id: String(missionId), key, t: now() });
        save(SHORTAGES_KEY, list);
    }

    // Einsatzliste der Hauptseite: Einträge tragen ihre Einsatzart im Attribut mission_type_id
    function scanMissionList() {
        document.querySelectorAll('.missionSideBarEntry[mission_type_id]').forEach(el => {
            const id = el.getAttribute('mission_id') ?? el.id?.match(/\d+/)?.[0];
            const type = el.getAttribute('mission_type_id');
            if (id && type && type !== 'null') recordMission(id, type);
        });
    }

    const STYLE = `
        .kb-body { overflow:auto; flex:1; }
        .kb-intro { padding:12px 18px; color:#aab0b8; font-size:13px; border-bottom:1px solid #3a3f47; background:#1c1f23; }
        .kb-intro b { color:#fff; }
        .kb-table { width:100%; border-collapse:collapse; font-size:13px; }
        .kb-table th { position:sticky; top:0; background:#22252a; color:#8b929c; font-weight:600; font-size:11px; text-transform:uppercase; text-align:right; padding:8px 10px; border-bottom:1px solid #3a3f47; white-space:nowrap; }
        .kb-table th:first-child, .kb-table td:first-child { text-align:left; padding-left:18px; }
        .kb-table th:last-child, .kb-table td:last-child { padding-right:18px; }
        .kb-table td { padding:7px 10px; border-bottom:1px solid #2e3238; text-align:right; font-variant-numeric:tabular-nums; }
        .kb-table tr:hover td { background:#2a2e34; }
        .kb-name { color:#fff; font-weight:600; }
        .kb-where { display:block; color:#8b929c; font-size:11px; font-weight:400; margin-top:2px; }
        .kb-zero { color:#4b5058; }
        .kb-badge { display:inline-block; border-radius:999px; padding:2px 10px; font-size:11px; font-weight:700; white-space:nowrap; }
        .kb-buy { background:#c9302c; color:#fff; }
        .kb-more { background:rgba(230,162,60,.2); color:#f0b75e; }
        .kb-ok { background:rgba(46,160,67,.15); color:#5cd178; }
        .kb-short { color:#ff8a84; font-weight:700; }
        .kb-empty { padding:30px 18px; text-align:center; color:#8b929c; }
    `;

    function injectStyle() {
        if (document.getElementById('kb-style')) return;
        const style = document.createElement('style');
        style.id = 'kb-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    // Bedarf je Anforderung: in wie vielen Einsätzen gebraucht (Wahrscheinlichkeit anteilig) und wie viele auf einmal
    function analyse(missions, shortages, missionTypes, vehicles, REQ, types) {
        const stats = {};
        const get = key => stats[key] ??= { key, missions: 0, peak: 0, shortages: 0 };
        let known = 0;
        for (const rec of missions) {
            const m = missionTypes[rec.type] ?? missionTypes[rec.type.split(/[-/]/)[0]];
            if (!m) continue;
            known++;
            const keys = new Set([...Object.keys(m.req), ...Object.keys(m.chances)]);
            for (const key of keys) {
                if (!REQ[key]?.[1]?.length) continue;
                const needed = typeof m.req[key] === 'number' ? m.req[key] : 1;
                const chance = m.chances[key] != null ? m.chances[key] / 100 : 1;
                const s = get(key);
                s.missions += chance;
                s.peak = Math.max(s.peak, needed);
            }
        }
        for (const sh of shortages) if (REQ[sh.key]?.[1]?.length) get(sh.key).shortages++;

        const countByType = {};
        for (const v of vehicles) countByType[v.vehicle_type] = (countByType[v.vehicle_type] || 0) + 1;

        const rows = Object.values(stats).map(s => {
            const [label, typeIds] = REQ[s.key];
            const have = typeIds.reduce((n, t) => n + (countByType[t] || 0), 0);
            // Je mehr Einsätze pro vorhandenem Fahrzeug und je mehr Engpässe, desto dringender
            // "Zu wenige auf einmal" zählt erst, wenn es mehr als ein Einzelfall war
            const tooFew = have < s.peak && s.missions >= 2;
            const score = s.shortages * 5 + s.missions / Math.max(have, 0.5) + (tooFew ? 10 : 0);
            const verdict = have === 0 || tooFew ? 'buy' : s.shortages > 0 ? 'more' : 'ok';
            return { ...s, label, have, score, verdict, where: whereToBuy(typeIds, types) };
        });
        rows.sort((a, b) => ({ buy: 0, more: 1, ok: 2 }[a.verdict] - { buy: 0, more: 1, ok: 2 }[b.verdict]) || b.score - a.score);
        return { rows, known };
    }

    async function start() {
        const REQ = lss.actions.missionRequirements;
        if (!REQ || !lss.actions.missionTypes) throw new Error('Einsatz-Helfer ist nicht geladen');
        const [missionTypes, vehicles, types] = await Promise.all([
            lss.actions.missionTypes(), lss.getJSON('/api/vehicles'), lss.getVehicleTypes().catch(() => ({})),
        ]);
        scanMissionList();
        const missions = load(MISSIONS_KEY).filter(x => x.t >= cutoff());
        const shortages = load(SHORTAGES_KEY).filter(x => x.t >= cutoff());
        const { rows, known } = analyse(missions, shortages, missionTypes, vehicles, REQ, types);
        const since = missions.length ? new Date(Math.min(...missions.map(x => x.t))).toLocaleDateString('de-DE') : null;
        const e = lss.escapeHtml;
        const fmt = n => (Math.round(n * 10) / 10).toLocaleString('de-DE');
        const badge = { buy: '<span class="kb-badge kb-buy">Kaufen!</span>', more: '<span class="kb-badge kb-more">Mehr davon</span>', ok: '<span class="kb-badge kb-ok">reicht</span>' };

        injectStyle();
        lss.openPanel({
            title: '🛒 Was soll ich als Nächstes kaufen?',
            count: `${known} Einsätze ausgewertet`,
            body: `
                <div class="kb-intro">${known
                    ? `Grundlage: <b>${known}</b> Einsätze seit <b>${since}</b> und <b>${shortages.length}</b> Engpässe aus „Fehlendes auswählen“. Je länger du spielst, desto genauer wird die Empfehlung.`
                    : 'Noch keine Daten. Der Kauf-Berater merkt sich ab jetzt die Einsätze in deiner Einsatzliste und jeden Einsatz, den du öffnest. Schau in ein paar Stunden wieder rein.'}</div>
                <div class="kb-body">${rows.length ? `
                    <table class="kb-table">
                        <thead><tr><th>Fahrzeug</th><th title="In wie vielen Einsätzen gebraucht (Wahrscheinlichkeiten anteilig)">Einsätze</th><th title="Höchstens auf einmal gebraucht">Max.</th><th>Du hast</th><th title="Kein freies Fahrzeug bei „Fehlendes auswählen“">Engpässe</th><th></th></tr></thead>
                        <tbody>${rows.map(r => `
                            <tr>
                                <td class="kb-name">${e(r.label)}${r.where.length ? `<span class="kb-where">🏠 ${e(r.where.join(', '))}</span>` : ''}</td>
                                <td>${fmt(r.missions)}</td>
                                <td>${r.peak}</td>
                                <td class="${r.have ? '' : 'kb-short'}">${r.have}</td>
                                <td class="${r.shortages ? 'kb-short' : 'kb-zero'}">${r.shortages}</td>
                                <td>${badge[r.verdict]}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>` : '<div class="kb-empty">Noch nichts auszuwerten.</div>'}
                </div>`,
        });
    }

    lss.actions.recordMission = recordMission;
    lss.actions.recordShortage = recordShortage;
    lss.actions.buyAdvice = start;

    if (lss.isWorkerFrame) return;

    // Auf der Hauptseite regelmäßig die Einsatzliste mitschreiben
    if (window === window.top && document.querySelector('#missions, #mission_list')) {
        const scan = lss.safe('Kauf-Berater (Einsatzliste)', scanMissionList);
        scan();
        setInterval(scan, SCAN_SECONDS * 1000);
    }

    lss.addTool({ label: '🛒 Was soll ich kaufen?', scope: 'all', order: 48, run: start });
})();
