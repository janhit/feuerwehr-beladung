# Feuerwehr Beladung

WordPress-Plugin, mit dem Feuerwehrangehörige die Beladung ihrer Fahrzeuge lernen: Fahrzeugfoto ansehen, Gerätefach antippen, Geräte nachschlagen und im Quiz abfragen lassen.

## Funktionen

**Lernseite** (Shortcode `[feuerwehr_beladung]`, nur für angemeldete Mitglieder)

- Aufbau in Ebenen, damit nie zu viel auf einmal zu sehen ist: Fahrzeugübersicht, Fahrzeug im Vollbild, Fach im Vollbild, Gerät als Karte über dem Foto
- Die Zurück-Taste des Handys führt genau eine Ebene nach oben
- Steckbrief je Fahrzeug hinter dem Knopf „Info": Foto, Pumpe, Löschwassertank und weitere frei benennbare Angaben
- Außenansichten mit anklickbaren Gerätefächern
- Geöffnetes Fach als Foto mit anklickbaren Geräten
- Mehrere Bilder je Fach, zum Beispiel „Schwenkwand geschlossen" und „Schwenkwand geöffnet". Ein Pfeil-Schalter auf dem Foto wechselt das Bild.
- Suche nach Geräten
- Quiz „In welchem Fach liegt …?": Man tippt das Fach direkt auf dem Fahrzeugfoto an. Fehler werden wiederholt.
- Lernfortschritt: Jedes Mitglied entscheidet selbst, ob er gespeichert wird. Es gibt einen Verlauf der letzten Runden und einen Knopf zum Zurücksetzen.

**Backend**

- Fahrzeuge anlegen, als Entwurf vorbereiten und veröffentlichen
- Editor mit vier Reitern: Stammdaten, Fächer, Geräte, Außenansichten
- Fotos aus der Mediathek, Markierungen mit der Maus aufziehen, verschieben und in der Größe ändern
- Protokoll der letzten Änderungen je Fahrzeug
- Lernstände einzelner oder aller Mitglieder löschen. Eine Einsicht in die Lernstände gibt es im Backend nicht.
- Updates aus den GitHub-Releases dieses Repositories, installierbar unter „Beladung → Einstellungen & Update"

## Installation

1. Unter [Releases](../../releases) die Datei `feuerwehr-beladung.zip` herunterladen.
2. In WordPress unter „Plugins → Plugin hinzufügen → Plugin hochladen" installieren und aktivieren.
3. Unter „Beladung → Einstellungen & Update" die Lernseite anlegen oder den Shortcode `[feuerwehr_beladung]` in eine eigene Seite setzen.
4. Unter „Beladung → Fahrzeug hinzufügen" das erste Fahrzeug anlegen.

Voraussetzungen: WordPress 6.0 oder neuer, PHP 7.4 oder neuer.

## Fotos

- Je Außenansicht ein Foto mit geschlossenen Rollläden.
- Je Fach ein Foto pro Zustand. Bei einer Schwenkwand also eins mit geschlossener und eins mit geöffneter Wand, möglichst vom gleichen Standpunkt.
- Die Fotos liegen in der WordPress-Mediathek. Wer die Adresse eines Fotos kennt, kann es auch ohne Anmeldung aufrufen. Die Zuordnung der Geräte ist nur für angemeldete Mitglieder abrufbar.

## Rechte

| Wer | Was |
| --- | --- |
| Angemeldete Mitglieder | Lernseite nutzen, eigenen Lernstand verwalten |
| Redakteure und Administratoren | Fahrzeuge bearbeiten, Entwürfe auf der Lernseite sehen |
| Administratoren | Einstellungen, Update, Lernstände löschen |

## Datenschutz

Der Lernfortschritt wird nur gespeichert, wenn das Mitglied es einschaltet. Gespeichert werden je Gerät die Zahl der richtigen und falschen Antworten, der Zeitpunkt der letzten Antwort und die Ergebnisse der letzten 30 Quizrunden. Schaltet das Mitglied die Speicherung aus, werden die Daten gelöscht. Das Plugin trägt einen Textvorschlag für die Datenschutzerklärung ein und meldet sich bei den WordPress-Werkzeugen zum Löschen personenbezogener Daten an.

Die Daten liegen in der WordPress-Datenbank (`usermeta`). Das Plugin zeigt sie im Backend nicht an. Wer direkten Zugriff auf die Datenbank hat, kann sie technisch trotzdem lesen.

## Neue Version veröffentlichen

1. Versionsnummer in `feuerwehr-beladung.php` an zwei Stellen erhöhen: im Kopf (`Version:`) und in `FWB_VERSION`.
2. Änderung auf `main` hochladen.
3. Die GitHub-Action erkennt die neue Versionsnummer, baut das ZIP und legt das Release an. WordPress-Seiten mit dem Plugin zeigen das Update danach an.

Änderungen ohne neue Versionsnummer lösen kein Release aus.

## Aufbau

```
feuerwehr-beladung.php        Plugin-Kopf und Start
includes/class-fwb-daten.php     Datenmodell, Bereinigung der Eingaben
includes/class-fwb-rest.php      REST-Schnittstelle der Lernseite
includes/class-fwb-lernstand.php Lernfortschritt
includes/class-fwb-admin.php     Editor und Einstellungsseite
includes/class-fwb-frontend.php  Shortcode
includes/class-fwb-updater.php   Updates aus GitHub-Releases
assets/                          JavaScript und CSS, ohne Build-Schritt
```

## Lizenz

GPL-2.0-or-later
