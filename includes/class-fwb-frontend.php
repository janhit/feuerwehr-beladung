<?php
/**
 * Lernseite: Shortcode [feuerwehr_beladung]. Nur für angemeldete Mitglieder.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FWB_Frontend {

	public static function init() {
		add_shortcode( 'feuerwehr_beladung', array( __CLASS__, 'shortcode' ) );
	}

	public static function shortcode( $atts ) {
		$atts = shortcode_atts( array( 'fahrzeug' => 0 ), $atts, 'feuerwehr_beladung' );

		if ( ! is_user_logged_in() ) {
			return sprintf(
				'<div class="fwb-anmelden"><p>Die Fahrzeugbeladung ist nur für angemeldete Mitglieder sichtbar.</p><p><a class="button" href="%s">Anmelden</a></p></div>',
				esc_url( wp_login_url( get_permalink() ) )
			);
		}

		wp_enqueue_style( 'fwb-app', FWB_URL . 'assets/app.css', array(), FWB_VERSION );
		wp_enqueue_script( 'fwb-app', FWB_URL . 'assets/app.js', array(), FWB_VERSION, true );
		wp_localize_script(
			'fwb-app',
			'FWB_APP',
			array(
				'rest'       => esc_url_raw( rest_url( FWB_Rest::NS ) ),
				'nonce'      => wp_create_nonce( 'wp_rest' ),
				'fahrzeug'   => absint( $atts['fahrzeug'] ),
				'bearbeiten' => current_user_can( 'edit_pages' ) ? admin_url( 'post.php?action=edit&post=' ) : '',
			)
		);

		return '<div id="fwb-app" class="fwb"><p class="fwb-laden">Beladung wird geladen …</p></div>';
	}
}
