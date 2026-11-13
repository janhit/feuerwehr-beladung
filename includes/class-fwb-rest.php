<?php
/**
 * REST-Schnittstelle für die Lernseite. Alle Routen verlangen eine Anmeldung.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FWB_Rest {

	const NS = 'fwb/v1';

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routen' ) );
	}

	public static function angemeldet() {
		return is_user_logged_in();
	}

	public static function routen() {
		$erlaubt = array( __CLASS__, 'angemeldet' );

		register_rest_route(
			self::NS,
			'/fahrzeuge',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'fahrzeuge' ),
				'permission_callback' => $erlaubt,
			)
		);
		register_rest_route(
			self::NS,
			'/fahrzeuge/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'fahrzeug' ),
				'permission_callback' => $erlaubt,
			)
		);
		register_rest_route(
			self::NS,
			'/lernstand',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'lernstand' ),
				'permission_callback' => $erlaubt,
			)
		);
		register_rest_route(
			self::NS,
			'/lernstand/zuruecksetzen',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'zuruecksetzen' ),
				'permission_callback' => $erlaubt,
			)
		);
		register_rest_route(
			self::NS,
			'/lernstand/einstellung',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'einstellung' ),
				'permission_callback' => $erlaubt,
			)
		);
		register_rest_route(
			self::NS,
			'/lernstand/antwort',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'antwort' ),
				'permission_callback' => $erlaubt,
			)
		);
		register_rest_route(
			self::NS,
			'/lernstand/runde',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'runde' ),
				'permission_callback' => $erlaubt,
			)
		);
	}

	/** Liefert das Fahrzeug, wenn es existiert und der Nutzer es sehen darf. */
	private static function hole_fahrzeug( $id ) {
		$post = get_post( absint( $id ) );
		if ( ! $post || FWB_Daten::TYP !== $post->post_type ) {
			return null;
		}
		if ( ! in_array( $post->post_status, FWB_Daten::sichtbare_status(), true ) ) {
			return null;
		}
		return $post;
	}

	private static function nicht_gefunden() {
		return new WP_Error( 'fwb_nicht_gefunden', 'Fahrzeug nicht gefunden.', array( 'status' => 404 ) );
	}

	public static function fahrzeuge() {
		return rest_ensure_response( array_map( array( 'FWB_Daten', 'kurzform' ), FWB_Daten::fahrzeuge() ) );
	}

	public static function fahrzeug( WP_REST_Request $anfrage ) {
		$post = self::hole_fahrzeug( $anfrage['id'] );
		return $post ? rest_ensure_response( FWB_Daten::vollform( $post ) ) : self::nicht_gefunden();
	}

	public static function lernstand() {
		return rest_ensure_response( FWB_Lernstand::lade( get_current_user_id() ) );
	}

	public static function einstellung( WP_REST_Request $anfrage ) {
		FWB_Lernstand::setze_einstellung( get_current_user_id(), (bool) $anfrage->get_param( 'speichern' ) );
		return self::lernstand();
	}

	public static function antwort( WP_REST_Request $anfrage ) {
		$post = self::hole_fahrzeug( $anfrage->get_param( 'fahrzeug' ) );
		if ( ! $post ) {
			return self::nicht_gefunden();
		}
		$geraet = (string) $anfrage->get_param( 'geraet' );
		$ids    = wp_list_pluck( FWB_Daten::lade( $post->ID )['geraete'], 'id' );
		if ( ! in_array( $geraet, $ids, true ) ) {
			return new WP_Error( 'fwb_geraet', 'Gerät nicht gefunden.', array( 'status' => 400 ) );
		}
		FWB_Lernstand::antwort( get_current_user_id(), $post->ID, $geraet, (bool) $anfrage->get_param( 'richtig' ) );
		return rest_ensure_response( array( 'ok' => true ) );
	}

	public static function runde( WP_REST_Request $anfrage ) {
		$post = self::hole_fahrzeug( $anfrage->get_param( 'fahrzeug' ) );
		if ( ! $post ) {
			return self::nicht_gefunden();
		}
		$gesamt  = min( 500, absint( $anfrage->get_param( 'gesamt' ) ) );
		$richtig = min( $gesamt, absint( $anfrage->get_param( 'richtig' ) ) );
		if ( $gesamt > 0 ) {
			FWB_Lernstand::runde( get_current_user_id(), $post->ID, $richtig, $gesamt );
		}
		return self::lernstand();
	}

	public static function zuruecksetzen( WP_REST_Request $anfrage ) {
		FWB_Lernstand::zuruecksetzen( get_current_user_id(), absint( $anfrage->get_param( 'fahrzeug' ) ) );
		return self::lernstand();
	}
}
