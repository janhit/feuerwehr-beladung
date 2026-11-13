<?php
/**
 * Backend: Editor für die Beladung und die Seite „Einstellungen & Update".
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FWB_Admin {

	const SEITE = 'fwb-einstellungen';

	public static function init() {
		add_action( 'add_meta_boxes_' . FWB_Daten::TYP, array( __CLASS__, 'meta_box' ) );
		add_action( 'save_post_' . FWB_Daten::TYP, array( __CLASS__, 'speichern' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'skripte' ) );
		add_action( 'admin_menu', array( __CLASS__, 'menue' ) );
		add_action( 'admin_post_fwb_aktion', array( __CLASS__, 'aktion' ) );
		add_filter( 'manage_' . FWB_Daten::TYP . '_posts_columns', array( __CLASS__, 'spalten' ) );
		add_action( 'manage_' . FWB_Daten::TYP . '_posts_custom_column', array( __CLASS__, 'spalte' ), 10, 2 );
		add_filter( 'plugin_action_links_' . plugin_basename( FWB_DATEI ), array( __CLASS__, 'plugin_links' ) );
	}

	/* ---------- Editor ---------- */

	public static function meta_box() {
		add_meta_box( 'fwb-editor-box', 'Beladung', array( __CLASS__, 'editor' ), FWB_Daten::TYP, 'normal', 'high' );
		add_meta_box( 'fwb-protokoll-box', 'Letzte Änderungen', array( __CLASS__, 'protokoll' ), FWB_Daten::TYP, 'side', 'low' );
	}

	public static function editor( $post ) {
		wp_nonce_field( 'fwb_speichern_' . $post->ID, 'fwb_nonce' );
		echo '<textarea name="fwb_daten" id="fwb-daten" hidden></textarea>';
		echo '<div id="fwb-editor"><p>Der Editor wird geladen …</p></div>';
	}

	public static function protokoll( $post ) {
		$protokoll = get_post_meta( $post->ID, FWB_Daten::PROTOKOLL, true );
		if ( ! is_array( $protokoll ) || ! $protokoll ) {
			echo '<p>Noch keine Änderungen gespeichert.</p>';
			return;
		}
		echo '<ul class="fwb-protokoll">';
		foreach ( array_slice( $protokoll, 0, 8 ) as $e ) {
			$user = get_userdata( (int) ( $e['user'] ?? 0 ) );
			printf(
				'<li><strong>%s</strong><br>%s · %d Fächer, %d Geräte</li>',
				esc_html( wp_date( 'd.m.Y H:i', (int) ( $e['zeit'] ?? 0 ) ) ),
				esc_html( $user ? $user->display_name : 'unbekannt' ),
				(int) ( $e['faecher'] ?? 0 ),
				(int) ( $e['geraete'] ?? 0 )
			);
		}
		echo '</ul>';
	}

	public static function skripte( $hook ) {
		$screen = get_current_screen();
		if ( ! $screen || FWB_Daten::TYP !== $screen->post_type ) {
			return;
		}
		wp_enqueue_style( 'fwb-admin', FWB_URL . 'assets/admin.css', array(), FWB_VERSION );
		if ( 'post.php' !== $hook && 'post-new.php' !== $hook ) {
			return;
		}
		global $post;
		$daten = FWB_Daten::lade( $post->ID );
		wp_enqueue_media();
		wp_enqueue_script( 'fwb-admin', FWB_URL . 'assets/admin.js', array(), FWB_VERSION, true );
		wp_localize_script(
			'fwb-admin',
			'FWB_ADMIN',
			array(
				'daten'  => $daten,
				'bilder' => (object) FWB_Daten::bilder( $daten ),
				'neu'    => 'auto-draft' === $post->post_status,
			)
		);
	}

	public static function speichern( $post_id, $post ) {
		if ( ! isset( $_POST['fwb_daten'], $_POST['fwb_nonce'] ) ) {
			return;
		}
		if ( ! wp_verify_nonce( sanitize_key( $_POST['fwb_nonce'] ), 'fwb_speichern_' . $post_id ) ) {
			return;
		}
		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_revision( $post_id ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- JSON, wird in FWB_Daten::bereinige() Feld für Feld bereinigt.
		$roh = json_decode( wp_unslash( $_POST['fwb_daten'] ), true );
		if ( is_array( $roh ) ) {
			FWB_Daten::speichere( $post_id, $roh );
		}
	}

	public static function spalten( $spalten ) {
		$neu = array();
		foreach ( $spalten as $k => $v ) {
			$neu[ $k ] = $v;
			if ( 'title' === $k ) {
				$neu['fwb_inhalt'] = 'Beladung';
			}
		}
		return $neu;
	}

	public static function spalte( $spalte, $post_id ) {
		if ( 'fwb_inhalt' === $spalte ) {
			$d = FWB_Daten::lade( $post_id );
			printf( '%d Fächer · %d Geräte', count( $d['faecher'] ), count( $d['geraete'] ) );
		}
	}

	public static function plugin_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( self::seiten_url() ) . '">Einstellungen & Update</a>' );
		return $links;
	}

	/* ---------- Einstellungen & Update ---------- */

	public static function seiten_url( $args = array() ) {
		return add_query_arg(
			array_merge(
				array(
					'post_type' => FWB_Daten::TYP,
					'page'      => self::SEITE,
				),
				$args
			),
			admin_url( 'edit.php' )
		);
	}

	public static function menue() {
		add_submenu_page(
			'edit.php?post_type=' . FWB_Daten::TYP,
			'Einstellungen & Update',
			'Einstellungen & Update',
			'manage_options',
			self::SEITE,
			array( __CLASS__, 'seite' )
		);
	}

	private static function formular( $aktion, $knopf, $klasse = 'button', $felder = '', $bestaetigen = '' ) {
		printf(
			'<form method="post" action="%s" class="fwb-form"%s>',
			esc_url( admin_url( 'admin-post.php' ) ),
			'' !== $bestaetigen ? ' onsubmit="return confirm(\'' . esc_js( $bestaetigen ) . '\');"' : ''
		);
		wp_nonce_field( 'fwb_aktion' );
		echo '<input type="hidden" name="action" value="fwb_aktion">';
		printf( '<input type="hidden" name="fwb" value="%s">', esc_attr( $aktion ) );
		echo $felder; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wird vom Aufrufer escaped.
		printf( '<button type="submit" class="%s">%s</button>', esc_attr( $klasse ), esc_html( $knopf ) );
		echo '</form>';
	}

	public static function seite() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$release   = FWB_Updater::release();
		$meldungen = array(
			'geprueft'      => 'Die Suche nach Updates ist abgeschlossen.',
			'alle_geloescht' => 'Alle Lernstände wurden gelöscht.',
			'user_geloescht' => 'Der Lernstand des Mitglieds wurde gelöscht.',
			'user_leer'     => 'Für dieses Mitglied war kein Lernstand gespeichert.',
			'seite_angelegt' => 'Die Lernseite wurde angelegt.',
			'beispiel'      => 'Das Beispielfahrzeug wurde als Entwurf angelegt. Du findest es unter „Fahrzeuge".',
		);
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- nur Anzeige einer Meldung.
		$meldung = isset( $_GET['fwb_meldung'] ) ? sanitize_key( $_GET['fwb_meldung'] ) : '';

		echo '<div class="wrap fwb-einstellungen"><h1>Feuerwehr Beladung</h1>';
		if ( isset( $meldungen[ $meldung ] ) ) {
			printf( '<div class="notice notice-success is-dismissible"><p>%s</p></div>', esc_html( $meldungen[ $meldung ] ) );
		}

		/* Update */
		echo '<div class="card"><h2>Update</h2>';
		printf( '<p>Installierte Version: <strong>%s</strong></p>', esc_html( FWB_VERSION ) );
		if ( ! empty( $release['fehler'] ) ) {
			printf( '<p>%s</p>', esc_html( $release['fehler'] ) );
		} elseif ( FWB_Updater::update_verfuegbar( $release ) ) {
			printf( '<p>Neue Version verfügbar: <strong>%s</strong>', esc_html( $release['version'] ) );
			if ( ! empty( $release['datum'] ) ) {
				printf( ' vom %s', esc_html( wp_date( 'd.m.Y', strtotime( $release['datum'] ) ) ) );
			}
			echo '</p>';
			if ( '' !== trim( $release['notizen'] ) ) {
				printf( '<div class="fwb-notizen">%s</div>', wp_kses_post( wpautop( esc_html( $release['notizen'] ) ) ) );
			}
			if ( current_user_can( 'update_plugins' ) ) {
				printf( '<p><a class="button button-primary" href="%s">Version %s jetzt installieren</a></p>', esc_url( FWB_Updater::installations_link() ), esc_html( $release['version'] ) );
			}
			echo '<p class="description">Fahrzeuge, Fotos und Lernstände bleiben beim Update erhalten.</p>';
		} else {
			echo '<p>Das Plugin ist aktuell.</p>';
		}
		self::formular( 'pruefen', 'Jetzt nach Updates suchen' );
		printf( '<p class="description">Updates kommen aus den Releases von <a href="%1$s" target="_blank" rel="noopener">%2$s</a>.</p>', esc_url( 'https://github.com/' . FWB_GITHUB_REPO . '/releases' ), esc_html( 'github.com/' . FWB_GITHUB_REPO ) );
		echo '</div>';

		/* Lernseite */
		echo '<div class="card"><h2>Lernseite</h2>';
		echo '<p>Die Lernseite erscheint überall dort, wo dieser Shortcode steht. Sie ist nur für angemeldete Mitglieder sichtbar.</p>';
		echo '<p><code>[feuerwehr_beladung]</code></p>';
		$seiten = get_posts(
			array(
				'post_type'   => 'page',
				'post_status' => array( 'publish', 'private', 'draft' ),
				's'           => '[feuerwehr_beladung',
				'numberposts' => 5,
			)
		);
		if ( $seiten ) {
			echo '<p>Seiten mit dem Shortcode:</p><ul class="ul-disc">';
			foreach ( $seiten as $s ) {
				printf( '<li><a href="%s">%s</a></li>', esc_url( get_permalink( $s ) ), esc_html( get_the_title( $s ) ) );
			}
			echo '</ul>';
		} else {
			self::formular( 'seite_anlegen', 'Seite „Beladung" mit dem Shortcode anlegen' );
		}
		echo '</div>';

		/* Beispiel */
		echo '<div class="card"><h2>Beispielfahrzeug</h2>';
		echo '<p>Legt ein HLF 1 mit erfundener Beladung als Entwurf an: zwei befüllte Fächer, eine Schwenkwand und ein Auszug, ohne Fotos. Damit kannst du Editor und Lernseite ausprobieren. Entwürfe sehen auf der Lernseite nur Redakteure und Administratoren.</p>';
		self::formular( 'beispiel', 'Beispielfahrzeug anlegen' );
		echo '</div>';

		/* Lernstände */
		echo '<div class="card"><h2>Lernfortschritt der Mitglieder</h2>';
		echo '<p>Jedes Mitglied entscheidet selbst, ob sein Lernfortschritt gespeichert wird, und kann ihn jederzeit zurücksetzen. Im Backend gibt es keine Einsicht in die Lernstände. Du kannst sie hier nur löschen.</p>';
		printf( '<p>Mitglieder mit eingeschalteter Speicherung: <strong>%d</strong></p>', (int) FWB_Lernstand::anzahl_mit_speicherung() );
		$auswahl = wp_dropdown_users(
			array(
				'name'             => 'fwb_user',
				'echo'             => false,
				'show_option_none' => 'Mitglied wählen …',
			)
		);
		self::formular( 'loesche_user', 'Lernstand dieses Mitglieds löschen', 'button', $auswahl, 'Lernstand dieses Mitglieds wirklich löschen?' );
		self::formular( 'loesche_alle', 'Alle Lernstände löschen', 'button button-link-delete', '', 'Wirklich die Lernstände aller Mitglieder löschen? Das lässt sich nicht rückgängig machen.' );
		echo '</div></div>';
	}

	public static function aktion() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Keine Berechtigung.' );
		}
		check_admin_referer( 'fwb_aktion' );
		$aktion  = isset( $_POST['fwb'] ) ? sanitize_key( $_POST['fwb'] ) : '';
		$meldung = '';

		switch ( $aktion ) {
			case 'pruefen':
				FWB_Updater::jetzt_pruefen();
				$meldung = 'geprueft';
				break;
			case 'loesche_alle':
				FWB_Lernstand::loesche_alle();
				$meldung = 'alle_geloescht';
				break;
			case 'loesche_user':
				$user_id = isset( $_POST['fwb_user'] ) ? absint( $_POST['fwb_user'] ) : 0;
				if ( $user_id > 0 ) {
					$meldung = FWB_Lernstand::loesche_user( $user_id ) ? 'user_geloescht' : 'user_leer';
				}
				break;
			case 'beispiel':
				$beispiel = require FWB_PFAD . 'includes/beispiel.php';
				$post_id  = wp_insert_post(
					array(
						'post_type'   => FWB_Daten::TYP,
						'post_status' => 'draft',
						'post_title'  => $beispiel['titel'],
					)
				);
				if ( $post_id && ! is_wp_error( $post_id ) ) {
					FWB_Daten::speichere( $post_id, $beispiel['daten'] );
					$meldung = 'beispiel';
				}
				break;
			case 'seite_anlegen':
				wp_insert_post(
					array(
						'post_type'    => 'page',
						'post_status'  => 'publish',
						'post_title'   => 'Beladung',
						'post_content' => '[feuerwehr_beladung]',
					)
				);
				$meldung = 'seite_angelegt';
				break;
		}

		wp_safe_redirect( self::seiten_url( $meldung ? array( 'fwb_meldung' => $meldung ) : array() ) );
		exit;
	}
}
