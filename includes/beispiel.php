<?php
/**
 * Beispielfahrzeug zum Ausprobieren. Die Beladung ist frei erfunden und ohne Fotos.
 * Wird über „Einstellungen & Update" als Entwurf angelegt.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$fwb_g = static function ( $id, $name, $menge, $ort, $beschreibung, $einsatz ) {
	return compact( 'id', 'name', 'menge', 'ort', 'beschreibung', 'einsatz' );
};
$fwb_h = static function ( $geraet, $x, $y, $w, $h ) {
	return array(
		'id'     => 'h' . substr( md5( $geraet . $x . $y . $w ), 0, 7 ),
		'typ'    => 'geraet',
		'geraet' => $geraet,
		'x'      => $x,
		'y'      => $y,
		'w'      => $w,
		'h'      => $h,
	);
};
$fwb_s = static function ( $ziel, $symbol, $label, $x, $y, $w, $h ) {
	return array(
		'id'     => 's' . substr( md5( $ziel . $label ), 0, 7 ),
		'typ'    => 'schalter',
		'ziel'   => $ziel,
		'symbol' => $symbol,
		'label'  => $label,
		'x'      => $x,
		'y'      => $y,
		'w'      => $w,
		'h'      => $h,
	);
};
$fwb_leer = static function ( $id, $name ) {
	return array(
		'id'        => $id,
		'name'      => $name,
		'titel'     => '',
		'zustaende' => array(
			array(
				'id'       => $id . 'z1',
				'name'     => 'Fach geöffnet',
				'bild'     => 0,
				'hotspots' => array(),
			),
		),
	);
};

$fwb_g1_fest = array( $fwb_h( 'g3', 3, 4, 45, 25 ), $fwb_h( 'g4', 52, 4, 45, 12 ), $fwb_h( 'g5', 52, 17, 45, 12 ), $fwb_h( 'g6', 3, 35, 94, 20 ) );
$fwb_g2_fest = array( $fwb_h( 'a1', 3, 4, 15, 25 ), $fwb_h( 'a2', 19.5, 4, 15, 25 ), $fwb_h( 'a3', 3, 36, 15, 25 ), $fwb_h( 'a5', 19.5, 36, 15, 25 ), $fwb_h( 'a4', 3, 68, 15, 28 ), $fwb_h( 'a6', 19.5, 68, 15, 28 ) );

return array(
	'titel' => 'HLF 1 (Beispiel)',
	'daten' => array(
		'info'      => array(
			'bild'   => 0,
			'kurz'   => 'Beispielfahrzeug mit erfundener Beladung. Es zeigt, wie Fächer, Schwenkwand und Auszug funktionieren.',
			'felder' => array(
				array( 'label' => 'Fahrzeugtyp', 'wert' => 'HLF 10' ),
				array( 'label' => 'Besatzung', 'wert' => '1/8' ),
				array( 'label' => 'Pumpe', 'wert' => 'FPN 10-2000' ),
				array( 'label' => 'Löschwassertank', 'wert' => '2.000 l' ),
				array( 'label' => 'Schaummittel', 'wert' => '120 l' ),
				array( 'label' => 'Stromerzeuger', 'wert' => '13 kVA, tragbar' ),
				array( 'label' => 'Baujahr', 'wert' => '2019' ),
				array( 'label' => 'Zulässige Gesamtmasse', 'wert' => '16 t' ),
			),
		),
		'geraete'   => array(
			$fwb_g( 'g1', 'Stromerzeuger 13 kVA', '1 Stück', 'Auszug unten', 'Tragbarer Stromerzeuger nach DIN 14685 mit 230-V- und 400-V-Abgängen.', 'Versorgt Beleuchtung, Lüfter und elektrische Rettungsgeräte. Vor dem Start Auszug ganz herausziehen und Erdung prüfen.' ),
			$fwb_g( 'g2', 'Leitungsroller 230 V', '2 Stück à 50 m', 'Auszug unten', 'Kabeltrommel mit Schutzkontaktsteckdosen und Thermoschutz.', 'Bei Belastung Leitung immer ganz abrollen, sonst droht Überhitzung.' ),
			$fwb_g( 'g3', 'LED-Flutlichtstrahler', '2 Stück', '', 'Strahler für die großflächige Ausleuchtung der Einsatzstelle.', 'Auf Stativ setzen und von oben schräg ausrichten. Blendung der Kräfte vermeiden.' ),
			$fwb_g( 'g4', 'Teleskopstativ', '2 Stück', '', 'Ausziehbares Stativ für Flutlichtstrahler.', 'Standbeine ganz spreizen, bei Wind sichern.' ),
			$fwb_g( 'g5', 'Verteiler 400/230 V', '1 Stück', '', 'Stromverteiler mit FI-Schutzschalter für mehrere Verbraucher.', 'Zwischen Stromerzeuger und Verbraucher setzen, möglichst trocken aufstellen.' ),
			$fwb_g( 'g6', 'Verlängerungsleitung 230 V', '4 Stück à 25 m', '', 'Gummischlauchleitung mit Schutzkontaktstecker und -kupplung.', 'Kupplungen nicht in Wasser oder Pfützen ablegen.' ),
			$fwb_g( 'a1', 'Hohlstrahlrohr C', '2 Stück', '', 'Strahlrohr mit einstellbarer Durchflussmenge und Strahlform.', 'Standardrohr im Innenangriff. Durchfluss vor dem Vorgehen einstellen.' ),
			$fwb_g( 'a2', 'Mehrzweckstrahlrohr B', '1 Stück', '', 'Strahlrohr mit B-Anschluss für große Wassermengen.', 'Für Riegelstellung und Außenangriff. Wegen des Rückstoßes zu zweit führen.' ),
			$fwb_g( 'a3', 'Kupplungsschlüssel ABC', '4 Stück', '', 'Schlüssel zum Festziehen und Lösen von Storz-Kupplungen der Größen A, B und C.', 'Kupplungen handfest schließen und kurz mit dem Schlüssel nachziehen.' ),
			$fwb_g( 'a4', 'Sammelstück A-2B', '1 Stück', '', 'Führt zwei B-Leitungen zu einer A-Leitung zusammen.', 'Bei der Wasserentnahme aus dem Hydranten oder bei der Einspeisung in die Pumpe.' ),
			$fwb_g( 'a5', 'Übergangsstück B-C', '2 Stück', '', 'Verbindet eine B-Kupplung mit einer C-Kupplung.', 'Wenn eine C-Leitung direkt an einen B-Abgang angeschlossen werden soll.' ),
			$fwb_g( 'a6', 'Verteiler B-CBC', '1 Stück', '', 'Teilt eine B-Zuleitung auf zwei C-Abgänge und einen B-Abgang auf.', 'Abgänge einzeln und langsam öffnen und schließen.' ),
			$fwb_g( 'a7', 'Standrohr 2B', '1 Stück', 'Schwenkwand, Vorderseite', 'Wird auf einen Unterflurhydranten gesetzt und hat zwei B-Abgänge.', 'Vor dem Aufsetzen Hydrant kurz spülen. Standrohr senkrecht aufschrauben.' ),
			$fwb_g( 'a8', 'Unterflurhydrantenschlüssel', '1 Stück', 'Schwenkwand, Vorderseite', 'Schlüssel zum Öffnen und Schließen des Unterflurhydranten.', 'Langsam öffnen und schließen, sonst drohen Druckstöße im Netz.' ),
			$fwb_g( 'a9', 'Überflurhydrantenschlüssel', '1 Stück', 'Schwenkwand, Rückseite', 'Schlüssel für die Ventilspindel und die Abgangsdeckel von Überflurhydranten.', 'Abgangsdeckel zuerst lösen, dann das Ventil langsam öffnen.' ),
			$fwb_g( 'a10', 'Schlauchhalter', '4 Stück', 'Schwenkwand, Rückseite', 'Gurt mit Haken zum Sichern von Schlauchleitungen an Leitern, Geländern oder Treppen.', 'Je Geschoss einen Halter setzen, damit die Kupplungen entlastet werden.' ),
			$fwb_g( 'a11', 'Schlauchbinden', '4 Stück', 'Schwenkwand, Rückseite', 'Manschetten zum vorläufigen Abdichten kleiner Schadstellen an Druckschläuchen.', 'Nur als Notlösung. Beschädigten Schlauch nach dem Einsatz kennzeichnen und austauschen.' ),
			$fwb_g( 'a12', 'B-Druckschlauch 20 m', '4 Stück, gerollt', 'hinter der Schwenkwand', 'Druckschlauch für die Leitung zwischen Hydrant, Pumpe und Verteiler.', 'Knickfrei und ohne Schlaufen verlegen.' ),
			$fwb_g( 'a13', 'C-Druckschlauch 15 m', '6 Stück, gerollt', 'hinter der Schwenkwand', 'Druckschlauch für die Angriffsleitung vom Verteiler zum Strahlrohr.', 'Im Innenangriff genug Schlauchreserve vor der Tür bereitlegen.' ),
			$fwb_g( 'a14', 'Schlauchtragekorb', '2 Stück mit je 3 × C 15 m', 'hinter der Schwenkwand', 'Korb mit fertig in Buchten gelegten C-Schläuchen.', 'Der Trupp nimmt den Korb mit, die Leitung läuft beim Vorgehen aus.' ),
		),
		'faecher'   => array(
			array(
				'id'        => 'f1',
				'name'      => 'G1',
				'titel'     => 'Stromversorgung und Beleuchtung',
				'zustaende' => array(
					array(
						'id'       => 'f1z1',
						'name'     => 'Auszug eingeschoben',
						'bild'     => 0,
						'hotspots' => array_merge( $fwb_g1_fest, array( $fwb_s( 'f1z2', 'runter', 'Auszug herausziehen', 30, 72, 40, 16 ) ) ),
					),
					array(
						'id'       => 'f1z2',
						'name'     => 'Auszug herausgezogen',
						'bild'     => 0,
						'hotspots' => array_merge( $fwb_g1_fest, array( $fwb_h( 'g1', 6, 66, 54, 30 ), $fwb_h( 'g2', 64, 66, 30, 30 ), $fwb_s( 'f1z1', 'hoch', 'Auszug einschieben', 30, 57, 40, 8 ) ) ),
					),
				),
			),
			$fwb_leer( 'f3', 'G3' ),
			$fwb_leer( 'f5', 'G5' ),
			array(
				'id'        => 'f2',
				'name'      => 'G2',
				'titel'     => 'Wasserführende Armaturen',
				'zustaende' => array(
					array(
						'id'       => 'f2z1',
						'name'     => 'Schwenkwand geschlossen',
						'bild'     => 0,
						'hotspots' => array_merge( $fwb_g2_fest, array( $fwb_h( 'a7', 39, 6, 13.5, 76 ), $fwb_h( 'a8', 54, 6, 13.5, 76 ), $fwb_s( 'f2z2', 'bogen', 'Schwenkwand aufklappen', 39, 85, 28, 10 ) ) ),
					),
					array(
						'id'       => 'f2z2',
						'name'     => 'Schwenkwand geöffnet',
						'bild'     => 0,
						'hotspots' => array_merge( $fwb_g2_fest, array( $fwb_h( 'a12', 38, 4, 30, 25 ), $fwb_h( 'a13', 38, 36, 30, 25 ), $fwb_h( 'a14', 38, 68, 30, 28 ), $fwb_h( 'a9', 73, 6, 24, 22 ), $fwb_h( 'a10', 73, 31, 24, 22 ), $fwb_h( 'a11', 73, 56, 24, 22 ), $fwb_s( 'f2z1', 'bogen-zurueck', 'Schwenkwand schließen', 73, 82, 24, 12 ) ) ),
					),
				),
			),
			$fwb_leer( 'f4', 'G4' ),
			$fwb_leer( 'f6', 'G6' ),
			$fwb_leer( 'f7', 'GR' ),
			$fwb_leer( 'f8', 'D1' ),
			$fwb_leer( 'f9', 'D2' ),
		),
		'ansichten' => array(
			array(
				'id'      => 'an1',
				'name'    => 'Fahrerseite',
				'bild'    => 0,
				'faecher' => array(
					array( 'id' => 'r1', 'fach' => 'f1', 'x' => 28.5, 'y' => 25, 'w' => 19, 'h' => 50 ),
					array( 'id' => 'r2', 'fach' => 'f3', 'x' => 48.5, 'y' => 25, 'w' => 20.5, 'h' => 50 ),
					array( 'id' => 'r3', 'fach' => 'f5', 'x' => 70, 'y' => 25, 'w' => 22.5, 'h' => 42 ),
					array( 'id' => 'r4', 'fach' => 'f8', 'x' => 30, 'y' => 12, 'w' => 29, 'h' => 9 ),
					array( 'id' => 'r5', 'fach' => 'f9', 'x' => 61, 'y' => 12, 'w' => 29, 'h' => 9 ),
				),
			),
			array(
				'id'      => 'an2',
				'name'    => 'Beifahrerseite',
				'bild'    => 0,
				'faecher' => array(
					array( 'id' => 'r6', 'fach' => 'f2', 'x' => 52.5, 'y' => 25, 'w' => 19, 'h' => 50 ),
					array( 'id' => 'r7', 'fach' => 'f4', 'x' => 31, 'y' => 25, 'w' => 20.5, 'h' => 50 ),
					array( 'id' => 'r8', 'fach' => 'f6', 'x' => 7.5, 'y' => 25, 'w' => 22.5, 'h' => 42 ),
				),
			),
			array(
				'id'      => 'an3',
				'name'    => 'Heck',
				'bild'    => 0,
				'faecher' => array(
					array( 'id' => 'r9', 'fach' => 'f7', 'x' => 30, 'y' => 20, 'w' => 40, 'h' => 55 ),
				),
			),
		),
	),
);
