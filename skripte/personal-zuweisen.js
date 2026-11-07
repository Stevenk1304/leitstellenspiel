// LSS Personal zuweisen
// Füllt Fahrzeuge mit passendem, noch freiem Personal der eigenen Wache auf
// (z.B. Notärzte aufs NEF). Personal, das schon an ein anderes Fahrzeug gebunden ist, bleibt dort.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Pause zwischen zwei Zuweisungen in ms, damit der Server nicht überlastet wird
    const DELAY = 300;
    // So lange wird auf die Antwort des Spiels nach einem Klick gewartet
    const TIMEOUT = 10000;

    // Welche Ausbildungen ein Fahrzeugtyp braucht.
    // all: alle Plätze brauchen eine dieser Ausbildungen; min: {Ausbildung: Anzahl}
    function requirements(type, max) {
        const all = new Set();
        const min = {};
        for (const school of Object.values(type?.staff?.training ?? {})) {
            for (const [key, rule] of Object.entries(school)) {
                if (rule.all) all.add(key);
                else if (rule.min) min[key] = Math.max(min[key] ?? 0, Math.min(rule.min, max));
            }
        }
        return { all, min };
    }

    // Zuweisungsseite eines Fahrzeugs unsichtbar öffnen
    function openWorker(vehicleId) {
        return new Promise((resolve, reject) => {
            const frame = document.createElement('iframe');
            frame.name = 'lss-worker';
            frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none';
            const timer = setTimeout(() => {
                frame.remove();
                reject(new Error('Zuweisungsseite lädt nicht'));
            }, 30000);
            frame.onload = () => {
                clearTimeout(timer);
                frame.onload = null;
                resolve(frame);
            };
            frame.src = `/vehicles/${vehicleId}/zuweisung`;
            document.body.append(frame);
        });
    }

    function readPersonnel(doc) {
        return [...doc.querySelectorAll('#personal_table tbody tr[id^="personal_"]')].map(row => {
            const btn = row.querySelector('a.btn[personal_id]');
            let keys = [];
            try { keys = JSON.parse(row.dataset.filterableBy || '[]'); } catch (e) { /* keine Ausbildung lesbar */ }
            return {
                id: row.id.replace('personal_', ''),
                name: row.cells[0]?.textContent.trim(),
                keys,
                btn,
                assigned: !!btn?.classList.contains('btn-assigned'),
                elsewhere: !!btn?.classList.contains('btn-warning'),
            };
        });
    }

    // Wer soll zugewiesen werden?
    // neededAtBuilding = Ausbildungen, die irgendein Fahrzeug (oder Anhänger) der Wache braucht
    // knownKeys = alle Ausbildungen, die die Fahrzeugliste überhaupt kennt
    function pick(personnel, req, max, neededAtBuilding, knownKeys) {
        const assigned = personnel.filter(p => p.assigned);
        const free = personnel.filter(p => p.btn && !p.assigned && !p.elsewhere);
        let slots = max - assigned.length;
        const picks = [];
        const take = (list, n) => {
            for (const p of list) {
                if (n <= 0 || slots <= 0) break;
                if (picks.includes(p)) continue;
                picks.push(p);
                n--;
                slots--;
            }
        };
        const hasAny = (p, keys) => p.keys.some(k => keys.has(k));

        if (req.all.size) {
            take(free.filter(p => hasAny(p, req.all)), slots);
            return picks;
        }
        for (const [key, n] of Object.entries(req.min)) {
            const have = assigned.filter(p => p.keys.includes(key)).length;
            take(free.filter(p => p.keys.includes(key)), n - have);
        }
        // Restliche Plätze: erst Personal ohne Ausbildung. Ausgebildete Leute nur, wenn sicher ist, dass
        // ihre Ausbildung an dieser Wache kein Fahrzeug braucht. Kennt die Fahrzeugliste eine Ausbildung
        // nicht, bleibt die Person sicherheitshalber frei.
        take(free.filter(p => !p.keys.length), slots);
        take(free.filter(p => p.keys.length && p.keys.every(k => knownKeys.has(k)) && !hasAny(p, neededAtBuilding)), slots);
        return picks;
    }

    async function waitFor(check) {
        const end = Date.now() + TIMEOUT;
        while (Date.now() < end) {
            if (check()) return true;
            await lss.sleep(150);
        }
        return false;
    }

    // Ein Fahrzeug auffüllen, gibt die Anzahl neu zugewiesener Personen zurück
    async function fillVehicle(vehicle, req, max, neededAtBuilding, knownKeys, isCancelled) {
        const frame = await openWorker(vehicle.id);
        try {
            const doc = () => frame.contentDocument;
            if (!doc()?.querySelector('#personal_table')) throw new Error('Keine Personalliste gefunden');
            const picks = pick(readPersonnel(doc()), req, max, neededAtBuilding, knownKeys);
            let count = 0;
            for (const p of picks) {
                if (isCancelled()) break;
                doc().querySelector(`#personal_${p.id} a.btn[personal_id]`)?.click();
                // Das Spiel tauscht den Knopf aus (oder lädt die Seite neu), sobald die Person zugewiesen ist
                const ok = await waitFor(() => doc()?.querySelector(`#personal_${p.id} a.btn-assigned`));
                if (!ok) throw new Error(`${p.name}: keine Antwort vom Spiel`);
                count++;
                await lss.sleep(DELAY);
            }
            return count;
        } finally {
            frame.remove();
        }
    }

    // Falsch eingeteiltes Personal von einem Fahrzeug nehmen: ausgebildete Leute, deren Ausbildung dieses
    // Fahrzeug nicht braucht, die aber ein anderes Fahrzeug der Wache braucht (z.B. Pumpen-Leute auf dem GKW).
    // Gibt die Anzahl entfernter Personen zurück.
    async function cleanVehicle(vehicle, req, neededAtBuilding, knownKeys, isCancelled) {
        const ownKeys = new Set([...req.all, ...Object.keys(req.min).filter(k => req.min[k] > 0)]);
        const frame = await openWorker(vehicle.id);
        try {
            const doc = () => frame.contentDocument;
            if (!doc()?.querySelector('#personal_table')) throw new Error('Keine Personalliste gefunden');
            const misplaced = readPersonnel(doc()).filter(p => p.assigned && p.keys.length
                && p.keys.every(k => knownKeys.has(k))
                && !p.keys.some(k => ownKeys.has(k))
                && p.keys.some(k => neededAtBuilding.has(k)));
            let count = 0;
            for (const p of misplaced) {
                if (isCancelled()) break;
                doc().querySelector(`#personal_${p.id} a.btn[personal_id]`)?.click();
                const ok = await waitFor(() => {
                    const btn = doc()?.querySelector(`#personal_${p.id} a.btn[personal_id]`);
                    return btn && !btn.classList.contains('btn-assigned');
                });
                if (!ok) throw new Error(`${p.name}: Zuweisung ließ sich nicht entfernen`);
                count++;
                await lss.sleep(DELAY);
            }
            return count;
        } finally {
            frame.remove();
        }
    }

    // buildingId und vehicleId beide null: alle Fahrzeuge aller Wachen
    // resort: auch volle Fahrzeuge aufnehmen, weil dort falsch eingeteiltes Personal sitzen kann
    async function buildPlan(buildingId, vehicleId, resort = false) {
        const [vehicles, types] = await Promise.all([lss.getJSON('/api/vehicles'), lss.getVehicleTypes()]);
        const selected = vehicles.filter(v =>
            vehicleId !== null ? v.id === vehicleId : buildingId === null || v.building_id === buildingId);

        const knownKeys = new Set();
        for (const type of Object.values(types)) {
            for (const school of Object.values(type?.staff?.training ?? {})) Object.keys(school).forEach(k => knownKeys.add(k));
        }

        // Pro Wache: welche Ausbildungen braucht irgendein Fahrzeug dort?
        const neededByBuilding = {};
        for (const v of vehicles) {
            const req = requirements(types[v.vehicle_type], 99);
            const set = neededByBuilding[v.building_id] ??= new Set();
            [...req.all, ...Object.keys(req.min)].forEach(k => set.add(k));
        }

        const maxOf = v => {
            const type = types[v.vehicle_type];
            return v.max_personnel_override ?? type?.maxPersonnel ?? type?.staff?.max ?? 0;
        };
        const plans = new Map(vehicles.map(v => [v.id, { vehicle: v, max: maxOf(v), req: requirements(types[v.vehicle_type], maxOf(v)) }]));

        // Anhänger und Abrollbehälter haben keine eigene Besatzung: ihre Ausbildung (z.B. Wasserschaden/Pumpen
        // beim Anh SwPu, Notstrom beim NEA200) muss das Personal des Zugfahrzeugs mitbringen
        for (const v of vehicles) {
            const tow = plans.get(v.tractive_vehicle_id ?? v.tractive_vehicle?.id);
            if (!tow || maxOf(v) > 0 || !tow.max) continue;
            const trailerReq = requirements(types[v.vehicle_type], tow.max);
            for (const key of trailerReq.all) tow.req.min[key] = Math.max(tow.req.min[key] ?? 0, tow.max);
            for (const [key, n] of Object.entries(trailerReq.min)) tow.req.min[key] = Math.max(tow.req.min[key] ?? 0, n);
        }

        return {
            neededByBuilding,
            knownKeys,
            items: selected
                .map(v => {
                    const p = plans.get(v.id);
                    const trained = p.req.all.size > 0 || Object.values(p.req.min).some(n => n > 0);
                    return { ...p, current: v.assigned_personnel_count ?? 0, trained };
                })
                .filter(p => p.max > 0 && (resort || p.current < p.max))
                // Fahrzeuge mit Ausbildungspflicht zuerst, damit sie ihr Fachpersonal sicher bekommen
                .sort((a, b) => b.trained - a.trained || a.vehicle.id - b.vehicle.id),
        };
    }

    function showDialog({ items, neededByBuilding, knownKeys }, resort = false) {
        const label = p => `${p.current} / ${p.max} Personal`;
        if (resort) return showResortDialog({ items, neededByBuilding, knownKeys }, label);
        lss.openDialog({
            title: 'Personal zuweisen',
            count: `${items.length} Fahrzeug${items.length === 1 ? '' : 'e'}`,
            rows: items.map(p => ({ left: p.vehicle.caption, right: label(p) })),
            empty: 'Alle Fahrzeuge sind schon voll besetzt.',
            hint: 'Es wird nur freies Personal der jeweiligen Wache zugewiesen. Ausgebildete Leute bleiben für Fahrzeuge frei, die ihre Ausbildung brauchen (auch fürs Zugfahrzeug eines Anhängers).',
            startLabel: 'Personal zuweisen',
            async run(ui) {
                let added = 0, failed = 0;
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    ui.busy(i);
                    try {
                        const needed = neededByBuilding[p.vehicle.building_id] ?? new Set();
                        const n = await fillVehicle(p.vehicle, p.req, p.max, needed, knownKeys, ui.cancelled);
                        p.current += n;
                        ui.setRight(i, label(p));
                        if (n) ui.done(i, 'ok', `+${n}`);
                        else ui.done(i, 'skip', '–', 'Kein passendes freies Personal');
                        added += n;
                    } catch (e) {
                        ui.done(i, 'err', '!', e.message);
                        failed++;
                    }
                    ui.progress(i + 1, `${i + 1} von ${items.length} Fahrzeugen · ${added} Personen zugewiesen${failed ? ` · ${failed} Fehler` : ''}`);
                }
                return `Fertig! ${added} Person${added === 1 ? '' : 'en'} zugewiesen${failed ? `, ${failed} Fehler` : ''}.`;
            },
        });
    }

    // Erst überall falsch eingeteiltes Personal entfernen, dann alle Fahrzeuge neu auffüllen
    function showResortDialog({ items, neededByBuilding, knownKeys }, label) {
        lss.openDialog({
            title: 'Personal umsortieren',
            count: `${items.length} Fahrzeug${items.length === 1 ? '' : 'e'}`,
            rows: items.map(p => ({ left: p.vehicle.caption, right: label(p) })),
            empty: 'Keine Fahrzeuge mit Besatzung.',
            hint: 'Schritt 1: Ausgebildete Leute kommen von Fahrzeugen runter, die ihre Ausbildung nicht brauchen, wenn ein anderes Fahrzeug der Wache sie braucht (z.B. Pumpen-Leute vom GKW). Schritt 2: Alle Fahrzeuge werden wieder passend aufgefüllt.',
            startLabel: 'Umsortieren',
            async run(ui) {
                const removed = items.map(() => 0);
                const errors = items.map(() => null);
                let failed = 0;
                const needed = p => neededByBuilding[p.vehicle.building_id] ?? new Set();
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    ui.busy(i);
                    try {
                        removed[i] = await cleanVehicle(p.vehicle, p.req, needed(p), knownKeys, ui.cancelled);
                        p.current -= removed[i];
                        ui.setRight(i, label(p));
                    } catch (e) {
                        errors[i] = e.message;
                    }
                    ui.progress((i + 1) / 2, `Schritt 1: ${i + 1} von ${items.length} Fahrzeugen geprüft · ${removed.reduce((a, b) => a + b, 0)} entfernt`);
                }
                let added = 0;
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    ui.busy(i);
                    let n = 0;
                    try {
                        if (!errors[i] && p.current < p.max) n = await fillVehicle(p.vehicle, p.req, p.max, needed(p), knownKeys, ui.cancelled);
                    } catch (e) {
                        errors[i] = e.message;
                    }
                    p.current += n;
                    added += n;
                    ui.setRight(i, label(p));
                    const text = [removed[i] ? `−${removed[i]}` : '', n ? `+${n}` : ''].filter(Boolean).join(' ');
                    if (errors[i]) { ui.done(i, 'err', '!', errors[i]); failed++; }
                    else if (text) ui.done(i, 'ok', text);
                    else ui.done(i, 'skip', '–', p.current >= p.max ? 'Passt schon' : 'Kein passendes freies Personal');
                    ui.progress((items.length + i + 1) / 2, `Schritt 2: ${i + 1} von ${items.length} Fahrzeugen · ${added} zugewiesen`);
                }
                const total = removed.reduce((a, b) => a + b, 0);
                return `Fertig! ${total} Person${total === 1 ? '' : 'en'} umgesetzt, ${added} zugewiesen${failed ? `, ${failed} Fehler` : ''}.`;
            },
        });
    }

    async function start(buildingId, vehicleId, resort = false) {
        try {
            showDialog(await buildPlan(buildingId, vehicleId, resort), resort);
        } catch (e) {
            lss.report('Personal zuweisen', e);
        }
    }

    lss.actions.assign = buildingId => start(buildingId, null);

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '👥 Personal zuweisen', scope: 'building', order: 30, run: id => start(id, null) });
    lss.addTool({ label: '👥 Personal zuweisen (alle Wachen)', scope: 'all', order: 30, run: () => start(null, null) });
    lss.addTool({ label: '♻️ Personal umsortieren', scope: 'building', order: 31, run: id => start(id, null, true) });

    // Wachen-Seite: alle Fahrzeuge dieser Wache, Knopf direkt über der Fahrzeugliste
    const building = location.pathname.match(/^\/buildings\/(\d+)\/?$/);
    const vehicleTable = document.querySelector('#vehicle_table');
    if (building && vehicleTable) {
        lss.addPageButton(vehicleTable, '👥 Personal zuweisen', () => start(Number(building[1]), null));
        lss.addPageButton(vehicleTable, '♻️ Personal umsortieren', () => start(Number(building[1]), null, true));
    }

    // Zuweisungsseite: nur dieses Fahrzeug
    const assignment = location.pathname.match(/^\/vehicles\/(\d+)\/zuweisung\/?$/);
    const personnelTable = document.querySelector('#personal_table');
    if (assignment && personnelTable) {
        lss.addPageButton(personnelTable, '👥 Passendes Personal automatisch zuweisen', () => start(null, Number(assignment[1])));
    }
})();
