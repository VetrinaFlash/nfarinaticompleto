# N'Farinati — prenotazioni tavoli (branch di prova)

Branch: `feature/prenotazioni-tavoli`. Creato da `main` (`da05952cc7d7ef60967a0f400b901888b0dd03bf`). **Nessuna modifica a main e nessuna modifica alle credenziali.**

## Funzioni

- `/prenota.html`: scelta data, coperti e orario; conferma automatica senza registrazione; numero di telefono obbligatorio; email facoltativa.
- Conferma visibile sul sito, codice prenotazione, link personale con token riservato.
- `.ics` compatibile con calendari che importano iCalendar, con avvisi a 24 ore e 2 ore; link Google Calendar (avvisi secondo le impostazioni dell'utente). Nessun messaggio WhatsApp/SMS/email viene inviato.
- `/admin-prenotazioni.html`: agenda per giorno e stato, prenotazioni telefoniche, modifiche, cancellazioni, arrivo, tavolo occupato, liberazione, no-show, prolungamento di 15/30 minuti.
- Impostazioni: capienza contemporanea, quota riservata a prenotazioni non online, 90 minuti di durata predefinita, 15 minuti di margine, orari/chiusure settimanali e straordinarie, tavoli fisici opzionali, limitazioni di preavviso.
- Badge + notifica sonora nel pannello admin esistente, oltre alla sezione dedicata.
- Concorrenza: inventario a scatti di 15 minuti, trigger SQLite per l'applicazione atomica delle quote, protezione dei tavoli assegnati, token per gestione cliente e ripetizioni idempotenti della stessa conferma.
- Endpoint pubblici limitati per frequenza; Cloudflare Turnstile supportato opzionalmente.

## API / file

- `functions/_lib/booking.js`: schema additivo, disponibilità, salvataggio e transizioni di stato.
- `functions/api/booking-config.js`: parametri pubblici.
- `functions/api/bookings.js`: disponibilità e nuova prenotazione.
- `functions/api/booking-manage.js`: gestione tramite token segreto.
- `functions/admin/bookings.js`: agenda e configurazioni, accessibili solo con la sessione admin già esistente.
- `admin-prenotazioni.html`, `prenota.html`, `booking-admin-badge.js`.

## Database / ambiente di anteprima

Le **nuove** tabelle `booking_*` e i trigger vengono creati automaticamente in modo idempotente alla prima chiamata di un endpoint prenotazioni; gli aggiornamenti previsti sono additivi. Non vengono toccate le tabelle degli ordini, dei pagamenti, del magazzino o delle credenziali.

Cloudflare Pages deve avere il binding D1 `DB` disponibile **anche nell'ambiente preview**. Verificare quale database D1 è associato alla preview prima di provarla: se preview e produzione condividono il binding, la prima visita alla preview creerà le nuove tabelle anche nel medesimo database (senza alterare tabelle esistenti). È preferibile usare un D1 di prova.

**I valori iniziali sono solo tecnici**: 50 posti totali, quota telefonica 0, 8 persone max online, apertura serale dal martedì alla domenica, 90 minuti + 15 di margine. Il titolare deve inserire la capienza, i tavoli e gli orari reali dall'admin prima di aprire le prenotazioni al pubblico.

Per attivare Turnstile configurare insieme i binding `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` nell'ambiente Workers/Pages. Se non configurati, resta il rate limit; i recapiti telefonici non sono verificati tramite OTP (nessun costo SMS/API).

## Verifiche e messa online

```bash
node --test tests/*.test.mjs
npx --yes wrangler@4 pages functions build functions
```

Il workflow GitHub Actions `.github/workflows/booking-tests.yml` esegue entrambi i comandi sui push del branch.

Prima di approvare il merge: provare i flussi su preview con D1 di prova, verificare reale capienza/orari/tavoli, calendario su iPhone/Android, login esistente, flussi ordini/asporto, cancellazioni, prenotazioni simultanee e pagina mobile. Il file `privacy-prenotazioni.html` è una **bozza**: verificare dati del titolare, tempi di conservazione, contratti e diritto alla cancellazione; definire una procedura effettiva di cancellazione periodica prima del lancio.

La soluzione non include messaggistica automatica, push a browser chiuso, mappa sala drag-and-drop, lista d'attesa o sincronizzazione con TheFork: queste integrazioni non sono necessarie per la prenotazione diretta e richiedono sviluppi separati.

**Non pubblicare su main senza esplicita autorizzazione.**
