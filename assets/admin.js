/* Feuerwehr Beladung – Editor im Backend. Ohne Build-Schritt, reines JavaScript. */
(function () {
	'use strict';

	const cfg = window.FWB_ADMIN;
	const wurzel = document.getElementById('fwb-editor');
	const feld = document.getElementById('fwb-daten');
	if (!cfg || !wurzel || !feld) return;

	const D = cfg.daten;
	const BILDER = cfg.bilder || {};
	const SYMBOLE = {
		bogen: 'Gebogener Pfeil (aufklappen)',
		'bogen-zurueck': 'Gebogener Pfeil (zuklappen)',
		runter: 'Pfeil nach unten',
		hoch: 'Pfeil nach oben',
		links: 'Pfeil nach links',
		rechts: 'Pfeil nach rechts',
	};
	const STANDARDFELDER = ['Fahrzeugtyp', 'Funkrufname', 'Fahrgestell', 'Aufbau', 'Baujahr', 'Besatzung', 'Pumpe', 'Löschwassertank', 'Schaummittel', 'Stromerzeuger', 'Zulässige Gesamtmasse'];

	const ui = { tab: 'stammdaten', fach: null, zustand: null, ansicht: null, hotspot: null, geraet: null, suche: '' };
	let geaendert = false;
	let sendet = false;

	const neueId = (p) => p + Math.random().toString(36).slice(2, 9);
	const grenze = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
	const rund = (v) => Math.round(v * 100) / 100;

	/* ---------- Hilfen ---------- */

	function h(tag, attrs, ...kinder) {
		const e = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs || {})) {
			if (v == null || v === false) continue;
			if (k === 'class') e.className = v;
			else if (k === 'style') Object.assign(e.style, v);
			else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
			else if (['value', 'checked', 'disabled', 'selected'].includes(k)) e[k] = v;
			else e.setAttribute(k, v === true ? '' : v);
		}
		for (const c of kinder.flat(Infinity)) {
			if (c == null || c === false) continue;
			e.append(c.nodeType ? c : document.createTextNode(String(c)));
		}
		return e;
	}

	function sync(markieren = true) {
		feld.value = JSON.stringify(D);
		if (markieren) geaendert = true;
	}

	function neuZeichnen() {
		sync();
		zeichne();
	}

	function eingabe(obj, key, opt = {}) {
		const tag = opt.mehrzeilig ? 'textarea' : 'input';
		return h(tag, {
			type: opt.mehrzeilig ? null : 'text',
			class: opt.class || (opt.mehrzeilig ? 'large-text' : 'regular-text'),
			rows: opt.mehrzeilig ? opt.zeilen || 3 : null,
			placeholder: opt.platzhalter || null,
			value: obj[key] || '',
			'aria-label': opt.label || null,
			oninput: (ev) => {
				obj[key] = ev.target.value;
				sync();
				if (opt.nachEingabe) opt.nachEingabe();
			},
		});
	}

	function auswahl(wert, optionen, beiAenderung, attrs = {}) {
		return h(
			'select',
			{ ...attrs, onchange: (ev) => beiAenderung(ev.target.value) },
			optionen.map(([v, text, aus]) => h('option', { value: v, selected: String(v) === String(wert), disabled: aus }, text))
		);
	}

	function knopf(text, beiKlick, klasse = 'button') {
		return h('button', { type: 'button', class: klasse, onclick: beiKlick }, text);
	}

	function feldzeile(beschriftung, inhalt, hinweis) {
		return h('div', { class: 'fwb-zeile' }, h('label', { class: 'fwb-label' }, beschriftung), inhalt, hinweis ? h('p', { class: 'description' }, hinweis) : null);
	}

	function verschiebe(liste, index, richtung) {
		const ziel = index + richtung;
		if (ziel < 0 || ziel >= liste.length) return;
		[liste[index], liste[ziel]] = [liste[ziel], liste[index]];
		neuZeichnen();
	}

	function bildwahl(obj, key) {
		const b = BILDER[obj[key]];
		const waehle = () => {
			const rahmen = wp.media({ title: 'Foto wählen', library: { type: 'image' }, multiple: false, button: { text: 'Foto übernehmen' } });
			rahmen.on('select', () => {
				const a = rahmen.state().get('selection').first().toJSON();
				const g = (a.sizes && a.sizes.large) || a;
				BILDER[a.id] = { id: a.id, url: g.url, w: g.width || a.width, h: g.height || a.height };
				obj[key] = a.id;
				neuZeichnen();
			});
			rahmen.open();
		};
		return h(
			'div',
			{ class: 'fwb-bildwahl' },
			b ? h('img', { src: b.url, alt: '' }) : null,
			knopf(b ? 'Foto ersetzen' : 'Foto wählen', waehle),
			b
				? knopf(
						'Foto entfernen',
						() => {
							obj[key] = 0;
							neuZeichnen();
						},
						'button-link button-link-delete'
				  )
				: null
		);
	}

	const geraetName = (id) => {
		const g = D.geraete.find((x) => x.id === id);
		return g ? g.name || '(ohne Namen)' : '';
	};

	function verwendung(geraetId) {
		return D.faecher.filter((f) => f.zustaende.some((z) => z.hotspots.some((hs) => hs.typ === 'geraet' && hs.geraet === geraetId))).map((f) => f.name || '?');
	}

	/* ---------- Zeichenfläche: Bereiche auf einem Foto aufziehen, verschieben, in der Größe ändern ---------- */

	function flaeche(bildId, rechtecke, opt) {
		const b = BILDER[bildId];
		const box = h('div', { class: 'fwb-fl' + (b ? '' : ' fwb-fl-leer'), style: { aspectRatio: b ? b.w + ' / ' + b.h : '4 / 3' } });
		if (b) box.append(h('img', { src: b.url, alt: '', draggable: 'false' }));
		else box.append(h('div', { class: 'fwb-fl-hinweis' }, 'Noch kein Foto gewählt. Bereiche lassen sich trotzdem schon aufziehen.'));

		const pos = (ev) => {
			const r = box.getBoundingClientRect();
			return { x: grenze(((ev.clientX - r.left) / r.width) * 100), y: grenze(((ev.clientY - r.top) / r.height) * 100) };
		};
		const setze = (el, r) => Object.assign(el.style, { left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' });

		rechtecke.forEach((r) => {
			const el = h(
				'div',
				{ class: 'fwb-r ' + (opt.klasse ? opt.klasse(r) : '') + (opt.gewaehlt === r.id ? ' fwb-r-akt' : '') },
				h('span', { class: 'fwb-r-text' }, opt.beschriftung(r)),
				h('span', { class: 'fwb-r-griff', title: 'Größe ändern' })
			);
			setze(el, r);
			el.addEventListener('pointerdown', (ev) => {
				if (ev.button !== 0) return;
				ev.preventDefault();
				ev.stopPropagation();
				const groesse = ev.target.classList.contains('fwb-r-griff');
				const start = pos(ev);
				const orig = { x: r.x, y: r.y, w: r.w, h: r.h };
				let bewegt = false;
				el.setPointerCapture(ev.pointerId);
				const bewege = (e) => {
					const p = pos(e);
					if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 0.4) bewegt = true;
					if (groesse) {
						r.w = grenze(orig.w + p.x - start.x, 2, 100 - orig.x);
						r.h = grenze(orig.h + p.y - start.y, 2, 100 - orig.y);
					} else {
						r.x = grenze(orig.x + p.x - start.x, 0, 100 - orig.w);
						r.y = grenze(orig.y + p.y - start.y, 0, 100 - orig.h);
					}
					setze(el, r);
				};
				const ende = () => {
					el.removeEventListener('pointermove', bewege);
					el.removeEventListener('pointerup', ende);
					el.removeEventListener('pointercancel', ende);
					['x', 'y', 'w', 'h'].forEach((k) => (r[k] = rund(r[k])));
					if (bewegt) sync();
					opt.beiWahl(r.id);
				};
				el.addEventListener('pointermove', bewege);
				el.addEventListener('pointerup', ende);
				el.addEventListener('pointercancel', ende);
			});
			box.append(el);
		});

		box.addEventListener('pointerdown', (ev) => {
			if (ev.button !== 0) return;
			ev.preventDefault();
			const start = pos(ev);
			const geist = h('div', { class: 'fwb-r fwb-r-neu' });
			let r = { x: start.x, y: start.y, w: 0, h: 0 };
			box.append(geist);
			box.setPointerCapture(ev.pointerId);
			const bewege = (e) => {
				const p = pos(e);
				r = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
				setze(geist, r);
			};
			const ende = () => {
				box.removeEventListener('pointermove', bewege);
				box.removeEventListener('pointerup', ende);
				box.removeEventListener('pointercancel', ende);
				geist.remove();
				if (r.w >= 2 && r.h >= 2) opt.beiNeu({ x: rund(r.x), y: rund(r.y), w: rund(r.w), h: rund(r.h) });
			};
			box.addEventListener('pointermove', bewege);
			box.addEventListener('pointerup', ende);
			box.addEventListener('pointercancel', ende);
		});

		return box;
	}

	/* ---------- Reiter: Stammdaten ---------- */

	function reiterStammdaten() {
		const felder = D.info.felder;
		return h(
			'div',
			{},
			h(
				'div',
				{ class: 'fwb-zwei' },
				feldzeile('Foto des Fahrzeugs', bildwahl(D.info, 'bild')),
				feldzeile('Kurzbeschreibung', eingabe(D.info, 'kurz', { mehrzeilig: true, platzhalter: 'z. B. Hilfeleistungslöschgruppenfahrzeug, rückt als erstes Fahrzeug aus' }))
			),
			h('h3', {}, 'Fahrzeugdaten'),
			h('p', { class: 'description' }, 'Diese Angaben erscheinen auf der Lernseite als Steckbrief. Die ersten vier stehen ganz oben. Felder ohne Wert werden nicht angezeigt.'),
			h(
				'table',
				{ class: 'fwb-tabelle' },
				h('thead', {}, h('tr', {}, h('th', {}, 'Bezeichnung'), h('th', {}, 'Wert'), h('th', {}, ''))),
				h(
					'tbody',
					{},
					felder.map((f, i) =>
						h(
							'tr',
							{},
							h('td', {}, eingabe(f, 'label', { platzhalter: 'z. B. Pumpe', label: 'Bezeichnung' })),
							h('td', {}, eingabe(f, 'wert', { platzhalter: 'z. B. FPN 10-2000', label: 'Wert' })),
							h(
								'td',
								{ class: 'fwb-aktionen' },
								knopf('↑', () => verschiebe(felder, i, -1), 'button button-small'),
								knopf('↓', () => verschiebe(felder, i, 1), 'button button-small'),
								knopf(
									'Entfernen',
									() => {
										felder.splice(i, 1);
										neuZeichnen();
									},
									'button-link button-link-delete'
								)
							)
						)
					)
				)
			),
			h(
				'p',
				{},
				knopf('Feld hinzufügen', () => {
					felder.push({ label: '', wert: '' });
					neuZeichnen();
				}),
				' ',
				knopf('Übliche Felder ergänzen', () => {
					const vorhanden = felder.map((f) => f.label.trim().toLowerCase());
					STANDARDFELDER.filter((l) => !vorhanden.includes(l.toLowerCase())).forEach((l) => felder.push({ label: l, wert: '' }));
					neuZeichnen();
				})
			)
		);
	}

	/* ---------- Reiter: Geräte ---------- */

	function neuesGeraet(name) {
		const g = { id: neueId('g'), name: name || '', menge: '', ort: '', beschreibung: '', einsatz: '', bild: 0 };
		D.geraete.push(g);
		return g;
	}

	function loescheGeraet(g) {
		const orte = verwendung(g.id);
		const frage = orte.length ? '„' + (g.name || 'Gerät') + '" ist in ' + orte.join(', ') + ' eingezeichnet. Gerät und Markierungen löschen?' : '„' + (g.name || 'Gerät') + '" löschen?';
		if (!window.confirm(frage)) return;
		D.geraete.splice(D.geraete.indexOf(g), 1);
		D.faecher.forEach((f) => f.zustaende.forEach((z) => (z.hotspots = z.hotspots.filter((hs) => hs.geraet !== g.id))));
		ui.geraet = null;
		neuZeichnen();
	}

	function reiterGeraete() {
		const suche = ui.suche.trim().toLowerCase();
		const liste = D.geraete.filter((g) => !suche || g.name.toLowerCase().includes(suche));
		const listeEl = h('div', { class: 'fwb-geraete' });

		liste.forEach((g) => {
			const offen = ui.geraet === g.id;
			const orte = verwendung(g.id);
			const titel = h('strong', {}, g.name || '(ohne Namen)');
			const kopf = h(
				'button',
				{
					type: 'button',
					class: 'fwb-geraet-kopf',
					'aria-expanded': String(offen),
					onclick: () => {
						ui.geraet = offen ? null : g.id;
						zeichne();
					},
				},
				titel,
				h('span', { class: 'fwb-geraet-meta' + (orte.length ? '' : ' fwb-warn') }, orte.length ? 'in ' + orte.join(', ') : 'noch nirgends eingezeichnet')
			);
			const karte = h('div', { class: 'fwb-geraet' + (offen ? ' fwb-offen' : '') }, kopf);
			if (offen) {
				karte.append(
					h(
						'div',
						{ class: 'fwb-geraet-form' },
						h(
							'div',
							{ class: 'fwb-zwei' },
							feldzeile('Name', eingabe(g, 'name', { nachEingabe: () => (titel.textContent = g.name || '(ohne Namen)') })),
							feldzeile('Menge', eingabe(g, 'menge', { platzhalter: 'z. B. 2 Stück' }))
						),
						feldzeile('Genauer Ort im Fach', eingabe(g, 'ort', { platzhalter: 'z. B. Schwenkwand, Rückseite' }), 'Freiwillig. Geräte mit gleichem Ort stehen auf der Lernseite zusammen.'),
						feldzeile('Was ist das?', eingabe(g, 'beschreibung', { mehrzeilig: true })),
						feldzeile('Hinweise für den Einsatz', eingabe(g, 'einsatz', { mehrzeilig: true })),
						feldzeile('Foto des Geräts', bildwahl(g, 'bild'), 'Freiwillig. Wird auf der Lernseite neben der Beschreibung gezeigt.'),
						h('p', {}, knopf('Gerät löschen', () => loescheGeraet(g), 'button-link button-link-delete'))
					)
				);
			}
			listeEl.append(karte);
		});

		return h(
			'div',
			{},
			h(
				'div',
				{ class: 'fwb-leiste' },
				knopf(
					'Gerät hinzufügen',
					() => {
						ui.suche = '';
						ui.geraet = neuesGeraet('').id;
						neuZeichnen();
						const namensfeld = wurzel.querySelector('.fwb-offen input');
						if (namensfeld) namensfeld.focus();
					},
					'button button-primary'
				),
				h('input', {
					type: 'search',
					class: 'regular-text',
					placeholder: 'Geräte durchsuchen …',
					value: ui.suche,
					oninput: (ev) => {
						ui.suche = ev.target.value;
						const neu = reiterGeraete();
						const alt = wurzel.querySelector('.fwb-geraete');
						alt.replaceWith(neu.querySelector('.fwb-geraete'));
					},
				})
			),
			D.geraete.length ? null : h('p', {}, 'Noch keine Geräte. Du kannst sie hier anlegen oder direkt beim Einzeichnen im Reiter „Fächer".'),
			listeEl
		);
	}

	/* ---------- Reiter: Fächer ---------- */

	function aktuellesFach() {
		let f = D.faecher.find((x) => x.id === ui.fach);
		if (!f && D.faecher.length) {
			f = D.faecher[0];
			ui.fach = f.id;
		}
		return f || null;
	}

	function aktuellerZustand(f) {
		let z = f.zustaende.find((x) => x.id === ui.zustand);
		if (!z) {
			z = f.zustaende[0];
			ui.zustand = z ? z.id : null;
		}
		return z || null;
	}

	function hotspotZeile(f, z, hs) {
		const andere = f.zustaende.filter((x) => x.id !== z.id);
		const zeile = h('tr', { class: ui.hotspot === hs.id ? 'fwb-zeile-akt' : '', 'data-hs': hs.id });
		const typ = auswahl(
			hs.typ,
			[
				['geraet', 'Gerät'],
				['schalter', 'Schalter', !andere.length],
			],
			(v) => {
				hs.typ = v;
				if (v === 'schalter') {
					hs.ziel = hs.ziel || andere[0].id;
					hs.symbol = hs.symbol || 'bogen';
					hs.label = hs.label || '';
				}
				ui.hotspot = hs.id;
				neuZeichnen();
			},
			{ 'aria-label': 'Art' }
		);

		let inhalt;
		if (hs.typ === 'geraet') {
			inhalt = h(
				'div',
				{},
				auswahl(
					hs.geraet || '',
					[['', 'Gerät wählen …'], ['__neu', '＋ Neues Gerät anlegen …'], ...D.geraete.map((g) => [g.id, g.name || '(ohne Namen)'])],
					(v) => {
						if (v === '__neu') {
							const name = window.prompt('Name des neuen Geräts:');
							hs.geraet = name && name.trim() ? neuesGeraet(name.trim()).id : hs.geraet || '';
						} else {
							hs.geraet = v;
						}
						ui.hotspot = hs.id;
						neuZeichnen();
					},
					{ class: 'fwb-hs-geraet', 'aria-label': 'Gerät' }
				),
				hs.geraet ? null : h('p', { class: 'fwb-warn' }, 'Ohne Gerät wird diese Markierung beim Speichern verworfen.')
			);
		} else {
			inhalt = h(
				'div',
				{ class: 'fwb-schalter-felder' },
				h('label', {}, 'wechselt zu ', auswahl(hs.ziel, andere.map((x) => [x.id, x.name || '(ohne Namen)']), (v) => { hs.ziel = v; neuZeichnen(); })),
				h('label', {}, 'Symbol ', auswahl(hs.symbol, Object.entries(SYMBOLE), (v) => { hs.symbol = v; sync(); })),
				eingabe(hs, 'label', { platzhalter: 'Beschriftung, z. B. Schwenkwand aufklappen', label: 'Beschriftung' })
			);
		}

		zeile.append(
			h('td', {}, typ),
			h('td', {}, inhalt),
			h(
				'td',
				{ class: 'fwb-aktionen' },
				knopf(
					'Entfernen',
					() => {
						z.hotspots.splice(z.hotspots.indexOf(hs), 1);
						neuZeichnen();
					},
					'button-link button-link-delete'
				)
			)
		);
		zeile.addEventListener('focusin', () => {
			if (ui.hotspot === hs.id) return;
			ui.hotspot = hs.id;
			wurzel.querySelectorAll('.fwb-r-akt').forEach((e) => e.classList.remove('fwb-r-akt'));
			wurzel.querySelectorAll('.fwb-zeile-akt').forEach((e) => e.classList.remove('fwb-zeile-akt'));
			zeile.classList.add('fwb-zeile-akt');
			const index = z.hotspots.indexOf(hs);
			const el = wurzel.querySelectorAll('.fwb-fl .fwb-r')[index];
			if (el) el.classList.add('fwb-r-akt');
		});
		return zeile;
	}

	function reiterFaecher() {
		const f = aktuellesFach();
		const liste = h(
			'div',
			{ class: 'fwb-seitenliste' },
			D.faecher.map((x) =>
				h(
					'button',
					{
						type: 'button',
						class: 'fwb-seitenliste-eintrag' + (f && x.id === f.id ? ' fwb-akt' : ''),
						onclick: () => {
							ui.fach = x.id;
							ui.zustand = null;
							ui.hotspot = null;
							zeichne();
						},
					},
					h('strong', {}, x.name || '?'),
					h('span', {}, x.titel)
				)
			),
			knopf(
				'Fach hinzufügen',
				() => {
					const neu = { id: neueId('f'), name: 'G' + (D.faecher.length + 1), titel: '', zustaende: [{ id: neueId('z'), name: 'Fach geöffnet', bild: 0, hotspots: [] }] };
					D.faecher.push(neu);
					ui.fach = neu.id;
					ui.zustand = null;
					neuZeichnen();
				},
				'button button-primary'
			)
		);

		if (!f) {
			return h('div', { class: 'fwb-spalten' }, liste, h('div', {}, h('p', {}, 'Lege das erste Gerätefach an. Jedes Fach bekommt ein Foto im geöffneten Zustand, auf dem du die Geräte einzeichnest.')));
		}

		const z = aktuellerZustand(f);
		const index = D.faecher.indexOf(f);
		const listenKnopf = liste.querySelector('.fwb-akt');

		const zustandsReiter = h(
			'div',
			{ class: 'fwb-unterreiter' },
			f.zustaende.map((x, i) =>
				h(
					'button',
					{
						type: 'button',
						class: 'fwb-unterreiter-knopf' + (x.id === z.id ? ' fwb-akt' : ''),
						onclick: () => {
							ui.zustand = x.id;
							ui.hotspot = null;
							zeichne();
						},
					},
					'Bild ' + (i + 1) + ': ' + (x.name || '(ohne Namen)')
				)
			),
			knopf('+ Weiteres Bild', () => {
				const neu = {
					id: neueId('z'),
					name: '',
					bild: 0,
					hotspots: z.hotspots.filter((hs) => hs.typ === 'geraet' && hs.geraet).map((hs) => ({ ...hs, id: neueId('h') })),
				};
				f.zustaende.push(neu);
				ui.zustand = neu.id;
				ui.hotspot = null;
				neuZeichnen();
				const namensfeld = wurzel.querySelector('.fwb-zustand-name');
				if (namensfeld) namensfeld.focus();
			})
		);

		const beschriftung = (hs) => {
			if (hs.typ === 'schalter') {
				const ziel = f.zustaende.find((x) => x.id === hs.ziel);
				return '⟳ ' + (hs.label || (ziel ? ziel.name : 'Schalter'));
			}
			return geraetName(hs.geraet) || 'Gerät wählen';
		};

		const editor = h(
			'div',
			{ class: 'fwb-fach-editor' },
			h(
				'div',
				{ class: 'fwb-zwei' },
				feldzeile('Kürzel', eingabe(f, 'name', { platzhalter: 'z. B. G1', nachEingabe: () => (listenKnopf.querySelector('strong').textContent = f.name || '?') })),
				feldzeile('Inhalt in Stichworten', eingabe(f, 'titel', { platzhalter: 'z. B. Wasserführende Armaturen', nachEingabe: () => (listenKnopf.querySelector('span').textContent = f.titel) }))
			),
			h(
				'p',
				{ class: 'fwb-aktionen' },
				knopf('↑ nach oben', () => verschiebe(D.faecher, index, -1), 'button button-small'),
				knopf('↓ nach unten', () => verschiebe(D.faecher, index, 1), 'button button-small'),
				knopf(
					'Fach löschen',
					() => {
						if (!window.confirm('Fach „' + (f.name || '?') + '" mit allen Bildern und Markierungen löschen? Die Geräte bleiben in der Geräteliste.')) return;
						D.faecher.splice(index, 1);
						D.ansichten.forEach((a) => (a.faecher = a.faecher.filter((r) => r.fach !== f.id)));
						ui.fach = null;
						ui.zustand = null;
						neuZeichnen();
					},
					'button-link button-link-delete'
				)
			),
			h('h3', {}, 'Bilder des Fachs'),
			h('p', { class: 'description' }, 'Ein Fach hat ein Bild pro Zustand, zum Beispiel „Schwenkwand geschlossen" und „Schwenkwand geöffnet". Ein Schalter auf dem Foto wechselt zum anderen Bild. Ein weiteres Bild übernimmt die Geräte-Markierungen des aktuellen Bildes als Vorlage.'),
			zustandsReiter,
			h(
				'div',
				{ class: 'fwb-zwei' },
				feldzeile('Name dieses Bildes', eingabe(z, 'name', { class: 'regular-text fwb-zustand-name', platzhalter: 'z. B. Schwenkwand geöffnet', nachEingabe: () => {
					const k = zustandsReiter.querySelector('.fwb-akt');
					if (k) k.textContent = 'Bild ' + (f.zustaende.indexOf(z) + 1) + ': ' + (z.name || '(ohne Namen)');
				} })),
				feldzeile('Foto', bildwahl(z, 'bild'))
			),
			f.zustaende.length > 1
				? h(
						'p',
						{},
						knopf(
							'Dieses Bild löschen',
							() => {
								if (!window.confirm('Bild „' + (z.name || '') + '" mit seinen Markierungen löschen?')) return;
								f.zustaende.splice(f.zustaende.indexOf(z), 1);
								f.zustaende.forEach((x) => (x.hotspots = x.hotspots.filter((hs) => hs.typ !== 'schalter' || hs.ziel !== z.id)));
								ui.zustand = null;
								neuZeichnen();
							},
							'button-link button-link-delete'
						)
				  )
				: null,
			h('p', { class: 'fwb-anleitung' }, 'Ziehe mit der Maus einen Rahmen um ein Gerät. Rahmen lassen sich verschieben und an der Ecke unten rechts in der Größe ändern.'),
			flaeche(z.bild, z.hotspots, {
				gewaehlt: ui.hotspot,
				beschriftung,
				klasse: (hs) => (hs.typ === 'schalter' ? 'fwb-r-schalter' : hs.geraet ? '' : 'fwb-r-offen'),
				beiWahl: (id) => {
					ui.hotspot = id;
					zeichne();
				},
				beiNeu: (r) => {
					const hs = { id: neueId('h'), typ: 'geraet', geraet: '', ...r };
					z.hotspots.push(hs);
					ui.hotspot = hs.id;
					neuZeichnen();
					const wahl = wurzel.querySelector('[data-hs="' + hs.id + '"] .fwb-hs-geraet');
					if (wahl) wahl.focus();
				},
			}),
			z.hotspots.length
				? h(
						'table',
						{ class: 'fwb-tabelle' },
						h('thead', {}, h('tr', {}, h('th', {}, 'Art'), h('th', {}, 'Markierung'), h('th', {}, ''))),
						h('tbody', {}, z.hotspots.map((hs) => hotspotZeile(f, z, hs)))
				  )
				: h('p', { class: 'description' }, 'Auf diesem Bild ist noch nichts eingezeichnet.')
		);

		return h('div', { class: 'fwb-spalten' }, liste, editor);
	}

	/* ---------- Reiter: Ansichten ---------- */

	function reiterAnsichten() {
		let a = D.ansichten.find((x) => x.id === ui.ansicht);
		if (!a && D.ansichten.length) {
			a = D.ansichten[0];
			ui.ansicht = a.id;
		}
		const fachName = (id) => {
			const f = D.faecher.find((x) => x.id === id);
			return f ? f.name || '?' : '';
		};

		const reiter = h(
			'div',
			{ class: 'fwb-unterreiter' },
			D.ansichten.map((x) =>
				h(
					'button',
					{
						type: 'button',
						class: 'fwb-unterreiter-knopf' + (a && x.id === a.id ? ' fwb-akt' : ''),
						onclick: () => {
							ui.ansicht = x.id;
							ui.hotspot = null;
							zeichne();
						},
					},
					x.name || '(ohne Namen)'
				)
			),
			knopf('+ Ansicht hinzufügen', () => {
				const vorschlaege = ['Fahrerseite', 'Beifahrerseite', 'Heck', 'Dach'];
				const neu = { id: neueId('a'), name: vorschlaege[D.ansichten.length] || '', bild: 0, faecher: [] };
				D.ansichten.push(neu);
				ui.ansicht = neu.id;
				neuZeichnen();
			})
		);

		if (!a) {
			return h('div', {}, h('p', {}, 'Eine Ansicht ist ein Foto des Fahrzeugs von außen, zum Beispiel die Fahrerseite mit geschlossenen Rollläden. Darauf zeichnest du ein, wo welches Fach liegt.'), reiter);
		}

		return h(
			'div',
			{},
			h('p', { class: 'description' }, 'Eine Ansicht ist ein Foto des Fahrzeugs von außen. Ziehe einen Rahmen um jedes Gerätefach und wähle, welches Fach es ist.'),
			reiter,
			h(
				'div',
				{ class: 'fwb-zwei' },
				feldzeile('Name der Ansicht', eingabe(a, 'name', { platzhalter: 'z. B. Fahrerseite', nachEingabe: () => (reiter.querySelector('.fwb-akt').textContent = a.name || '(ohne Namen)') })),
				feldzeile('Foto', bildwahl(a, 'bild'))
			),
			h(
				'p',
				{},
				knopf(
					'Diese Ansicht löschen',
					() => {
						if (!window.confirm('Ansicht „' + (a.name || '') + '" löschen? Die Fächer selbst bleiben erhalten.')) return;
						D.ansichten.splice(D.ansichten.indexOf(a), 1);
						ui.ansicht = null;
						neuZeichnen();
					},
					'button-link button-link-delete'
				)
			),
			D.faecher.length ? null : h('p', { class: 'fwb-warn' }, 'Lege zuerst im Reiter „Fächer" die Gerätefächer an.'),
			flaeche(a.bild, a.faecher, {
				gewaehlt: ui.hotspot,
				beschriftung: (r) => fachName(r.fach) || 'Fach wählen',
				klasse: (r) => (r.fach ? '' : 'fwb-r-offen'),
				beiWahl: (id) => {
					ui.hotspot = id;
					zeichne();
				},
				beiNeu: (r) => {
					const belegt = a.faecher.map((x) => x.fach);
					const frei = D.faecher.find((f) => !belegt.includes(f.id));
					const neu = { id: neueId('h'), fach: frei ? frei.id : '', ...r };
					a.faecher.push(neu);
					ui.hotspot = neu.id;
					neuZeichnen();
				},
			}),
			a.faecher.length
				? h(
						'table',
						{ class: 'fwb-tabelle' },
						h('thead', {}, h('tr', {}, h('th', {}, 'Fach'), h('th', {}, ''))),
						h(
							'tbody',
							{},
							a.faecher.map((r) =>
								h(
									'tr',
									{ class: ui.hotspot === r.id ? 'fwb-zeile-akt' : '' },
									h(
										'td',
										{},
										auswahl(r.fach, [['', 'Fach wählen …'], ...D.faecher.map((f) => [f.id, (f.name || '?') + (f.titel ? ' – ' + f.titel : '')])], (v) => {
											r.fach = v;
											ui.hotspot = r.id;
											neuZeichnen();
										}),
										r.fach ? null : h('span', { class: 'fwb-warn' }, ' Ohne Fach wird der Rahmen beim Speichern verworfen.')
									),
									h(
										'td',
										{ class: 'fwb-aktionen' },
										knopf(
											'Entfernen',
											() => {
												a.faecher.splice(a.faecher.indexOf(r), 1);
												neuZeichnen();
											},
											'button-link button-link-delete'
										)
									)
								)
							)
						)
				  )
				: null
		);
	}

	/* ---------- Rahmen ---------- */

	function zeichne() {
		const reiter = [
			['stammdaten', 'Stammdaten', reiterStammdaten],
			['faecher', 'Fächer (' + D.faecher.length + ')', reiterFaecher],
			['geraete', 'Geräte (' + D.geraete.length + ')', reiterGeraete],
			['ansichten', 'Außenansichten (' + D.ansichten.length + ')', reiterAnsichten],
		];
		const aktiv = reiter.find((r) => r[0] === ui.tab) || reiter[0];
		const scroll = window.scrollY;
		wurzel.replaceChildren(
			h(
				'nav',
				{ class: 'nav-tab-wrapper fwb-reiter' },
				reiter.map(([id, text]) =>
					h(
						'button',
						{
							type: 'button',
							class: 'nav-tab' + (id === aktiv[0] ? ' nav-tab-active' : ''),
							onclick: () => {
								ui.tab = id;
								ui.hotspot = null;
								zeichne();
							},
						},
						text
					)
				)
			),
			h('div', { class: 'fwb-inhalt' }, aktiv[2]()),
			h('p', { class: 'fwb-speicherhinweis' }, 'Änderungen werden erst gespeichert, wenn du oben rechts auf „Veröffentlichen" oder „Aktualisieren" klickst.')
		);
		window.scrollTo(0, scroll);
	}

	if (cfg.neu && !D.info.felder.length) {
		D.info.felder = STANDARDFELDER.map((l) => ({ label: l, wert: '' }));
	}
	sync(false);
	zeichne();

	const formular = document.getElementById('post');
	if (formular) formular.addEventListener('submit', () => { sync(false); sendet = true; });
	window.addEventListener('beforeunload', (ev) => {
		if (geaendert && !sendet) {
			ev.preventDefault();
			ev.returnValue = '';
		}
	});
})();
