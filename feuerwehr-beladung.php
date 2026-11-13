<?php
/**
 * Plugin Name:       Feuerwehr Beladung
 * Plugin URI:        https://github.com/janhit/feuerwehr-beladung
 * Description:       Fahrzeugbeladung interaktiv lernen: Gerätefächer auf Fotos anklicken, Geräte nachschlagen, Quiz mit Lernfortschritt. Einbindung mit dem Shortcode [feuerwehr_beladung].
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            janhit
 * Author URI:        https://github.com/janhit
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       feuerwehr-beladung
 * Update URI:        https://github.com/janhit/feuerwehr-beladung
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FWB_VERSION', '0.1.0' );
define( 'FWB_DATEI', __FILE__ );
define( 'FWB_PFAD', plugin_dir_path( __FILE__ ) );
define( 'FWB_URL', plugin_dir_url( __FILE__ ) );

// Das Repository, aus dessen Releases Updates kommen. Lässt sich in der wp-config.php überschreiben.
if ( ! defined( 'FWB_GITHUB_REPO' ) ) {
	define( 'FWB_GITHUB_REPO', 'janhit/feuerwehr-beladung' );
}

require_once FWB_PFAD . 'includes/class-fwb-daten.php';
require_once FWB_PFAD . 'includes/class-fwb-lernstand.php';
require_once FWB_PFAD . 'includes/class-fwb-rest.php';
require_once FWB_PFAD . 'includes/class-fwb-frontend.php';
require_once FWB_PFAD . 'includes/class-fwb-updater.php';
require_once FWB_PFAD . 'includes/class-fwb-admin.php';

FWB_Daten::init();
FWB_Lernstand::init();
FWB_Rest::init();
FWB_Frontend::init();
FWB_Updater::init();

if ( is_admin() ) {
	FWB_Admin::init();
}

register_activation_hook(
	__FILE__,
	static function () {
		FWB_Daten::registriere_typ();
		flush_rewrite_rules();
	}
);
