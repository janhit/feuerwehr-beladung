<?php
/**
 * Beim Löschen des Plugins: Lernstände und Zwischenspeicher entfernen.
 * Fahrzeuge und Fotos bleiben erhalten, damit eine versehentliche Deinstallation
 * nicht die gesamte Beladung vernichtet.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

foreach ( array( 'fwb_lernstand', 'fwb_verlauf', 'fwb_speichern' ) as $fwb_schluessel ) {
	delete_metadata( 'user', 0, $fwb_schluessel, '', true );
}
delete_site_transient( 'fwb_github_release' );
