// LSS Einsatz-Helfer
// Zeigt im Alarmfenster, was der Einsatz braucht, was schon vor Ort ist, anfährt oder ausgewählt ist,
// und was noch fehlt. Datenquelle: /einsaetze.json des Spiels (einmal am Tag geladen).
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Bei Änderungen am gespeicherten Format die Nummer erhöhen, damit neu geladen wird
    const CACHE_KEY = 'einsatzHelfer.missions.v2';
    const CACHE_HOURS = 24;

    // Fahrzeuggruppen (Typ-Nummern aus der LSSM-API). Nach bestem Wissen zugeordnet;
    // bei Abweichungen im Spiel hier anpassen.
    const LF = [0, 1, 6, 7, 8, 9, 30, 37, 88, 89, 90, 107, 163];
    const RW = [4, 30, 47, 90, 162, 163];
    const FUSTW = [32, 103, 184];

    // Anforderung → Bezeichnung und Fahrzeugtypen, die sie erfüllen
    const REQ = {
        firetrucks: ['Löschfahrzeuge', LF],
        battalion_chief_vehicles: ['ELW 1', [3, 34, 78, 128, 129]],
        mobile_command_vehicles: ['ELW 2', [34, 78, 129]],
        platform_trucks: ['Drehleitern', [2, 85]],
        heavy_rescue_vehicles: ['Rüstwagen', RW],
        mobile_air_vehicles: ['GW-Atemschutz', [5, 48]],
        water_tankers: ['Schlauchwagen', [11, 13, 14, 15, 16, 62, 143]],
        gwoil: ['GW-Öl', [10, 49]],
        gwmess: ['GW-Messtechnik', [12]],
        hazmat_vehicles: ['GW-Gefahrgut', [27, 77]],
        hazmat_dekon: ['Dekon-P', [53, 54]],
        height_rescue_units: ['GW-Höhenrettung', [33, 155, 158]],
        fwk: ['Feuerwehrkran', [57]],
        ventilation: ['Lüfter', [114, 115, 116]],
        brush_truck: ['Waldbrand-TLF', [187, 188, 189]],
        wildfire_equipment: ['Waldbrand-Ausrüstung', [190, 191, 192]],
        railway_fire: ['Schienen-Fahrzeuge', [162, 163, 164]],
        arff: ['Flugfeldlöschfahrzeuge', [75]],
        rettungstreppe: ['Rettungstreppen', [76]],
        gw_werkfeuerwehr: ['GW-Werkfeuerwehr', [83]],
        ulf: ['ULF mit Löscharm', [84]],
        teleskopmast: ['Teleskopmasten', [85]],
        turboloescher: ['Turbolöscher', [86]],
        helicopter_bucket: ['Außenlastbehälter', [96]],
        drone: ['Drohnen', [126, 127, 128, 129]],
        oneof_fire_engine_or_rescue: ['Löschfahrzeug oder Rüstwagen', [...LF, ...RW]],
        oneof_fire_engine_or_rescue_or_oil_equipment: ['LF, RW oder GW-Öl', [...LF, ...RW, 10, 49]],
        ambulances: ['RTW', [28, 73, 74]],
        nef: ['NEF', [29, 74, 31, 149]],
        helicopter: ['RTH', [31, 157]],
        gw_san: ['GW-San', [60]],
        seg_elw: ['ELW 1 (SEG)', [59]],
        police_cars: ['Funkstreifenwagen', FUSTW],
        police_motorcycle: ['Polizeimotorräder', [95]],
        civil_patrolcar: ['Zivilstreifenwagen', [98]],
        highway_police: ['FuStW (Autobahnpolizei)', [184]],
        oneof_police_patrol_or_motorcycle: ['FuStW oder Motorrad', [...FUSTW, 95]],
        oneof_police_patrol_or_civil_patrol: ['FuStW oder Zivilstreife', [...FUSTW, 98]],
        oneof_police_patrol_or_civil_patrol_or_motorcycle: ['FuStW, Zivilstreife oder Motorrad', [...FUSTW, 95, 98]],
        police_service_group_leader: ['FuStW (DGL)', [103]],
        police_speaker: ['Lautsprecherwagen', [165]],
        k9: ['Diensthundeführer', [94]],
        police_horse: ['Reiterstaffel', [134, 135, 136]],
        grukw: ['GruKw', [50]],
        lebefkw: ['leBefKw', [35]],
        gefkw: ['GefKw', [52]],
        fukw: ['FüKW (Polizei)', [51]],
        wasserwerfer: ['Wasserwerfer', [72]],
        police_helicopters: ['Polizeihubschrauber', [61, 156]],
        mek: ['MEK-Fahrzeuge', [81, 82]],
        sek: ['SEK-Fahrzeuge', [79, 80]],
        thw_gkw: ['GKW', [39]],
        thw_mtwtz: ['MTW-TZ', [40]],
        thw_mzkw: ['MzGW (FGr N)', [41]],
        thw_lkw: ['LKW K 9', [42]],
        thw_brmg_r: ['BRmG R', [43]],
        thw_dle: ['Anh DLE', [44]],
        heavy_rescue: ['MzGW SB', [109]],
        thw_command: ['FüKW (THW)', [144]],
        thw_command_2: ['FüKomKW', [145]],
        thw_command_trailer: ['Anh FüLa', [146]],
        thw_command_3: ['FmKW', [147]],
        thw_command_4: ['MTW-FGr K', [148]],
        energy_supply: ['NEA 50', [110, 111, 175, 179]],
        energy_supply_2: ['NEA 200', [112, 113, 180]],
        water_damage_pump: ['Schmutzwasserpumpen', [101]],
        thw_bridge_construction_equipment: ['MzGW (FGr BrB)', [181]],
        thw_bridge_construction_crane: ['Mobilkran', [182]],
        thw_bridge_construction_trailer: ['Anh Plattform', [183]],
        disaster_response_technology_equipment: ['GW-TeSi', [171]],
        disaster_response_technology_crew: ['MTW-TeSi', [173]],
        disaster_response_technology_trailer: ['Anh TeSi', [174]],
        rescue_dog_units: ['Rettungshunde', [91, 92]],
        boats: ['Boote', [66, 70, 71]],
        diver_units: ['Taucher', [63, 69]],
        mountain: ['GW-Bergrettung', [149, 150]],
        mountain_height_rescue: ['Höhenrettung (Berg)', [155, 158]],
        mountain_command: ['ELW Bergrettung', [151]],
        mountain_snow: ['Schneefahrzeuge', [154]],
        mountain_atv: ['ATV', [152]],
        mountain_equipment: ['Bergrettungs-Ausrüstung', []],
        coastal_helicopter: ['Hubschrauber (Seenot)', [161]],
        coastal_boat_large: ['Seenotrettungskreuzer', [159]],
        oneof_coastal_rescue_boat_or_boat_large: ['Seenotrettungsboot/-kreuzer', [159, 160]],
        animal_rescue: ['Tierrettung', [185, 186]],
        pump: ['Pumpen', []],
        min_pump_speed: ['Mindest-Pumpleistung (l/min)', []],
        lift: ['Hubrettung', []],
        patient_transport: ['Krankentransport', []],
        patient_other_treatment: ['Sonstige Behandlung', []],
    };

    // Mindestpersonal pro Organisation; welche Gebäude zu welcher Organisation gehören
    const ORGS = {
        fire: { label: 'Personal (Feuerwehr)', buildings: [0, 18] },
        ambulance: { label: 'Personal (Rettungsdienst)', buildings: [2, 5, 12, 20] },
        police: { label: 'Personal (Polizei)', buildings: [6, 11, 13, 17, 19, 24, 29] },
        thw: { label: 'Personal (THW)', buildings: [9] },
    };

    // Organisation eines Fahrzeugtyps; Rettungsdienst und Polizei zuerst, weil z.B. ein RTW auch an Feuerwachen stehen kann
    function orgOf(type) {
        const at = type?.possibleBuildings ?? [];
        return ['ambulance', 'police', 'thw', 'fire'].find(o => ORGS[o].buildings.some(b => at.includes(b))) ?? null;
    }

    const STYLE = `
        .eh-box { margin:10px 0; background:#22252a; color:#e6e6e6; border:1px solid #3a3f47; border-radius:8px; overflow:hidden; font-size:13px; }
        .eh-head { display:flex; align-items:center; gap:10px; padding:8px 12px; background:linear-gradient(135deg,#c9302c,#8f1f1c); color:#fff; cursor:pointer; user-select:none; }
        .eh-head b { flex:1; font-size:14px; }
        .eh-pill { background:rgba(255,255,255,.2); border-radius:999px; padding:1px 9px; font-size:12px; font-weight:600; white-space:nowrap; }
        .eh-pill.ok { background:#2ea043; } .eh-pill.miss { background:#fff; color:#c9302c; }
        .eh-box.collapsed .eh-body { display:none; }
        .eh-table { width:100%; border-collapse:collapse; }
        .eh-table th { color:#8b929c; font-weight:600; font-size:11px; text-transform:uppercase; text-align:right; padding:6px 10px; border-bottom:1px solid #3a3f47; }
        .eh-table th:first-child, .eh-table td:first-child { text-align:left; padding-left:12px; }
        .eh-table td { padding:5px 10px; border-bottom:1px solid #2e3238; text-align:right; font-variant-numeric:tabular-nums; }
        .eh-table tr.miss td:first-child { border-left:3px solid #c9302c; padding-left:9px; }
        .eh-table tr.done td:first-child { border-left:3px solid #2ea043; padding-left:9px; }
        .eh-table tr.maybe td { color:#aab0b8; }
        .eh-zero { color:#4b5058; }
        .eh-missing { color:#ff8a84; font-weight:700; }
        .eh-ok { color:#5cd178; font-weight:700; }
        .eh-chance { color:#e6a23c; font-size:11px; margin-left:4px; }
        .eh-info { display:flex; flex-wrap:wrap; gap:6px 16px; padding:8px 12px; color:#aab0b8; border-top:1px solid #3a3f47; background:#1c1f23; }
        .eh-info b { color:#fff; }
        .eh-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:8px 12px; border-top:1px solid #3a3f47; }
        .eh-pick { background:#2ea043; color:#fff; border:0; border-radius:6px; padding:6px 14px; font-weight:600; cursor:pointer; }
        .eh-pick:hover { filter:brightness(1.15); }
        .eh-msg { color:#aab0b8; }
        .eh-msg b { color:#fff; }
    `;

    function injectStyle(doc) {
        if (doc.getElementById('eh-style')) return;
        const style = doc.createElement('style');
        style.id = 'eh-style';
        style.textContent = STYLE;
        doc.head.append(style);
    }

    // Einsatzarten aus /einsaetze.json, verkleinert und einen Tag lang in Tampermonkey zwischengespeichert
    async function getMissionTypes() {
        const cached = GM_getValue(CACHE_KEY, null);
        if (cached && Date.now() - cached.time < CACHE_HOURS * 3600e3) return cached.data;
        const list = await lss.getJSON('/einsaetze.json');
        const data = {};
        for (const m of list) {
            data[m.id] = {
                name: m.name,
                credits: m.average_credits,
                req: m.requirements ?? {},
                chances: m.chances ?? {},
                add: {
                    patients: m.additional?.possible_patient,
                    patientsMin: m.additional?.possible_patient_min,
                    prisoners: m.additional?.max_possible_prisoners,
                    duration: m.additional?.duration_text,
                    educations: m.additional?.personnel_educations,
                    followup: (m.additional?.followup_missions_ids?.length || 0) + (m.additional?.subsequent_missions_ids?.length || 0),
                    ktwInsteadOfRtw: m.additional?.allow_ktw_instead_of_rtw,
                },
                personnel: Object.fromEntries(Object.keys(ORGS)
                    .map(o => [o, m.additional?.[`average_min_${o}_personnel`]])
                    .filter(([, n]) => n > 0)),
                // z.B. {thw: ["fire"]}: THW-Personal zählt beim Feuerwehr-Personal mit
                inclusions: m.additional?.personnel_inclusions ?? {},
            };
        }
        GM_setValue(CACHE_KEY, { time: Date.now(), data });
        return data;
    }

    // Einsatzart aus dem Link "Hilfe zu diesem Einsatz", mit Variante (z.B. "2-0" oder "1/a")
    function missionTypeKey(missions) {
        const help = document.querySelector('#mission_help, #mission-type-helper-mobile');
        if (!help) return null;
        const url = new URL(help.getAttribute('href'), location.origin);
        const id = url.pathname.match(/\/einsaetze\/(\d+)/)?.[1];
        if (!id) return null;
        const overlay = url.searchParams.get('overlay_index');
        const additive = url.searchParams.get('additive_overlays');
        const candidates = [
            overlay && additive ? `${id}-${overlay}/${additive}` : null,
            overlay ? `${id}-${overlay}` : null,
            additive ? `${id}/${additive}` : null,
            id,
        ].filter(Boolean);
        return candidates.find(k => missions[k]) ?? null;
    }

    // "1,3 km" → 1.3, "05:12" → 312; Hauptsache, kleiner heißt näher. Unlesbar → ganz hinten
    function parseDistance(text) {
        const time = text.match(/(\d+):(\d{2})/);
        if (time) return Number(time[1]) * 60 + Number(time[2]);
        const num = text.match(/(\d+(?:[.,]\d+)?)/);
        return num ? Number(num[1].replace(',', '.')) : Infinity;
    }

    // Alle Fahrzeuge in den Fahrzeuglisten des Alarmfensters, nächstes zuerst. Ein Fahrzeug kann in
    // mehreren Reitern (z.B. "Alle" und "Feuerwehr") stehen, deshalb nach Fahrzeug-ID entdoppeln.
    // ownVehicles: Fahrzeugdaten aus /api/vehicles, falls die Seite den Typ nicht direkt angibt
    function alarmList(ownVehicles) {
        const found = new Map();
        const distCol = new Map();
        document.querySelectorAll('input[type="checkbox"]').forEach(input => {
            const row = input.closest('tr');
            const table = row?.closest('table');
            if (!input.classList.contains('vehicle_checkbox') && !table?.id.startsWith('vehicle_show_table')) return;
            const id = [input.value, input.getAttribute('vehicle_id'), row?.id?.match(/\d+/)?.[0]].find(v => /^\d+$/.test(v ?? ''));
            const typeAttr = input.getAttribute('vehicle_type_id') ?? row?.querySelector('[vehicle_type_id]')?.getAttribute('vehicle_type_id');
            const type = typeAttr != null ? Number(typeAttr) : ownVehicles?.[id]?.vehicle_type;
            if (type == null || Number.isNaN(type)) return;
            const key = id ?? `${type}-${found.size}`;
            // Steht das Fahrzeug schon in einem anderen Reiter, zählt nur, ob es irgendwo angehakt ist
            if (found.has(key)) {
                if (input.checked) found.get(key).checked = true;
                return;
            }
            if (table && !distCol.has(table)) {
                distCol.set(table, [...table.querySelectorAll('thead th')].findIndex(th => /entfernung/i.test(th.textContent)));
            }
            const col = table ? distCol.get(table) : -1;
            const dist = col >= 0 ? parseDistance(row.cells[col]?.textContent ?? '') : Infinity;
            found.set(key, { id, type, input, checked: input.checked, dist });
        });
        return [...found.values()].sort((a, b) => a.dist - b.dist);
    }

    const selectedVehicles = ownVehicles => alarmList(ownVehicles).filter(v => v.checked);

    // Fahrzeugtypen zählen: vor Ort, auf Anfahrt und im Alarmfenster angehakt
    function countVehicles(selected) {
        const count = sel => {
            const c = {};
            document.querySelectorAll(sel).forEach(el => {
                const t = Number(el.getAttribute('vehicle_type_id'));
                if (!Number.isNaN(t)) c[t] = (c[t] || 0) + 1;
            });
            return c;
        };
        const picked = {};
        for (const v of selected) picked[v.type] = (picked[v.type] || 0) + 1;
        return {
            scene: count('#mission_vehicle_at_mission a[vehicle_type_id]'),
            driving: count('#mission_vehicle_driving a[vehicle_type_id]'),
            selected: picked,
        };
    }

    // Besatzung angehakter Fahrzeuge aus deinen Fahrzeugdaten; null, wenn die Daten fehlen
    function crewOfSelected(selected, ownVehicles, types) {
        if (!ownVehicles) return null;
        const crew = {};
        for (const v of selected) {
            const org = orgOf(types[v.type]);
            const n = ownVehicles[v.id]?.assigned_personnel_count ?? 0;
            if (org && n > 0) crew[org] = (crew[org] || 0) + n;
        }
        return crew;
    }

    // Besatzung pro Organisation aus der Spalte "Besatzung" der Fahrzeugtabelle
    function countCrew(tableId, types) {
        const table = document.getElementById(tableId);
        const crew = {};
        if (!table) return crew;
        const heads = [...table.querySelectorAll('thead th')];
        let col = heads.findIndex(th => th.querySelector('img[title="Besatzung"]') || /besatzung/i.test(th.textContent));
        if (col < 0) col = 3;
        table.querySelectorAll('tbody tr').forEach(row => {
            const link = row.querySelector('a[vehicle_type_id]');
            const org = link && orgOf(types[link.getAttribute('vehicle_type_id')]);
            const n = parseInt(row.cells[col]?.textContent, 10);
            if (org && n > 0) crew[org] = (crew[org] || 0) + n;
        });
        return crew;
    }

    // Personal der Organisation plus aller Organisationen, die laut Einsatz mitzählen dürfen
    const crewFor = (crew, org, inclusions) =>
        Object.entries(crew).reduce((s, [o, n]) => s + (o === org || inclusions[o]?.includes(org) ? n : 0), 0);

    const sumFor = (counts, typeIds) => typeIds.reduce((s, t) => s + (counts[t] || 0), 0);

    // Wasser bzw. Schaum der vorhandenen Fahrzeuge aus der LSSM-API
    const tankFor = (counts, types, field) =>
        Object.entries(counts).reduce((s, [t, n]) => s + (types[t]?.[field] || 0) * n, 0);

    function buildRows(m, counts, types) {
        const rows = [];
        for (const [key, needed] of Object.entries(m.req)) {
            if (key === 'personnel_educations' || typeof needed !== 'number') continue;
            if (key === 'water_needed' || key === 'foam_needed') {
                const field = key === 'water_needed' ? 'waterTank' : 'foamTank';
                rows.push({
                    label: key === 'water_needed' ? 'Wasser (Liter)' : 'Schaum (Liter)', needed, chance: null, tank: field,
                    scene: tankFor(counts.scene, types, field), driving: tankFor(counts.driving, types, field), selected: tankFor(counts.selected, types, field),
                });
                continue;
            }
            const [label, typeIds] = REQ[key] ?? [key, []];
            rows.push({
                key, label, needed, chance: m.chances[key] ?? null, unknown: !typeIds.length, typeIds,
                scene: sumFor(counts.scene, typeIds), driving: sumFor(counts.driving, typeIds), selected: sumFor(counts.selected, typeIds),
            });
        }
        // Fahrzeuge, die nur mit Wahrscheinlichkeit gebraucht werden, aber nicht in den festen Anforderungen stehen
        for (const [key, chance] of Object.entries(m.chances)) {
            if (key in m.req) continue;
            const [label, typeIds] = REQ[key] ?? [key, []];
            rows.push({
                label, needed: 1, chance, unknown: !typeIds.length,
                scene: sumFor(counts.scene, typeIds), driving: sumFor(counts.driving, typeIds), selected: sumFor(counts.selected, typeIds),
            });
        }
        // Mindestpersonal; angehakte Fahrzeuge mit ihrer zugewiesenen Besatzung (falls bekannt)
        for (const [org, needed] of Object.entries(m.personnel ?? {})) {
            rows.push({
                label: ORGS[org].label, needed, chance: null, org,
                scene: crewFor(counts.crewScene ?? {}, org, m.inclusions ?? {}),
                driving: crewFor(counts.crewDriving ?? {}, org, m.inclusions ?? {}),
                selected: counts.crewSelected ? crewFor(counts.crewSelected, org, m.inclusions ?? {}) : null,
            });
        }
        for (const r of rows) r.missing = Math.max(0, r.needed - r.scene - r.driving - (r.selected ?? 0));
        // Fehlende zuerst, Wahrscheinlichkeiten nach hinten
        return rows.sort((a, b) => (b.missing > 0) - (a.missing > 0) || (a.chance != null) - (b.chance != null) || b.needed - a.needed);
    }

    // Hakt für jede sicher fehlende Anforderung das nächste passende, noch nicht gewählte Fahrzeug an.
    // Alarmiert wird nichts, das bleibt beim Spieler. computeRows liefert die Zeilen zum aktuellen Stand.
    function pickMissing(m, types, ownVehicles, computeRows) {
        const picked = [];
        const fits = (r, v) => {
            if (r.typeIds) return r.typeIds.includes(v.type);
            if (r.tank) return (types[v.type]?.[r.tank] || 0) > 0;
            if (r.org) {
                const org = orgOf(types[v.type]);
                const allowed = org === r.org || m.inclusions?.[org]?.includes(r.org);
                return allowed && (ownVehicles?.[v.id]?.assigned_personnel_count ?? 0) > 0;
            }
            return false;
        };
        // Fahrzeug-Anforderungen zuerst, dann Wasser/Schaum, dann Personal: Fahrzeuge bringen oft beides mit
        const order = r => (r.typeIds ? 0 : r.tank ? 1 : 2);
        for (let guard = 0; guard < 80; guard++) {
            const open = computeRows()
                .filter(r => r.missing > 0 && r.chance == null && !r.unknown && (r.typeIds || r.tank || r.org))
                .sort((a, b) => order(a) - order(b));
            const free = alarmList(ownVehicles).filter(v => !v.checked);
            let choice = null;
            for (const r of open) {
                choice = free.find(v => fits(r, v));
                if (choice) break;
            }
            if (!choice) break;
            choice.input.click();
            picked.push(choice);
        }
        const stillMissing = computeRows().filter(r => r.missing > 0 && r.chance == null);
        return { picked: picked.length, stillMissing };
    }

    function render(box, m, rows, collapsed, pickMsg) {
        const e = lss.escapeHtml;
        const fmt = n => n.toLocaleString('de-DE');
        const num = n => n ? fmt(n) : '<span class="eh-zero">0</span>';
        const sure = rows.filter(r => r.chance == null && !r.unknown);
        const missingCount = sure.filter(r => r.missing > 0).length;
        const info = [
            m.credits ? `💰 <b>~${fmt(m.credits)}</b> Credits` : '',
            m.add.patients ? `🚑 bis zu <b>${m.add.patients}</b> Patienten${m.add.patientsMin ? ` (mind. ${m.add.patientsMin})` : ''}` : '',
            m.add.ktwInsteadOfRtw ? 'KTW statt RTW möglich' : '',
            m.add.prisoners ? `🚔 bis zu <b>${m.add.prisoners}</b> Gefangene` : '',
            m.add.duration ? `⏱ ${e(m.add.duration)}` : '',
            m.add.educations ? `🎓 ${Object.entries(m.add.educations).map(([k, n]) => `${n}× ${e(k)}`).join(', ')}` : '',
            m.add.followup ? '↪ Folgeeinsatz möglich' : '',
        ].filter(Boolean);

        box.className = `eh-box${collapsed ? ' collapsed' : ''}`;
        box.innerHTML = `
            <div class="eh-head">
                <b>🧭 Einsatz-Helfer: ${e(m.name)}</b>
                <span class="eh-pill ${missingCount ? 'miss' : 'ok'}">${missingCount ? `${missingCount} fehlt` : '✓ alles da'}</span>
                <span>${collapsed ? '▸' : '▾'}</span>
            </div>
            <div class="eh-body">
                ${rows.length ? `
                <table class="eh-table">
                    <thead><tr><th>Benötigt</th><th>Soll</th><th>Vor Ort</th><th>Anfahrt</th><th>Gewählt</th><th>Fehlt</th></tr></thead>
                    <tbody>${rows.map(r => `
                        <tr class="${r.chance != null ? 'maybe' : r.missing ? 'miss' : 'done'}">
                            <td>${e(r.label)}${r.chance != null ? `<span class="eh-chance">${r.chance} %</span>` : ''}${r.unknown ? ' <span class="eh-zero" title="Fahrzeugtyp nicht zugeordnet">?</span>' : ''}</td>
                            <td>${fmt(r.needed)}</td>
                            <td>${num(r.scene)}</td>
                            <td>${num(r.driving)}</td>
                            <td>${r.selected == null ? '<span class="eh-zero" title="Besatzung angehakter Fahrzeuge ist vorher nicht bekannt">–</span>' : num(r.selected)}</td>
                            <td>${!r.missing ? '<span class="eh-ok">✓</span>'
                                : r.chance != null ? `<span class="eh-chance">evtl. ${fmt(r.missing)}</span>`
                                : `<span class="eh-missing">${fmt(r.missing)}</span>`}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : '<div class="eh-info">Keine besonderen Anforderungen: ein passendes Fahrzeug reicht.</div>'}
                ${missingCount || pickMsg ? `
                <div class="eh-actions">
                    ${missingCount ? '<button type="button" class="eh-pick">✓ Fehlendes auswählen</button>' : ''}
                    ${pickMsg ? `<span class="eh-msg">${pickMsg}</span>` : ''}
                </div>` : ''}
                ${info.length ? `<div class="eh-info">${info.map(i => `<span>${i}</span>`).join('')}</div>` : ''}
            </div>`;
    }

    async function init() {
        if (!/^\/missions\/\d+/.test(location.pathname)) return;
        const anchor = document.querySelector('#missing_text') ?? document.querySelector('#missionH1');
        if (!anchor) return;

        let missions, types;
        try {
            [missions, types] = await Promise.all([getMissionTypes(), lss.getVehicleTypes()]);
        } catch (e) {
            lss.report('Einsatz-Helfer', e);
            return;
        }
        const key = missionTypeKey(missions);
        if (!key) return;
        const m = missions[key];
        // Für den Kauf-Berater: welche Einsätze bei dir vorkommen
        const missionId = location.pathname.match(/\/missions\/(\d+)/)[1];
        lss.actions.recordMission?.(missionId, key);

        injectStyle(document);
        const box = document.createElement('div');
        anchor.after(box);
        let collapsed = false;
        try { collapsed = localStorage.getItem('einsatzHelfer.collapsed') === '1'; } catch (e) { /* kein Speicher */ }

        // Eigene Fahrzeuge (für Typ und Besatzung angehakter Fahrzeuge); ohne sie zeigt "Gewählt" beim Personal "–"
        let ownVehicles = null;
        lss.getJSON('/api/vehicles')
            .then(list => { ownVehicles = Object.fromEntries(list.map(v => [String(v.id), v])); update(); })
            .catch(e => lss.report('Einsatz-Helfer (Fahrzeugdaten)', e));

        let lastState = '';
        let pickMsg = '';
        let picking = false;
        const computeRows = () => {
            const selected = selectedVehicles(ownVehicles);
            return buildRows(m, {
                ...countVehicles(selected),
                crewScene: countCrew('mission_vehicle_at_mission', types),
                crewDriving: countCrew('mission_vehicle_driving', types),
                crewSelected: crewOfSelected(selected, ownVehicles, types),
            }, types);
        };
        const update = () => {
            if (picking) return;
            lastState = state();
            render(box, m, computeRows(), collapsed, pickMsg);
        };
        // Kurzer Fingerabdruck von Auswahl und Fahrzeuglisten, um Änderungen zu erkennen
        const state = () => [
            selectedVehicles(ownVehicles).map(v => v.id).join(','),
            document.querySelectorAll('#mission_vehicle_at_mission tr, #mission_vehicle_driving tr').length,
            ownVehicles ? 1 : 0,
        ].join('|');
        box.addEventListener('click', e => {
            if (e.target.closest('.eh-pick')) {
                picking = true;
                let result;
                try {
                    result = pickMissing(m, types, ownVehicles, computeRows);
                } finally {
                    picking = false;
                }
                const e2 = lss.escapeHtml;
                const rest = result.stillMissing.map(r => e2(r.label));
                // Für den Kauf-Berater: wofür kein freies Fahrzeug da war
                result.stillMissing.filter(r => r.key).forEach(r => lss.actions.recordShortage?.(missionId, r.key));
                pickMsg = result.picked
                    ? `<b>${result.picked}</b> Fahrzeug${result.picked === 1 ? '' : 'e'} ausgewählt. Alarmieren musst du selbst.${rest.length ? ` Kein freies Fahrzeug für: ${rest.join(', ')}` : ''}`
                    : `Kein passendes freies Fahrzeug in der Liste${rest.length ? ` für: ${rest.join(', ')}` : ''}.`;
                update();
                return;
            }
            if (!e.target.closest('.eh-head')) return;
            collapsed = !collapsed;
            try { localStorage.setItem('einsatzHelfer.collapsed', collapsed ? '1' : '0'); } catch (err) { /* kein Speicher */ }
            update();
        });
        // Auswahl per Klick oder über Alarm-Knöpfe löst nicht immer ein Ereignis aus,
        // deshalb regelmäßig nachsehen und nur bei Änderungen neu zeichnen
        document.addEventListener('change', () => update());
        setInterval(() => { if (state() !== lastState) update(); }, 500);
        update();
    }

    if (lss.isWorkerFrame) return;
    // Für den Kauf-Berater: Zuordnung Anforderung → Fahrzeugtypen und die Einsatzdaten
    lss.actions.missionRequirements = REQ;
    lss.actions.missionTypes = getMissionTypes;

    lss.safe('Einsatz-Helfer', init)();
})();
