<?php
/**
 * Datenmodell: Jedes Fahrzeug ist ein Beitrag vom Typ fwb_fahrzeug.
 * Die Beladung liegt als ein JSON-Dokument im Post-Meta _fwb_daten.
 *
 * Aufbau:
 * info      – Stammdaten: Foto, Kurzbeschreibung, frei benennbare Felder
 * geraete   – alle Geräte des Fahrzeugs
 * faecher   – Gerätefächer; jedes Fach hat Zustände (ein Foto pro Zustand)
 *             mit Hotspots für Geräte und Schalter zum Wechsel des Zustands
 * ansichten – Außenansichten des Fahrzeugs mit Hotspots auf die Fächer
 *
 * Alle Positionen sind Prozentwerte bezogen auf das jeweilige Foto.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FWB_Daten {

	const TYP       = 'fwb_fahrzeug';
	const META      = '_fwb_daten';
	const PROTOKOLL = '_fwb_protokoll';
	const SYMBOLE   = array( 'bogen', 'bogen-zurueck', 'hoch', 'runter', 'links', 'rechts' );

	public static function init() {
		add_action( 'init', array( __CLASS__, 'registriere_typ' ) );
	}

	public static function registriere_typ() {
		register_post_type(
			self::TYP,
			array(
				'labels'          => array(
					'name'               => 'Fahrzeuge',
					'singular_name'      => 'Fahrzeug',
					'menu_name'          => 'Beladung',
					'all_items'          => 'Fahrzeuge',
					'add_new'            => 'Fahrzeug hinzufügen',
					'add_new_item'       => 'Neues Fahrzeug',
					'edit_item'          => 'Fahrzeug bearbeiten',
					'new_item'           => 'Neues Fahrzeug',
					'search_items'       => 'Fahrzeuge durchsuchen',
					'not_found'          => 'Noch keine Fahrzeuge angelegt.',
					'not_found_in_trash' => 'Keine Fahrzeuge im Papierkorb.',
				),
				'public'          => false,
				'show_ui'         => true,
				'show_in_menu'    => true,
				'show_in_rest'    => false,
				'menu_position'   => 25,
				'menu_icon'       => 'dashicons-car',
				'supports'        => array( 'title', 'page-attributes' ),
				'capability_type' => 'page',
				'map_meta_cap'    => true,
				'rewrite'         => false,
				'query_var'       => false,
			)
		);
	}

	public static function leer() {
		return array(
			'version'   => 1,
			'info'      => array(
				'bild'   => 0,
				'kurz'   => '',
				'felder' => array(),
			),
			'geraete'   => array(),
			'faecher'   => array(),
			'ansichten' => array(),
		);
	}

	public static function lade( $post_id ) {
		$roh   = get_post_meta( $post_id, self::META, true );
		$daten = is_string( $roh ) && '' !== $roh ? json_decode( $roh, true ) : null;
		if ( ! is_array( $daten ) ) {
			return self::leer();
		}
		return self::bereinige( $daten );
	}

	public static function speichere( $post_id, $roh ) {
		$daten = self::bereinige( is_array( $roh ) ? $roh : array() );
		update_post_meta( $post_id, self::META, wp_slash( wp_json_encode( $daten, JSON_UNESCAPED_UNICODE ) ) );

		$protokoll = get_post_meta( $post_id, self::PROTOKOLL, true );
		$protokoll = is_array( $protokoll ) ? $protokoll : array();
		array_unshift(
			$protokoll,
			array(
				'zeit'    => time(),
				'user'    => get_current_user_id(),
				'geraete' => count( $daten['geraete'] ),
				'faecher' => count( $daten['faecher'] ),
			)
		);
		update_post_meta( $post_id, self::PROTOKOLL, array_slice( $protokoll, 0, 30 ) );
		return $daten;
	}

	/* ---------- Bereinigung ---------- */

	private static function id( $v ) {
		$v = is_scalar( $v ) ? preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $v ) : '';
		return substr( $v, 0, 32 );
	}

	private static function text( $v, $max = 200 ) {
		$v = is_scalar( $v ) ? sanitize_text_field( (string) $v ) : '';
		return function_exists( 'mb_substr' ) ? mb_substr( $v, 0, $max ) : substr( $v, 0, $max );
	}

	private static function langtext( $v, $max = 2000 ) {
		$v = is_scalar( $v ) ? sanitize_textarea_field( (string) $v ) : '';
		return function_exists( 'mb_substr' ) ? mb_substr( $v, 0, $max ) : substr( $v, 0, $max );
	}

	private static function prozent( $v ) {
		$f = is_numeric( $v ) ? (float) $v : 0.0;
		return round( max( 0, min( 100, $f ) ), 2 );
	}

	private static function rechteck( $r ) {
		$x = self::prozent( $r['x'] ?? 0 );
		$y = self::prozent( $r['y'] ?? 0 );
		return array(
			'x' => $x,
			'y' => $y,
			'w' => min( self::prozent( $r['w'] ?? 0 ), 100 - $x ),
			'h' => min( self::prozent( $r['h'] ?? 0 ), 100 - $y ),
		);
	}

	private static function liste( $v ) {
		return is_array( $v ) ? array_values( array_filter( $v, 'is_array' ) ) : array();
	}

	public static function bereinige( $d ) {
		$aus  = self::leer();
		$info = is_array( $d['info'] ?? null ) ? $d['info'] : array();

		$aus['info']['bild'] = absint( $info['bild'] ?? 0 );
		$aus['info']['kurz'] = self::langtext( $info['kurz'] ?? '', 600 );
		foreach ( self::liste( $info['felder'] ?? null ) as $f ) {
			$label = self::text( $f['label'] ?? '', 80 );
			$wert  = self::text( $f['wert'] ?? '', 200 );
			if ( '' !== $label || '' !== $wert ) {
				$aus['info']['felder'][] = array(
					'label' => $label,
					'wert'  => $wert,
				);
			}
		}

		$geraet_ids = array();
		foreach ( self::liste( $d['geraete'] ?? null ) as $g ) {
			$id = self::id( $g['id'] ?? '' );
			if ( '' === $id || isset( $geraet_ids[ $id ] ) ) {
				continue;
			}
			$geraet_ids[ $id ] = true;
			$aus['geraete'][]  = array(
				'id'           => $id,
				'name'         => self::text( $g['name'] ?? '', 120 ),
				'menge'        => self::text( $g['menge'] ?? '', 120 ),
				'ort'          => self::text( $g['ort'] ?? '', 120 ),
				'beschreibung' => self::langtext( $g['beschreibung'] ?? '' ),
				'einsatz'      => self::langtext( $g['einsatz'] ?? '' ),
				'bild'         => absint( $g['bild'] ?? 0 ),
			);
		}

		$fach_ids = array();
		foreach ( self::liste( $d['faecher'] ?? null ) as $f ) {
			$fid = self::id( $f['id'] ?? '' );
			if ( '' === $fid || isset( $fach_ids[ $fid ] ) ) {
				continue;
			}
			$fach_ids[ $fid ] = true;

			$zustaende = self::liste( $f['zustaende'] ?? null );
			$zid_liste = array();
			foreach ( $zustaende as $z ) {
				$zid = self::id( $z['id'] ?? '' );
				if ( '' !== $zid ) {
					$zid_liste[ $zid ] = true;
				}
			}

			$fach = array(
				'id'        => $fid,
				'name'      => self::text( $f['name'] ?? '', 40 ),
				'titel'     => self::text( $f['titel'] ?? '', 120 ),
				'zustaende' => array(),
			);

			$gesehen = array();
			foreach ( $zustaende as $z ) {
				$zid = self::id( $z['id'] ?? '' );
				if ( '' === $zid || isset( $gesehen[ $zid ] ) ) {
					continue;
				}
				$gesehen[ $zid ] = true;
				$zustand         = array(
					'id'       => $zid,
					'name'     => self::text( $z['name'] ?? '', 120 ),
					'bild'     => absint( $z['bild'] ?? 0 ),
					'hotspots' => array(),
				);
				foreach ( self::liste( $z['hotspots'] ?? null ) as $h ) {
					$hid = self::id( $h['id'] ?? '' );
					$typ = ( $h['typ'] ?? '' ) === 'schalter' ? 'schalter' : 'geraet';
					$hs  = array_merge(
						array(
							'id'  => '' !== $hid ? $hid : wp_generate_password( 8, false ),
							'typ' => $typ,
						),
						self::rechteck( $h )
					);
					if ( 'geraet' === $typ ) {
						$gid = self::id( $h['geraet'] ?? '' );
						if ( ! isset( $geraet_ids[ $gid ] ) ) {
							continue;
						}
						$hs['geraet'] = $gid;
					} else {
						$ziel = self::id( $h['ziel'] ?? '' );
						if ( ! isset( $zid_liste[ $ziel ] ) || $ziel === $zid ) {
							continue;
						}
						$hs['ziel']   = $ziel;
						$hs['symbol'] = in_array( $h['symbol'] ?? '', self::SYMBOLE, true ) ? $h['symbol'] : 'bogen';
						$hs['label']  = self::text( $h['label'] ?? '', 80 );
					}
					$zustand['hotspots'][] = $hs;
				}
				$fach['zustaende'][] = $zustand;
			}
			$aus['faecher'][] = $fach;
		}

		$ansicht_ids = array();
		foreach ( self::liste( $d['ansichten'] ?? null ) as $a ) {
			$aid = self::id( $a['id'] ?? '' );
			if ( '' === $aid || isset( $ansicht_ids[ $aid ] ) ) {
				continue;
			}
			$ansicht_ids[ $aid ] = true;
			$ansicht             = array(
				'id'      => $aid,
				'name'    => self::text( $a['name'] ?? '', 80 ),
				'bild'    => absint( $a['bild'] ?? 0 ),
				'faecher' => array(),
			);
			foreach ( self::liste( $a['faecher'] ?? null ) as $h ) {
				$fid = self::id( $h['fach'] ?? '' );
				if ( ! isset( $fach_ids[ $fid ] ) ) {
					continue;
				}
				$hid                  = self::id( $h['id'] ?? '' );
				$ansicht['faecher'][] = array_merge(
					array(
						'id'   => '' !== $hid ? $hid : wp_generate_password( 8, false ),
						'fach' => $fid,
					),
					self::rechteck( $h )
				);
			}
			$aus['ansichten'][] = $ansicht;
		}

		return $aus;
	}

	/* ---------- Ausgabe ---------- */

	public static function bild( $id ) {
		$id = absint( $id );
		if ( ! $id ) {
			return null;
		}
		$src = wp_get_attachment_image_src( $id, 'large' );
		if ( ! $src ) {
			return null;
		}
		return array(
			'id'  => $id,
			'url' => $src[0],
			'w'   => (int) $src[1],
			'h'   => (int) $src[2],
		);
	}

	/** Alle Bild-IDs eines Fahrzeugs als Karte id => {url,w,h}. */
	public static function bilder( $daten ) {
		$ids = array( $daten['info']['bild'] );
		foreach ( $daten['geraete'] as $g ) {
			$ids[] = $g['bild'];
		}
		foreach ( $daten['ansichten'] as $a ) {
			$ids[] = $a['bild'];
		}
		foreach ( $daten['faecher'] as $f ) {
			foreach ( $f['zustaende'] as $z ) {
				$ids[] = $z['bild'];
			}
		}
		$karte = array();
		foreach ( array_unique( array_filter( $ids ) ) as $id ) {
			$b = self::bild( $id );
			if ( $b ) {
				$karte[ $id ] = $b;
			}
		}
		return $karte;
	}

	public static function sichtbare_status() {
		return current_user_can( 'edit_pages' ) ? array( 'publish', 'draft', 'pending', 'private', 'future' ) : array( 'publish' );
	}

	public static function fahrzeuge() {
		return get_posts(
			array(
				'post_type'   => self::TYP,
				'post_status' => self::sichtbare_status(),
				'numberposts' => -1,
				'orderby'     => array(
					'menu_order' => 'ASC',
					'title'      => 'ASC',
				),
			)
		);
	}

	public static function kurzform( $post ) {
		$daten     = self::lade( $post->ID );
		$platziert = array();
		foreach ( $daten['faecher'] as $f ) {
			foreach ( $f['zustaende'] as $z ) {
				foreach ( $z['hotspots'] as $h ) {
					if ( 'geraet' === $h['typ'] ) {
						$platziert[ $h['geraet'] ] = true;
					}
				}
			}
		}
		return array(
			'id'      => $post->ID,
			'titel'   => get_the_title( $post ),
			'entwurf' => 'publish' !== $post->post_status,
			'kurz'    => $daten['info']['kurz'],
			'bild'    => self::bild( $daten['info']['bild'] ),
			'felder'  => array_slice( $daten['info']['felder'], 0, 3 ),
			'geraete' => count( $daten['geraete'] ),
			'lernbar' => count( $platziert ),
			'faecher' => count( $daten['faecher'] ),
		);
	}

	public static function vollform( $post ) {
		$daten = self::lade( $post->ID );
		return array(
			'id'       => $post->ID,
			'titel'    => get_the_title( $post ),
			'entwurf'  => 'publish' !== $post->post_status,
			'geaendert' => get_post_modified_time( 'U', true, $post ),
			'daten'    => $daten,
			'bilder'   => (object) self::bilder( $daten ),
		);
	}
}
