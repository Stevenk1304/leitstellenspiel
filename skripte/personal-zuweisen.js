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

    // Wer soll zugewiesen werden? neededAtBuilding = Ausbildungen, die irgendein Fahrzeug der Wache braucht
    function pick(personnel, req, max, neededAtBuilding) {
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
        // Restliche Plätze: erst Personal ohne Ausbildung, dann Personal, dessen Ausbildung hier niemand braucht
        take(free.filter(p => !p.keys.length), slots);
        take(free.filter(p => p.keys.length && !hasAny(p, neededAtBuilding)), slots);
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
    async function fillVehicle(vehicle, req, max, neededAtBuilding, isCancelled) {
        const frame = await openWorker(vehicle.id);
        try {
            const doc = () => frame.contentDocument;
            if (!doc()?.querySelector('#personal_table')) throw new Error('Keine Personalliste gefunden');
            const picks = pick(readPersonnel(doc()), req, max, neededAtBuilding);
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

    async function buildPlan(buildingId, vehicleId) {
        const [vehicles, types] = await Promise.all([lss.getJSON('/api/vehicles'), lss.getVehicleTypes()]);
        const atBuilding = vehicles.filter(v => vehicleId !== null ? v.id === vehicleId : v.building_id === buildingId);
        const ownBuilding = atBuilding[0]?.building_id;
        const neededAtBuilding = new Set(vehicles
            .filter(v => v.building_id === ownBuilding)
            .flatMap(v => {
                const req = requirements(types[v.vehicle_type], 99);
                return [...req.all, ...Object.keys(req.min)];
            }));

        return {
            neededAtBuilding,
            items: atBuilding
                .map(v => {
                    const type = types[v.vehicle_type];
                    const max = v.max_personnel_override ?? type?.maxPersonnel ?? type?.staff?.max ?? 0;
                    const req = requirements(type, max);
                    return { vehicle: v, max, req, current: v.assigned_personnel_count ?? 0, trained: req.all.size > 0 };
                })
                .filter(p => p.max > 0 && p.current < p.max)
                // Fahrzeuge mit Ausbildungspflicht zuerst, damit sie ihr Fachpersonal sicher bekommen
                .sort((a, b) => b.trained - a.trained || a.vehicle.id - b.vehicle.id),
        };
    }

    function showDialog({ items, neededAtBuilding }) {
        const label = p => `${p.current} / ${p.max} Personal`;
        lss.openDialog({
            title: 'Personal zuweisen',
            count: `${items.length} Fahrzeug${items.length === 1 ? '' : 'e'}`,
            rows: items.map(p => ({ left: p.vehicle.caption, right: label(p) })),
            empty: 'Alle Fahrzeuge sind schon voll besetzt.',
            hint: 'Es wird nur freies Personal dieser Wache zugewiesen, das zur Ausbildung des Fahrzeugs passt.',
            startLabel: 'Personal zuweisen',
            async run(ui) {
                let added = 0, failed = 0;
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    ui.busy(i);
                    try {
                        const n = await fillVehicle(p.vehicle, p.req, p.max, neededAtBuilding, ui.cancelled);
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

    async function start(buildingId, vehicleId) {
        try {
            showDialog(await buildPlan(buildingId, vehicleId));
        } catch (e) {
            alert(`Personal zuweisen: Fehler beim Laden der Daten\n${e.message}`);
        }
    }

    if (lss.isWorkerFrame) return;

    // Gebäudeseite: alle Fahrzeuge der Wache
    const building = location.pathname.match(/^\/buildings\/(\d+)\/?$/);
    const vehicleTable = document.querySelector('#vehicle_table');
    if (building && vehicleTable) {
        lss.addPageButton(vehicleTable, '👥 Personal für alle Fahrzeuge zuweisen', () => start(Number(building[1]), null));
    }

    // Zuweisungsseite: nur dieses Fahrzeug
    const assignment = location.pathname.match(/^\/vehicles\/(\d+)\/zuweisung\/?$/);
    const personnelTable = document.querySelector('#personal_table');
    if (assignment && personnelTable) {
        lss.addPageButton(personnelTable, '👥 Passendes Personal automatisch zuweisen', () => start(null, Number(assignment[1])));
    }
})();
