/* Feuerwehr Beladung – Lernseite. Ohne Build-Schritt, reines JavaScript. */
(function () {
	'use strict';

	const cfg = window.FWB_APP;
	const wurzel = document.getElementById('fwb-app');
	if (!cfg || !wurzel) return;

	const S = {
		fahrzeuge: [],
		fz: null,
		tab: 'beladung',
		ansicht: null,
		fach: null,
		zustand: null,
		geraet: null,
		marken: true,
		alleDaten: false,
		suche: '',
		lern: { entschieden: false, speichern: false, fahrzeuge: {}, verlauf: [] },
		quiz: null,
		fehler: '',
		animation: '',
	};

	const SICHER_AB = 2; // richtige Antworten in Folge, ab denen ein Gerät als sicher gilt
	const RUNDE = 10;

	const PFEILE = {
		bogen: '<path d="M7 16a9 9 0 1 1 3 6.7"/><path d="M5 10v6h6"/>',
		'bogen-zurueck': '<path d="M25 16a9 9 0 1 0-3 6.7"/><path d="M27 10v6h-6"/>',
		runter: '<path d="M16 6v19"/><path d="M8 17l8 8 8-8"/>',
		hoch: '<path d="M16 26V7"/><path d="M8 15l8-8 8 8"/>',
		links: '<path d="M26 16H7"/><path d="M15 8l-8 8 8 8"/>',
		rechts: '<path d="M6 16h19"/><path d="M17 8l8 8-8 8"/>',
	};

	/* ---------- Hilfen ---------- */

	function h(tag, attrs, ...kinder) {
		const e = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs || {})) {
			if (v == null || v === false) continue;
			if (k === 'class') e.className = v;
			else if (k === 'style') Object.assign(e.style, v);
			else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
			else if (['value', 'checked', 'disabled'].includes(k)) e[k] = v;
			else e.setAttribute(k, v === true ? '' : v);
		}
		for (const c of kinder.flat(Infinity)) {
			if (c == null || c === false) continue;
			e.append(c.nodeType ? c : document.createTextNode(String(c)));
		}
		return e;
	}

	function symbol(name) {
		const s = h('span', { class: 'fwb-symbol', 'aria-hidden': 'true' });
		s.innerHTML = '<svg viewBox="0 0 32 32">' + (PFEILE[name] || PFEILE.bogen) + '</svg>';
		return s;
	}

	async function api(pfad, methode = 'GET', daten) {
		const antwort = await fetch(cfg.rest + pfad, {
			method: methode,
			credentials: 'same-origin',
			headers: Object.assign({ 'X-WP-Nonce': cfg.nonce }, daten ? { 'Content-Type': 'application/json' } : {}),
			body: daten ? JSON.stringify(daten) : undefined,
		});
		if (!antwort.ok) throw new Error(antwort.status === 403 || antwort.status === 401 ? 'Du bist nicht mehr angemeldet. Bitte lade die Seite neu.' : 'Der Server hat mit Status ' + antwort.status + ' geantwortet.');
		return antwort.json();
	}

	const mische = (a) => {
		a = a.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	};

	const datum = (t) => new Date(t * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

	/* ---------- Daten ---------- */

	/** Baut Nachschlagetabellen für ein geladenes Fahrzeug. */
	function bereite(fz) {
		const d = fz.daten;
		fz.geraet = new Map(d.geraete.map((g) => [g.id, g]));
		fz.orte = new Map(); // Gerät → [{ fach, zustand }]
		fz.nummer = new Map(); // Fach → (Gerät → laufende Nummer)
		d.faecher.forEach((f) => {
			const nummern = new Map();
			f.zustaende.forEach((z) =>
				z.hotspots.forEach((hs) => {
					if (hs.typ !== 'geraet') return;
					if (!nummern.has(hs.geraet)) nummern.set(hs.geraet, nummern.size + 1);
					if (!fz.orte.has(hs.geraet)) fz.orte.set(hs.geraet, []);
					fz.orte.get(hs.geraet).push({ fach: f, zustand: z });
				})
			);
			fz.nummer.set(f.id, nummern);
		});
		return fz;
	}

	const bild = (id) => (S.fz && id ? S.fz.bilder[id] || null : null);
	const fachVon = (id) => S.fz.daten.faecher.find((f) => f.id === id) || null;
	const faecherVon = (geraetId) => [...new Set((S.fz.orte.get(geraetId) || []).map((o) => o.fach))];
	const standVon = (geraetId) => ((S.lern.fahrzeuge || {})[S.fz.id] || {})[geraetId] || null;

	function ortText(g, fach) {
		return (fach.name || '?') + (g.ort ? ' › ' + g.ort : '');
	}

	async function oeffneFahrzeug(id) {
		S.fehler = '';
		S.fz = null;
		S.laedt = true;
		zeichne();
		try {
			S.fz = bereite(await api('/fahrzeuge/' + id));
			Object.assign(S, { tab: 'beladung', ansicht: null, fach: null, zustand: null, geraet: null, quiz: null, suche: '', alleDaten: false });
		} catch (e) {
			S.fehler = e.message;
		}
		S.laedt = false;
		zeichne();
	}

	function oeffneFach(fachId, zustandId, geraetId) {
		const f = fachVon(fachId);
		if (!f || !f.zustaende.length) return;
		const z = f.zustaende.find((x) => x.id === zustandId) || f.zustaende[0];
		Object.assign(S, { tab: 'beladung', fach: f.id, zustand: z.id, geraet: geraetId || null, suche: '', animation: geraetId ? '' : 'rollladen' });
		zeichne();
		wurzel.scrollIntoView({ block: 'start', behavior: 'auto' });
	}

	function oeffneGeraet(geraetId) {
		const ort = (S.fz.orte.get(geraetId) || [])[0];
		if (ort) oeffneFach(ort.fach.id, ort.zustand.id, geraetId);
	}

	/* ---------- Bausteine ---------- */

	function bildflaeche(b, kinder, leerText) {
		const box = h('div', { class: 'fwb-bild' + (b ? '' : ' fwb-bild-leer'), style: { aspectRatio: b ? b.w + ' / ' + b.h : '4 / 3' } });
		if (b) box.append(h('img', { src: b.url, alt: '' }));
		else box.append(h('span', { class: 'fwb-bild-hinweis' }, leerText || 'Foto folgt'));
		box.append(...kinder.filter(Boolean));
		return box;
	}

	const rechteck = (r) => ({ left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' });

	function steckbrief() {
		const info = S.fz.daten.info;
		const felder = info.felder.filter((f) => f.wert);
		const sichtbar = S.alleDaten ? felder : felder.slice(0, 4);
		const foto = bild(info.bild);
		if (!felder.length && !info.kurz && !foto) return null;
		return h(
			'section',
			{ class: 'fwb-steckbrief' },
			foto ? h('img', { class: 'fwb-steckbrief-foto', src: foto.url, alt: 'Foto ' + S.fz.titel }) : null,
			h(
				'div',
				{ class: 'fwb-steckbrief-text' },
				info.kurz ? h('p', { class: 'fwb-kurz' }, info.kurz) : null,
				sichtbar.length ? h('dl', { class: 'fwb-fakten' }, sichtbar.map((f) => h('div', {}, h('dt', {}, f.label), h('dd', {}, f.wert)))) : null,
				felder.length > 4
					? h(
							'button',
							{
								type: 'button',
								class: 'fwb-link',
								'aria-expanded': String(S.alleDaten),
								onclick: () => {
									S.alleDaten = !S.alleDaten;
									zeichne();
								},
							},
							S.alleDaten ? 'Weniger anzeigen' : 'Alle ' + felder.length + ' Fahrzeugdaten anzeigen'
					  )
					: null
			)
		);
	}

	function kopf() {
		const tabs = [
			['beladung', 'Beladung'],
			['quiz', 'Quiz'],
			['lernstand', 'Mein Lernstand'],
		];
		return h(
			'header',
			{ class: 'fwb-kopf' },
			S.fahrzeuge.length > 1
				? h(
						'button',
						{
							type: 'button',
							class: 'fwb-link',
							onclick: () => {
								S.fz = null;
								zeichne();
							},
						},
						'← Alle Fahrzeuge'
				  )
				: null,
			h(
				'div',
				{ class: 'fwb-titelzeile' },
				h('h2', { class: 'fwb-titel' }, S.fz.titel),
				S.fz.entwurf ? h('span', { class: 'fwb-marke' }, 'Entwurf, nur für Bearbeiter sichtbar') : null,
				cfg.bearbeiten ? h('a', { class: 'fwb-link', href: cfg.bearbeiten + S.fz.id }, 'Bearbeiten') : null
			),
			steckbrief(),
			h(
				'div',
				{ class: 'fwb-leiste' },
				h(
					'nav',
					{ class: 'fwb-tabs', 'aria-label': 'Bereiche' },
					tabs.map(([id, text]) =>
						h(
							'button',
							{
								type: 'button',
								class: 'fwb-tab' + (S.tab === id && !S.suche ? ' fwb-akt' : ''),
								onclick: () => {
									S.tab = id;
									S.suche = '';
									if (id === 'beladung') S.fach = null;
									zeichne();
								},
							},
							text
						)
					)
				),
				h('input', {
					type: 'search',
					class: 'fwb-suche',
					placeholder: 'Gerät suchen …',
					'aria-label': 'Gerät suchen',
					value: S.suche,
					oninput: (ev) => {
						const vorher = !!S.suche;
						S.suche = ev.target.value;
						if (vorher !== !!S.suche) {
							zeichne();
							const feld = wurzel.querySelector('.fwb-suche');
							feld.focus();
							feld.setSelectionRange(feld.value.length, feld.value.length);
						} else if (S.suche) {
							wurzel.querySelector('.fwb-haupt').replaceChildren(sucheAnsicht());
						}
					},
				})
			)
		);
	}

	/* ---------- Suche ---------- */

	function sucheAnsicht() {
		const q = S.suche.trim().toLowerCase();
		const treffer = S.fz.daten.geraete.filter((g) => g.name.toLowerCase().includes(q));
		if (!treffer.length) return h('p', { class: 'fwb-leer' }, 'Kein Gerät gefunden.');
		return h(
			'ul',
			{ class: 'fwb-treffer' },
			treffer.map((g) => {
				const faecher = faecherVon(g.id);
				return h(
					'li',
					{},
					h(
						'button',
						{ type: 'button', disabled: !faecher.length, onclick: () => oeffneGeraet(g.id) },
						h('strong', {}, g.name),
						h('span', {}, faecher.length ? faecher.map((f) => ortText(g, f)).join(' · ') : 'noch nicht eingezeichnet')
					)
				);
			})
		);
	}

	/* ---------- Beladung: Fahrzeug von außen ---------- */

	function fahrzeugAnsicht() {
		const d = S.fz.daten;
		if (!d.faecher.length) return h('p', { class: 'fwb-leer' }, 'Für dieses Fahrzeug ist noch keine Beladung hinterlegt.');
		const a = d.ansichten.find((x) => x.id === S.ansicht) || d.ansichten[0] || null;
		const teile = [];

		if (a) {
			if (d.ansichten.length > 1) {
				teile.push(
					h(
						'div',
						{ class: 'fwb-wahl' },
						d.ansichten.map((x) =>
							h(
								'button',
								{
									type: 'button',
									class: 'fwb-chip' + (x.id === a.id ? ' fwb-akt' : ''),
									onclick: () => {
										S.ansicht = x.id;
										zeichne();
									},
								},
								x.name || 'Ansicht'
							)
						)
					)
				);
			}
			teile.push(
				bildflaeche(
					bild(a.bild),
					a.faecher.map((r) => {
						const f = fachVon(r.fach);
						return f
							? h(
									'button',
									{ type: 'button', class: 'fwb-hs fwb-hs-fach', style: rechteck(r), 'aria-label': 'Fach ' + f.name + (f.titel ? ', ' + f.titel : '') + ' öffnen', onclick: () => oeffneFach(f.id) },
									h('span', { class: 'fwb-hs-name' }, f.name)
							  )
							: null;
					}),
					'Foto „' + (a.name || 'Ansicht') + '" folgt'
				),
				h('p', { class: 'fwb-hinweis' }, 'Tippe auf ein Gerätefach, um es zu öffnen.')
			);
		}

		teile.push(
			h('h3', { class: 'fwb-zwischentitel' }, 'Alle Fächer'),
			h(
				'div',
				{ class: 'fwb-fachliste' },
				d.faecher.map((f) =>
					h(
						'button',
						{ type: 'button', class: 'fwb-fachkarte', onclick: () => oeffneFach(f.id) },
						h('span', { class: 'fwb-fachkarte-name' }, f.name || '?'),
						h('span', { class: 'fwb-fachkarte-text' }, f.titel || 'Gerätefach', h('small', {}, S.fz.nummer.get(f.id).size + ' Geräte'))
					)
				)
			)
		);
		return h('div', {}, teile);
	}

	/* ---------- Beladung: geöffnetes Fach ---------- */

	function geraetKarte(g, f) {
		const foto = bild(g.bild);
		const zeilen = [
			['Menge', g.menge],
			['Was ist das?', g.beschreibung],
			['Im Einsatz', g.einsatz],
		].filter((z) => z[1]);
		return h(
			'article',
			{ class: 'fwb-geraet' },
			h('p', { class: 'fwb-ueber' }, ortText(g, f) + ' · Nr. ' + S.fz.nummer.get(f.id).get(g.id)),
			h('h4', {}, g.name),
			foto ? h('img', { class: 'fwb-geraet-foto', src: foto.url, alt: g.name }) : null,
			zeilen.length ? h('dl', {}, zeilen.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null
		);
	}

	function fachAnsicht() {
		const f = fachVon(S.fach);
		const z = f.zustaende.find((x) => x.id === S.zustand) || f.zustaende[0];
		const nummern = S.fz.nummer.get(f.id);
		const foto = bild(z.bild);
		const animation = S.animation;
		S.animation = '';

		const waehle = (id) => {
			S.geraet = id;
			wurzel.querySelectorAll('[data-geraet]').forEach((e) => e.classList.toggle('fwb-akt', e.dataset.geraet === id));
			const g = S.fz.geraet.get(id);
			wurzel.querySelector('.fwb-info-karte').replaceChildren(geraetKarte(g, f));
		};

		const schalterKnoepfe = [];
		const hotspots = z.hotspots.map((hs) => {
			if (hs.typ === 'schalter') {
				const ziel = f.zustaende.find((x) => x.id === hs.ziel);
				const text = hs.label || (ziel ? ziel.name : 'Umschalten');
				const schalte = () => {
					S.zustand = hs.ziel;
					S.animation = 'blende';
					if (S.geraet && !ziel.hotspots.some((x) => x.geraet === S.geraet)) S.geraet = null;
					zeichne();
					const neu = wurzel.querySelector('.fwb-schalter');
					if (neu) neu.focus({ preventScroll: true });
				};
				schalterKnoepfe.push(h('button', { type: 'button', class: 'fwb-knopf fwb-schalter-unten', onclick: schalte }, symbol(hs.symbol), text));
				return h(
					'button',
					{ type: 'button', class: 'fwb-schalter', style: { left: hs.x + hs.w / 2 + '%', top: hs.y + hs.h / 2 + '%' }, 'aria-label': text, title: text, onclick: schalte },
					symbol(hs.symbol),
					hs.w >= 36 ? h('span', { class: 'fwb-schalter-text' }, text) : null
				);
			}
			const g = S.fz.geraet.get(hs.geraet);
			return h(
				'button',
				{
					type: 'button',
					class: 'fwb-hs fwb-hs-geraet' + (S.geraet === g.id ? ' fwb-akt' : ''),
					style: rechteck(hs),
					'data-geraet': g.id,
					'aria-label': nummern.get(g.id) + ': ' + g.name,
					onclick: () => waehle(g.id),
				},
				h('span', { class: 'fwb-hs-nr' }, nummern.get(g.id)),
				foto ? null : h('span', { class: 'fwb-hs-name' }, g.name)
			);
		});

		const gruppen = new Map();
		z.hotspots.forEach((hs) => {
			if (hs.typ !== 'geraet') return;
			const g = S.fz.geraet.get(hs.geraet);
			const ort = g.ort || 'Im Fach';
			if (!gruppen.has(ort)) gruppen.set(ort, new Set());
			gruppen.get(ort).add(g);
		});

		const gewaehlt = S.geraet ? S.fz.geraet.get(S.geraet) : null;

		return h(
			'div',
			{ class: 'fwb-fach' },
			h(
				'div',
				{ class: 'fwb-fach-kopf' },
				h(
					'button',
					{
						type: 'button',
						class: 'fwb-link',
						onclick: () => {
							S.fach = null;
							zeichne();
						},
					},
					'← Zurück zum Fahrzeug'
				),
				h('h3', { class: 'fwb-fach-titel' }, h('span', { class: 'fwb-fach-name' }, f.name), f.titel),
				h(
					'button',
					{
						type: 'button',
						class: 'fwb-knopf',
						'aria-pressed': String(!S.marken),
						onclick: () => {
							S.marken = !S.marken;
							zeichne();
						},
					},
					S.marken ? 'Markierungen ausblenden' : 'Markierungen einblenden'
				)
			),
			f.zustaende.length > 1
				? h(
						'div',
						{ class: 'fwb-wahl' },
						f.zustaende.map((x, i) =>
							h(
								'button',
								{
									type: 'button',
									class: 'fwb-chip' + (x.id === z.id ? ' fwb-akt' : ''),
									onclick: () => {
										S.zustand = x.id;
										S.animation = 'blende';
										zeichne();
									},
								},
								'Bild ' + (i + 1) + ': ' + (x.name || 'ohne Namen')
							)
						)
				  )
				: null,
			h(
				'div',
				{ class: 'fwb-fach-raster' },
				h(
					'div',
					{ class: 'fwb-fach-bild' + (S.marken ? '' : ' fwb-ohne-marken') + (animation === 'blende' ? ' fwb-blende' : '') },
					bildflaeche(bild(z.bild), [...hotspots, animation === 'rollladen' ? h('div', { class: 'fwb-rollladen', 'aria-hidden': 'true' }) : null], 'Foto „' + (z.name || f.name) + '" folgt'),
					schalterKnoepfe.length ? h('div', { class: 'fwb-knopfreihe' }, schalterKnoepfe) : null
				),
				h(
					'div',
					{ class: 'fwb-info' },
					h('div', { class: 'fwb-info-karte' }, gewaehlt ? geraetKarte(gewaehlt, f) : h('p', { class: 'fwb-hinweis' }, z.hotspots.length ? 'Tippe auf ein Gerät im Foto oder in der Liste.' : 'Auf diesem Bild ist noch nichts eingezeichnet.')),
					[...gruppen].map(([ort, geraete]) =>
						h(
							'div',
							{ class: 'fwb-gruppe' },
							h('p', { class: 'fwb-ueber' }, ort),
							h(
								'div',
								{ class: 'fwb-wahl' },
								[...geraete].map((g) => h('button', { type: 'button', class: 'fwb-chip' + (S.geraet === g.id ? ' fwb-akt' : ''), 'data-geraet': g.id, onclick: () => waehle(g.id) }, nummern.get(g.id) + ' · ' + g.name))
							)
						)
					)
				)
			)
		);
	}

	/* ---------- Quiz ---------- */

	function quizGeraete() {
		return S.fz.daten.geraete.filter((g) => faecherVon(g.id).length);
	}

	function neuesQuiz(nurIds) {
		let pool = quizGeraete();
		if (nurIds) pool = pool.filter((g) => nurIds.has(g.id));
		// Unsichere und neue Geräte kommen mit höherer Wahrscheinlichkeit dran.
		const gewichtet = pool.map((g) => {
			const e = standVon(g.id);
			let gewicht = e ? 1 + e.f * 1.5 : 2.5;
			if (e && e.s >= SICHER_AB) gewicht *= 0.35;
			return { g, schluessel: Math.pow(Math.random(), 1 / gewicht) };
		});
		gewichtet.sort((a, b) => b.schluessel - a.schluessel);
		const auswahl = gewichtet.slice(0, nurIds ? pool.length : RUNDE).map((x) => x.g.id);
		return { queue: mische(auswahl), richtig: 0, gefragt: 0, serie: 0, fehler: new Set(), wiederholt: new Set(), antwort: null, fertig: false };
	}

	function starteQuiz(nurIds) {
		S.quiz = neuesQuiz(nurIds);
		zeichne();
	}

	function beantworte(fachId) {
		const q = S.quiz;
		if (q.antwort) return;
		const geraetId = q.queue.shift();
		const richtig = faecherVon(geraetId).some((f) => f.id === fachId);
		q.gefragt++;
		if (richtig) {
			q.richtig++;
			q.serie++;
		} else {
			q.serie = 0;
			q.fehler.add(geraetId);
			if (!q.wiederholt.has(geraetId)) {
				q.wiederholt.add(geraetId);
				q.queue.splice(Math.min(3, q.queue.length), 0, geraetId);
			}
		}
		q.antwort = { geraetId, fachId, richtig };

		if (S.lern.speichern) {
			const alle = S.lern.fahrzeuge;
			const fz = (alle[S.fz.id] = alle[S.fz.id] || {});
			const e = (fz[geraetId] = fz[geraetId] || { r: 0, f: 0, s: 0 });
			if (richtig) {
				e.r++;
				e.s++;
			} else {
				e.f++;
				e.s = 0;
			}
			api('/lernstand/antwort', 'POST', { fahrzeug: S.fz.id, geraet: geraetId, richtig }).catch(() => {});
		}
		zeichne();
		const weiter = wurzel.querySelector('.fwb-weiter');
		if (weiter) weiter.focus({ preventScroll: true });
	}

	function naechsteFrage() {
		const q = S.quiz;
		q.antwort = null;
		if (!q.queue.length) {
			q.fertig = true;
			if (S.lern.speichern) {
				api('/lernstand/runde', 'POST', { fahrzeug: S.fz.id, richtig: q.richtig, gesamt: q.gefragt })
					.then((l) => {
						S.lern = l;
					})
					.catch(() => {});
			}
		}
		zeichne();
	}

	function einwilligung(danach) {
		const setze = async (speichern) => {
			try {
				S.lern = await api('/lernstand/einstellung', 'POST', { speichern });
			} catch (e) {
				S.lern.entschieden = true;
			}
			danach();
		};
		return h(
			'div',
			{ class: 'fwb-karte fwb-frage-speichern' },
			h('h3', {}, 'Soll dein Lernfortschritt gespeichert werden?'),
			h('p', {}, 'Dann merkt sich die Seite, welche Geräte du sicher kannst, und fragt unsichere öfter ab. Nur du siehst deinen Lernstand. Du kannst die Speicherung unter „Mein Lernstand" jederzeit ausschalten oder alles zurücksetzen.'),
			h('div', { class: 'fwb-knopfreihe' }, h('button', { type: 'button', class: 'fwb-knopf fwb-primaer', onclick: () => setze(true) }, 'Ja, speichern'), h('button', { type: 'button', class: 'fwb-knopf', onclick: () => setze(false) }, 'Nein, ohne Speichern üben'))
		);
	}

	function quizAnsicht() {
		const d = S.fz.daten;
		const pool = quizGeraete();
		if (pool.length < 1 || d.faecher.length < 2) return h('p', { class: 'fwb-leer' }, 'Für ein Quiz braucht das Fahrzeug mindestens zwei Fächer mit eingezeichneten Geräten.');
		if (!S.lern.entschieden) return einwilligung(() => starteQuiz());
		if (!S.quiz) S.quiz = neuesQuiz();
		const q = S.quiz;

		if (q.fertig) {
			const fehler = [...q.fehler].map((id) => S.fz.geraet.get(id));
			return h(
				'div',
				{ class: 'fwb-karte' },
				h('p', { class: 'fwb-ueber' }, 'Runde beendet'),
				h('h3', { class: 'fwb-ergebnis' }, q.richtig + ' von ' + q.gefragt + ' richtig'),
				fehler.length
					? [h('p', {}, 'Hier hakt es noch:'), h('ul', { class: 'fwb-fehlerliste' }, fehler.map((g) => h('li', {}, h('button', { type: 'button', class: 'fwb-link', onclick: () => oeffneGeraet(g.id) }, g.name), ' → ' + faecherVon(g.id).map((f) => ortText(g, f)).join(' · '))))]
					: h('p', {}, 'Keine Fehler. Stark!'),
				h(
					'div',
					{ class: 'fwb-knopfreihe' },
					h('button', { type: 'button', class: 'fwb-knopf fwb-primaer', onclick: () => starteQuiz() }, 'Neue Runde'),
					fehler.length ? h('button', { type: 'button', class: 'fwb-knopf', onclick: () => starteQuiz(new Set(q.fehler)) }, 'Nur die Fehler üben') : null
				),
				S.lern.speichern ? null : h('p', { class: 'fwb-hinweis' }, 'Dein Lernfortschritt wird nicht gespeichert.')
			);
		}

		const a = q.antwort;
		const g = S.fz.geraet.get(a ? a.geraetId : q.queue[0]);
		const richtige = faecherVon(g.id);
		const gesamt = q.gefragt + q.queue.length;

		// Fächer nach Außenansicht gruppieren, damit die Lage am Fahrzeug erkennbar bleibt.
		const gruppen = [];
		const verteilt = new Set();
		d.ansichten.forEach((an) => {
			const faecher = an.faecher.map((r) => fachVon(r.fach)).filter((f) => f && !verteilt.has(f.id));
			faecher.forEach((f) => verteilt.add(f.id));
			if (faecher.length) gruppen.push([an.name || 'Ansicht', faecher]);
		});
		const rest = d.faecher.filter((f) => !verteilt.has(f.id));
		if (rest.length) gruppen.push([gruppen.length ? 'Weitere Fächer' : 'Fächer', rest]);

		return h(
			'div',
			{ class: 'fwb-quiz' },
			h(
				'div',
				{ class: 'fwb-karte' },
				h('div', { class: 'fwb-fortschritt' }, h('span', {}, 'Frage ' + Math.min(q.gefragt + (a ? 0 : 1), gesamt) + ' von ' + gesamt), h('span', {}, q.richtig + ' richtig · ' + q.serie + ' in Folge')),
				h('div', { class: 'fwb-balken' }, h('i', { style: { width: (q.gefragt / gesamt) * 100 + '%' } })),
				h('p', { class: 'fwb-ueber' }, 'In welchem Fach liegt …'),
				h('h3', { class: 'fwb-frage' }, g.name),
				g.menge ? h('p', { class: 'fwb-hinweis' }, g.menge) : null,
				a
					? h(
							'div',
							{ class: 'fwb-rueckmeldung ' + (a.richtig ? 'fwb-ok' : 'fwb-falsch'), role: 'status' },
							h('strong', {}, a.richtig ? 'Richtig!' : 'Leider nein, nicht in ' + (fachVon(a.fachId).name || '?') + '.'),
							h('p', {}, g.name + ' liegt in ' + richtige.map((f) => ortText(g, f) + (f.titel ? ' (' + f.titel + ')' : '')).join(' und in ') + '.' + (a.richtig || !q.queue.includes(g.id) ? '' : ' Die Frage kommt gleich noch einmal.')),
							h('div', { class: 'fwb-knopfreihe' }, h('button', { type: 'button', class: 'fwb-knopf fwb-primaer fwb-weiter', onclick: naechsteFrage }, q.queue.length ? 'Weiter' : 'Zum Ergebnis'), h('button', { type: 'button', class: 'fwb-knopf', onclick: () => oeffneGeraet(g.id) }, 'Im Fach zeigen'))
					  )
					: null
			),
			h(
				'div',
				{ class: 'fwb-karte fwb-antworten' },
				gruppen.map(([name, faecher]) =>
					h(
						'div',
						{ class: 'fwb-antwortgruppe' },
						h('p', { class: 'fwb-ueber' }, name),
						h(
							'div',
							{ class: 'fwb-antwortknoepfe' },
							faecher.map((f) => {
								let klasse = 'fwb-antwort';
								if (a && richtige.includes(f)) klasse += ' fwb-ok';
								else if (a && a.fachId === f.id) klasse += ' fwb-falsch';
								return h('button', { type: 'button', class: klasse, disabled: !!a, onclick: () => beantworte(f.id) }, f.name || '?');
							})
						)
					)
				)
			)
		);
	}

	/* ---------- Mein Lernstand ---------- */

	function lernstandAnsicht() {
		const an = S.lern.speichern;
		const setze = async (speichern) => {
			if (!speichern && !window.confirm('Speicherung ausschalten? Dein gespeicherter Lernstand und der Verlauf werden dabei gelöscht.')) {
				zeichne();
				return;
			}
			try {
				S.lern = await api('/lernstand/einstellung', 'POST', { speichern });
			} catch (e) {
				S.fehler = e.message;
			}
			zeichne();
		};
		const loesche = async (fahrzeug, frage) => {
			if (!window.confirm(frage)) return;
			try {
				S.lern = await api('/lernstand/zuruecksetzen', 'POST', { fahrzeug });
				S.quiz = null;
			} catch (e) {
				S.fehler = e.message;
			}
			zeichne();
		};

		const schalter = h(
			'div',
			{ class: 'fwb-karte' },
			h('label', { class: 'fwb-schalterzeile' }, h('input', { type: 'checkbox', checked: an, onchange: (ev) => setze(ev.target.checked) }), h('span', {}, h('strong', {}, 'Meinen Lernfortschritt speichern'), h('small', {}, 'Nur du siehst deinen Lernstand. Im Verwaltungsbereich der Seite wird er nicht angezeigt.')))
		);
		if (!an) return h('div', { class: 'fwb-lernstand' }, schalter, h('p', { class: 'fwb-hinweis' }, 'Die Speicherung ist ausgeschaltet. Du kannst das Quiz trotzdem nutzen, es wird nur nichts festgehalten.'));

		const geraete = quizGeraete();
		const mitStand = geraete.map((g) => ({ g, e: standVon(g.id) }));
		const sicher = mitStand.filter((x) => x.e && x.e.s >= SICHER_AB).length;
		const geuebt = mitStand.filter((x) => x.e).length;
		const unsicher = mitStand
			.filter((x) => x.e && x.e.s < SICHER_AB)
			.sort((a, b) => b.e.f - a.e.f)
			.slice(0, 8);
		const titel = new Map(S.fahrzeuge.map((f) => [f.id, f.titel]));

		return h(
			'div',
			{ class: 'fwb-lernstand' },
			schalter,
			h(
				'div',
				{ class: 'fwb-karte' },
				h('p', { class: 'fwb-ueber' }, S.fz.titel),
				h('h3', { class: 'fwb-ergebnis' }, sicher + ' von ' + geraete.length + ' Geräten sicher'),
				h('div', { class: 'fwb-balken fwb-balken-gross' }, h('i', { style: { width: (geraete.length ? (sicher / geraete.length) * 100 : 0) + '%' } })),
				h('p', { class: 'fwb-hinweis' }, 'Ein Gerät gilt als sicher, wenn du es ' + SICHER_AB + '-mal in Folge richtig zugeordnet hast. Bisher geübt: ' + geuebt + ', noch nie gefragt: ' + (geraete.length - geuebt) + '.'),
				unsicher.length
					? [
							h('p', { class: 'fwb-ueber' }, 'Noch nicht sicher'),
							h('ul', { class: 'fwb-fehlerliste' }, unsicher.map(({ g, e }) => h('li', {}, h('button', { type: 'button', class: 'fwb-link', onclick: () => oeffneGeraet(g.id) }, g.name), ' · ' + e.r + ' richtig, ' + e.f + ' falsch'))),
							h('p', {}, h('button', { type: 'button', class: 'fwb-knopf fwb-primaer', onclick: () => { S.tab = 'quiz'; starteQuiz(new Set(unsicher.map((x) => x.g.id))); } }, 'Diese Geräte üben')),
					  ]
					: null
			),
			h(
				'div',
				{ class: 'fwb-karte' },
				h('h3', {}, 'Verlauf'),
				S.lern.verlauf.length
					? h(
							'table',
							{ class: 'fwb-verlauf' },
							h('thead', {}, h('tr', {}, h('th', {}, 'Datum'), h('th', {}, 'Fahrzeug'), h('th', {}, 'Ergebnis'))),
							h('tbody', {}, S.lern.verlauf.slice(0, 15).map((v) => h('tr', {}, h('td', {}, datum(v.t)), h('td', {}, titel.get(v.fz) || '–'), h('td', {}, v.r + ' von ' + v.g + ' (' + Math.round((v.r / v.g) * 100) + ' %)'))))
					  )
					: h('p', { class: 'fwb-hinweis' }, 'Noch keine abgeschlossene Quizrunde.')
			),
			h(
				'div',
				{ class: 'fwb-karte' },
				h('h3', {}, 'Zurücksetzen'),
				h(
					'div',
					{ class: 'fwb-knopfreihe' },
					h('button', { type: 'button', class: 'fwb-knopf', onclick: () => loesche(S.fz.id, 'Lernstand und Verlauf für „' + S.fz.titel + '" zurücksetzen?') }, 'Lernstand für ' + S.fz.titel + ' zurücksetzen'),
					S.fahrzeuge.length > 1 ? h('button', { type: 'button', class: 'fwb-knopf', onclick: () => loesche(0, 'Lernstand und Verlauf für alle Fahrzeuge zurücksetzen?') }, 'Alles zurücksetzen') : null
				)
			)
		);
	}

	/* ---------- Fahrzeugliste ---------- */

	function listeAnsicht() {
		if (!S.fahrzeuge.length) return h('p', { class: 'fwb-leer' }, 'Es ist noch kein Fahrzeug angelegt.');
		return h(
			'div',
			{ class: 'fwb-fahrzeuge' },
			S.fahrzeuge.map((f) =>
				h(
					'button',
					{ type: 'button', class: 'fwb-fahrzeugkarte', onclick: () => oeffneFahrzeug(f.id) },
					f.bild ? h('img', { src: f.bild.url, alt: '' }) : h('span', { class: 'fwb-fahrzeugkarte-leer', 'aria-hidden': 'true' }),
					h(
						'span',
						{ class: 'fwb-fahrzeugkarte-text' },
						h('strong', {}, f.titel),
						f.entwurf ? h('span', { class: 'fwb-marke' }, 'Entwurf') : null,
						f.felder.filter((x) => x.wert).map((x) => h('small', {}, x.label + ': ' + x.wert)),
						h('small', {}, f.faecher + ' Fächer · ' + f.geraete + ' Geräte')
					)
				)
			)
		);
	}

	/* ---------- Rahmen ---------- */

	function zeichne() {
		const teile = [];
		if (S.fehler) teile.push(h('p', { class: 'fwb-fehler', role: 'alert' }, S.fehler));
		if (!S.fz) {
			teile.push(S.laedt ? h('p', { class: 'fwb-laden' }, 'Beladung wird geladen …') : listeAnsicht());
		} else {
			let inhalt;
			if (S.suche) inhalt = sucheAnsicht();
			else if (S.tab === 'quiz') inhalt = quizAnsicht();
			else if (S.tab === 'lernstand') inhalt = lernstandAnsicht();
			else inhalt = S.fach && fachVon(S.fach) ? fachAnsicht() : fahrzeugAnsicht();
			teile.push(kopf(), h('div', { class: 'fwb-haupt' }, inhalt));
		}
		wurzel.replaceChildren(...teile);
	}

	async function start() {
		S.laedt = true;
		zeichne();
		try {
			const [fahrzeuge, lern] = await Promise.all([api('/fahrzeuge'), api('/lernstand')]);
			S.fahrzeuge = fahrzeuge;
			S.lern = lern;
			S.laedt = false;
			const direkt = cfg.fahrzeug && fahrzeuge.some((f) => f.id === cfg.fahrzeug) ? cfg.fahrzeug : fahrzeuge.length === 1 ? fahrzeuge[0].id : 0;
			if (direkt) await oeffneFahrzeug(direkt);
			else zeichne();
		} catch (e) {
			S.laedt = false;
			S.fehler = 'Die Beladung konnte nicht geladen werden. ' + e.message;
			zeichne();
		}
	}

	start();
})();
