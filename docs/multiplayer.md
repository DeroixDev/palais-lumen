# Gemeinsam spielen

Bis zu vier Leute können zusammen durch das Palais ziehen. Ein Browser ist der **Gastgeber**: In seinem Spielstand wird gespielt, er führt das gemeinsame Konto (Lumen, Tagesziel, Medaillen, Saison, Mondsteine) und beendet den Tag. Alle anderen sind **Gäste**. Sie laufen frei herum, fahren mit dem Aufzug, wohin sie wollen, und spielen an jedem Automaten. Jeder Einsatz und jeder Gewinn landet sofort auf dem gemeinsamen Konto.

Die Browser verbinden sich direkt miteinander (WebRTC über PeerJS). Ein kleiner Vermittlungsserver bringt sie nur zusammen. Danach läuft nichts mehr über ihn.

## Gruppe öffnen (Gastgeber)

1. Spiel starten und zur **Rezeption** gehen.
2. Auf der Karte **„Gruppe öffnen“** wählen. Es erscheint ein fünfstelliger Code, zum Beispiel `KXRTM`.
3. **„Link kopieren“** und den Link an die Freunde schicken, oder einfach den Code durchgeben.
4. Wer verbunden ist, sitzt mit Namen und Figur auf der Karte. Oben im HUD zeigen farbige Punkte, wer gerade online ist.

Nur der Gastgeber kann den Tag beenden. Beim **Feierabend** spielen alle ihre laufende Runde zu Ende. Danach sehen alle gemeinsam den Tagesabschluss mit der Seite **„Eure Runde“**: Runden und Gewinn pro Spieler und wer den Abend gerettet hat.

Das Haustablet bleibt beim Gastgeber. Dort gibt es unter dem Glücksregler die Auswahl **„Glück pro Spieler“**: Damit gilt der Regler für alle oder nur für einen bestimmten Gast. Beim Gast selbst ist davon nichts zu sehen.

**„Gruppe schließen“** an der Rezeption beendet die Runde. Die Gäste bekommen einen kurzen Hinweis und landen wieder auf ihrem Startbildschirm.

## Beitreten (Gast)

- **Mit Link:** Den Link öffnen, Namen eintragen und auf **„Beitreten“** klicken.
- **Mit Code:** Auf dem Startbildschirm **„Mit Freunden“** wählen, den Code eintippen (Groß-/Kleinschreibung egal) und beitreten.

Der eigene Spielstand bleibt dabei unangetastet. Name, Farbe und Outfit des Gasts speichert der Gastgeber in seinem Spielstand. Beim nächsten Mal ist man also gleich wieder richtig angezogen. Verliert ein Gast die Verbindung, spielen die anderen einfach weiter, und er kann mit demselben Code jederzeit wieder einsteigen. Fällt der Gastgeber weg, ist die Runde für alle vorbei.

Im HUD neben den Punkten öffnet das Sprechblasen-Symbol die Reaktionen (👏 😮 🎉 🍀) und ein paar fertige Sätze. Große Gewinne der anderen erscheinen als kurze Meldung.

## Eigener Vermittlungsserver

Standardmäßig wird der öffentliche PeerJS-Dienst (`0.peerjs.com`) genutzt. Wer lieber einen eigenen betreibt, etwa im Heimnetz oder auf einem kleinen Server:

```sh
npx peer --port 9000
# nur IPv4, falls IPv6 auf dem Rechner fehlt:
npx peer --port 9000 --host 0.0.0.0
```

Danach muss jeder Browser der Gruppe diesen Server verwenden. Dafür gibt es zwei Wege:

- **In der Oberfläche:** Auf der Gruppen- oder Beitreten-Karte **„Vermittlungsserver“** aufklappen und die Adresse eintragen, z. B. `192.168.1.20:9000` oder `peer.example.org`. Die Angabe wird im Browser gespeichert. Ein leeres Feld bedeutet wieder den öffentlichen Dienst.
- **Per Adresse:** `?peer=host:port` an die Spiel-URL hängen, z. B. `…/?peer=localhost:9000`. Der Einladungslink des Gastgebers enthält diesen Parameter automatisch, sobald ein eigener Server eingestellt ist.

Adressen im Heimnetz (`localhost`, `127.…`, `10.…`, `192.168.…`) werden unverschlüsselt angesprochen, ohne Port auf 9000. Alle anderen per TLS, ohne Port auf 443. Mit `http://` oder `https://` davor lässt sich das ausdrücklich festlegen. Läuft das Spiel selbst über `https://`, muss auch der Vermittlungsserver per TLS erreichbar sein.

Für Tests auf einem einzigen Rechner sorgt `?ice=local` dafür, dass keine STUN-Server abgefragt werden.

## Grenzen

- In der Artifact-Vorschau von claude.ai ist WebRTC gesperrt. Dort zeigt die Karte nur einen Hinweis, das Spiel allein funktioniert normal.
- Netzwerke mit sehr strenger Firewall (symmetrisches NAT ohne TURN-Server) können die direkte Verbindung verhindern.
- Gäste speichern nicht selbst und können während einer Runde keinen anderen Spielstand laden. Die Tagesherausforderung ist in der Gruppe nicht verfügbar.
