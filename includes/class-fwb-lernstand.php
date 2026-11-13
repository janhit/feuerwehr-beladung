<?php
/**
 * Lernfortschritt der Mitglieder.
 *
 * Gespeichert wird nur, wenn das Mitglied es selbst eingeschaltet hat.
 * Es gibt bewusst keine Ansicht im Backend: Admins können Lernstände löschen, aber nicht einsehen.
 *
 * User-Meta:
 * fwb_speichern  '1' = speichern, '0' = nicht speichern, leer = noch nicht entschieden
 * fwb_lernstand  [ fahrzeug_id => [ geraet_id => [ r, f, s, z ] ] ]
 *                r = richtig, f = falsch, s = richtig in Folge, z = Zeitpunkt der letzten Antwort
 * fwb_verlauf    Liste der letzten Quizrunden [ t, fz, r, g ]
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FWB_Lernstand {

	const EINSTELLUNG = 'fwb_speichern';
	const STAND       = 'fwb_lernstand';
	const VERLAUF     = 'fwb_verlauf';
	const MAX_VERLAUF = 30;

	public static function init() {
		add_filter( 'wp_privacy_personal_data_erasers', array( __CLASS__, 'registriere_loescher' ) );
		add_action( 'admin_init', array( __CLASS__, 'datenschutz_hinweis' ) );
	}

	public static function speichert( $user_id ) {
		return '1' === get_user_meta( $user_id, self::EINSTELLUNG, true );
	}

	public static function lade( $user_id ) {
		$einstellung = get_user_meta( $user_id, self::EINSTELLUNG, true );
		$stand       = get_user_meta( $user_id, self::STAND, true );
		$verlauf     = get_user_meta( $user_id, self::VERLAUF, true );
		return array(
			'entschieden' => '1' === $einstellung || '0' === $einstellung,
			'speichern'   => '1' === $einstellung,
			'fahrzeuge'   => (object) ( is_array( $stand ) ? $stand : array() ),
			'verlauf'     => is_array( $verlauf ) ? array_values( $verlauf ) : array(),
		);
	}

	public static function setze_einstellung( $user_id, $speichern ) {
		update_user_meta( $user_id, self::EINSTELLUNG, $speichern ? '1' : '0' );
		if ( ! $speichern ) {
			delete_user_meta( $user_id, self::STAND );
			delete_user_meta( $user_id, self::VERLAUF );
		}
	}

	public static function antwort( $user_id, $fahrzeug_id, $geraet_id, $richtig ) {
		if ( ! self::speichert( $user_id ) ) {
			return;
		}
		$stand = get_user_meta( $user_id, self::STAND, true );
		$stand = is_array( $stand ) ? $stand : array();
		$e     = $stand[ $fahrzeug_id ][ $geraet_id ] ?? array(
			'r' => 0,
			'f' => 0,
			's' => 0,
		);
		if ( $richtig ) {
			$e['r'] = (int) $e['r'] + 1;
			$e['s'] = (int) $e['s'] + 1;
		} else {
			$e['f'] = (int) $e['f'] + 1;
			$e['s'] = 0;
		}
		$e['z']                              = time();
		$stand[ $fahrzeug_id ][ $geraet_id ] = $e;
		update_user_meta( $user_id, self::STAND, $stand );
	}

	public static function runde( $user_id, $fahrzeug_id, $richtig, $gesamt ) {
		if ( ! self::speichert( $user_id ) ) {
			return;
		}
		$verlauf = get_user_meta( $user_id, self::VERLAUF, true );
		$verlauf = is_array( $verlauf ) ? $verlauf : array();
		array_unshift(
			$verlauf,
			array(
				't'  => time(),
				'fz' => $fahrzeug_id,
				'r'  => $richtig,
				'g'  => $gesamt,
			)
		);
		update_user_meta( $user_id, self::VERLAUF, array_slice( $verlauf, 0, self::MAX_VERLAUF ) );
	}

	/** Setzt den Lernstand zurück. Die Einstellung „speichern" bleibt erhalten. */
	public static function zuruecksetzen( $user_id, $fahrzeug_id = 0 ) {
		if ( ! $fahrzeug_id ) {
			delete_user_meta( $user_id, self::STAND );
			delete_user_meta( $user_id, self::VERLAUF );
			return;
		}
		$stand = get_user_meta( $user_id, self::STAND, true );
		if ( is_array( $stand ) ) {
			unset( $stand[ $fahrzeug_id ] );
			update_user_meta( $user_id, self::STAND, $stand );
		}
		$verlauf = get_user_meta( $user_id, self::VERLAUF, true );
		if ( is_array( $verlauf ) ) {
			$verlauf = array_values(
				array_filter(
					$verlauf,
					static function ( $v ) use ( $fahrzeug_id ) {
						return (int) ( $v['fz'] ?? 0 ) !== (int) $fahrzeug_id;
					}
				)
			);
			update_user_meta( $user_id, self::VERLAUF, $verlauf );
		}
	}

	/* ---------- Für Admins: löschen ohne Einsicht ---------- */

	/** Löscht Lernstand und Verlauf eines Mitglieds. Gibt zurück, ob etwas gelöscht wurde. */
	public static function loesche_user( $user_id ) {
		$a = delete_user_meta( $user_id, self::STAND );
		$b = delete_user_meta( $user_id, self::VERLAUF );
		return $a || $b;
	}

	public static function loesche_alle() {
		delete_metadata( 'user', 0, self::STAND, '', true );
		delete_metadata( 'user', 0, self::VERLAUF, '', true );
	}

	/** Entfernt alles, auch die Einstellungen. Wird beim Deinstallieren verwendet. */
	public static function entferne_alles() {
		self::loesche_alle();
		delete_metadata( 'user', 0, self::EINSTELLUNG, '', true );
	}

	public static function anzahl_mit_speicherung() {
		$q = new WP_User_Query(
			array(
				'meta_key'    => self::EINSTELLUNG,
				'meta_value'  => '1',
				'fields'      => 'ID',
				'number'      => 1,
				'count_total' => true,
			)
		);
		return (int) $q->get_total();
	}

	/* ---------- Anbindung an die Datenschutz-Werkzeuge von WordPress ---------- */

	public static function registriere_loescher( $loescher ) {
		$loescher['feuerwehr-beladung'] = array(
			'eraser_friendly_name' => 'Feuerwehr Beladung: Lernfortschritt',
			'callback'             => array( __CLASS__, 'loescher' ),
		);
		return $loescher;
	}

	public static function loescher( $email ) {
		$user     = get_user_by( 'email', $email );
		$entfernt = $user ? self::loesche_user( $user->ID ) : false;
		return array(
			'items_removed'  => $entfernt,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => true,
		);
	}

	public static function datenschutz_hinweis() {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}
		wp_add_privacy_policy_content(
			'Feuerwehr Beladung',
			'<p>Angemeldete Mitglieder können auf der Lernseite zur Fahrzeugbeladung freiwillig einschalten, dass ihr Lernfortschritt gespeichert wird. Gespeichert werden dann je Gerät die Zahl der richtigen und falschen Antworten, der Zeitpunkt der letzten Antwort sowie die Ergebnisse der letzten 30 Quizrunden. Die Daten sind nur für das Mitglied selbst sichtbar. Das Mitglied kann die Speicherung jederzeit ausschalten oder den Lernstand zurücksetzen. Dabei werden die Daten gelöscht.</p>'
		);
	}
}
