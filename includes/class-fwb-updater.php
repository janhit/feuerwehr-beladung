<?php
/**
 * Updates aus den GitHub-Releases des Repositories.
 *
 * WordPress fragt über den Filter update_plugins_github.com nach, weil im Plugin-Kopf
 * eine „Update URI" auf github.com steht. Gibt es ein Release mit höherer Versionsnummer,
 * erscheint das Update wie bei jedem anderen Plugin unter „Plugins" und auf der Einstellungsseite.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FWB_Updater {

	const TRANSIENT = 'fwb_github_release';
	const SLUG      = 'feuerwehr-beladung';

	public static function init() {
		add_filter( 'update_plugins_github.com', array( __CLASS__, 'pruefe' ), 10, 3 );
		add_filter( 'plugins_api', array( __CLASS__, 'details' ), 20, 3 );
		add_filter( 'upgrader_source_selection', array( __CLASS__, 'ordner_korrigieren' ), 10, 4 );
	}

	public static function plugin_datei() {
		return plugin_basename( FWB_DATEI );
	}

	/**
	 * Neuestes Release von GitHub. Ergebnis: Array mit version, paket, url, notizen, datum
	 * oder Array mit dem Schlüssel fehler.
	 */
	public static function release( $frisch = false ) {
		if ( ! $frisch ) {
			$zwischen = get_site_transient( self::TRANSIENT );
			if ( is_array( $zwischen ) ) {
				return $zwischen;
			}
		}

		$antwort = wp_remote_get(
			'https://api.github.com/repos/' . FWB_GITHUB_REPO . '/releases/latest',
			array(
				'timeout' => 10,
				'headers' => array(
					'Accept'     => 'application/vnd.github+json',
					'User-Agent' => 'feuerwehr-beladung/' . FWB_VERSION,
				),
			)
		);

		if ( is_wp_error( $antwort ) ) {
			$ergebnis = array( 'fehler' => 'GitHub ist nicht erreichbar: ' . $antwort->get_error_message() );
		} else {
			$code = (int) wp_remote_retrieve_response_code( $antwort );
			$json = json_decode( wp_remote_retrieve_body( $antwort ), true );
			if ( 404 === $code ) {
				$ergebnis = array( 'fehler' => 'Im Repository ' . FWB_GITHUB_REPO . ' ist noch keine Version veröffentlicht.' );
			} elseif ( 200 !== $code || ! is_array( $json ) || empty( $json['tag_name'] ) ) {
				$ergebnis = array( 'fehler' => 'GitHub hat unerwartet geantwortet (Status ' . $code . ').' );
			} else {
				$paket = (string) ( $json['zipball_url'] ?? '' );
				foreach ( (array) ( $json['assets'] ?? array() ) as $asset ) {
					if ( ( $asset['name'] ?? '' ) === self::SLUG . '.zip' && ! empty( $asset['browser_download_url'] ) ) {
						$paket = (string) $asset['browser_download_url'];
						break;
					}
				}
				$ergebnis = array(
					'version' => ltrim( (string) $json['tag_name'], 'vV' ),
					'paket'   => $paket,
					'url'     => (string) ( $json['html_url'] ?? 'https://github.com/' . FWB_GITHUB_REPO ),
					'notizen' => (string) ( $json['body'] ?? '' ),
					'datum'   => (string) ( $json['published_at'] ?? '' ),
				);
			}
		}

		// Fehler nur kurz merken, damit ein neuer Versuch bald wieder möglich ist.
		set_site_transient( self::TRANSIENT, $ergebnis, isset( $ergebnis['fehler'] ) ? 10 * MINUTE_IN_SECONDS : 6 * HOUR_IN_SECONDS );
		return $ergebnis;
	}

	public static function update_verfuegbar( $release ) {
		return is_array( $release ) && ! empty( $release['version'] ) && version_compare( $release['version'], FWB_VERSION, '>' );
	}

	public static function pruefe( $update, $plugin_data, $plugin_file ) {
		if ( self::plugin_datei() !== $plugin_file ) {
			return $update;
		}
		$release = self::release();
		if ( empty( $release['version'] ) || empty( $release['paket'] ) ) {
			return $update;
		}
		return array(
			'id'      => 'https://github.com/' . FWB_GITHUB_REPO,
			'slug'    => self::SLUG,
			'version' => $release['version'],
			'url'     => $release['url'],
			'package' => $release['paket'],
		);
	}

	/** Füllt das Fenster „Details ansehen" in der Plugin-Liste. */
	public static function details( $ergebnis, $aktion, $args ) {
		if ( 'plugin_information' !== $aktion || empty( $args->slug ) || self::SLUG !== $args->slug ) {
			return $ergebnis;
		}
		$release = self::release();
		if ( empty( $release['version'] ) ) {
			return $ergebnis;
		}
		return (object) array(
			'name'          => 'Feuerwehr Beladung',
			'slug'          => self::SLUG,
			'version'       => $release['version'],
			'author'        => '<a href="https://github.com/janhit">janhit</a>',
			'homepage'      => 'https://github.com/' . FWB_GITHUB_REPO,
			'last_updated'  => $release['datum'],
			'download_link' => $release['paket'],
			'sections'      => array(
				'changelog' => '' !== $release['notizen'] ? wpautop( esc_html( $release['notizen'] ) ) : '<p>Keine Hinweise zu dieser Version.</p>',
			),
		);
	}

	/**
	 * GitHub packt den Code in einen Ordner mit anderem Namen. Vor der Installation wird er
	 * so umbenannt, wie der Plugin-Ordner auf dieser Seite heißt. Sonst wäre das Plugin
	 * nach dem Update deaktiviert.
	 */
	public static function ordner_korrigieren( $quelle, $entpackt, $upgrader, $extra = array() ) {
		global $wp_filesystem;
		if ( is_wp_error( $quelle ) || empty( $extra['plugin'] ) || self::plugin_datei() !== $extra['plugin'] ) {
			return $quelle;
		}
		$ziel = trailingslashit( $entpackt ) . dirname( self::plugin_datei() ) . '/';
		if ( trailingslashit( $quelle ) === $ziel ) {
			return $quelle;
		}
		if ( $wp_filesystem && $wp_filesystem->move( $quelle, $ziel, true ) ) {
			return $ziel;
		}
		return new WP_Error( 'fwb_ordner', 'Der Plugin-Ordner konnte beim Update nicht umbenannt werden.' );
	}

	/** Verwirft den Zwischenspeicher und fragt GitHub und WordPress neu ab. */
	public static function jetzt_pruefen() {
		delete_site_transient( self::TRANSIENT );
		$release = self::release( true );
		delete_site_transient( 'update_plugins' );
		wp_update_plugins();
		return $release;
	}

	public static function installations_link() {
		$datei = self::plugin_datei();
		return wp_nonce_url( self_admin_url( 'update.php?action=upgrade-plugin&plugin=' . rawurlencode( $datei ) ), 'upgrade-plugin_' . $datei );
	}
}
