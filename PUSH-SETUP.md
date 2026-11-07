# N'Farinati — notifiche push per ordini e prenotazioni

Questa versione è sviluppata esclusivamente nel branch `feature/prenotazioni-tavoli`. Il sito in produzione su `main` non viene modificato.

## Cosa cambia

Il vecchio admin controllava i nuovi ordini ogni 30 secondi e suonava solo quando la pagina era aperta. Non aveva un vero Service Worker, una subscription Web Push o un invio server-side.

Ora il branch comprende:

- Web Push PWA per Android, Chrome/Firefox/Samsung Internet e applicazioni web compatibili; iPhone/iPad richiede la web app aggiunta alla schermata Home, con permesso esplicito.
- Registrazione del singolo dispositivo autenticato, senza cambiare le credenziali del pannello.
- Pulsanti **Attiva push**, **Invia una prova**, **Disattiva** in `admin.html` e `admin-prenotazioni.html`.
- Notifiche per nuovi ordini **finalizzati** (contanti o SumUp, dopo conferma effettiva), nuove prenotazioni online e nuove prenotazioni inserite per telefono.
- Notifica con suono/vibrazione demandati alle impostazioni del dispositivo e link profondo alla sezione Ordini o al giorno di prenotazione.
- Coda eventi in D1 (nuove tabelle `push_*`) con deduplicazione, registro degli invii, disattivazione delle subscription scadute, ritentativi e invio in `waitUntil`.
- Web Push standard con **VAPID + AES128GCM**, senza servizi a pagamento di SMS/WhatsApp. L'invio al provider non equivale alla garanzia di visualizzazione sul telefono.

## Passaggio indispensabile: creare le chiavi VAPID una sola volta

Dal repository, in ambiente locale sicuro:

```bash
node scripts/generate-vapid.mjs
```

Il comando stampa tre variabili. Non condividere, committare o incollare in chat la **chiave privata**.

Nel progetto **Cloudflare Pages → Settings → Variables and Secrets** configura:

- `VAPID_PUBLIC_KEY` — valore generato, pubblico.
- `VAPID_PRIVATE_KEY` — valore generato, **Secret**.
- `VAPID_SUBJECT` — `https://nfarinatimodernpizza.it` (oppure `mailto:` seguito dalla email di servizio).

Configurale per l'ambiente **Preview** se vuoi provarle sul branch, lasciando il sito `main` invariato. Per la produzione serviranno poi anche nel relativo ambiente, ma **non modificare produzione finché non autorizzato**.

Le chiavi devono rimanere stabili: se vengono cambiate i dispositivi possono dover disattivare e riattivare le notifiche. La preview `.pages.dev` e il dominio di produzione sono **origini differenti**: un dispositivo deve autorizzarle separatamente.

**Fondamentale per le prove push**: usare l'**alias stabile del branch** mostrato da Cloudflare nella sezione dettagli del deploy, non l'URL casuale con hash (come `174b9a.*.pages.dev`). Cloudflare aggiorna l'alias del branch sui nuovi deploy: il browser mantiene così la stessa origine e la stessa registrazione push. Se usi il singolo URL con hash, passando a un nuovo deploy il permesso e la subscription possono restare legati al vecchio indirizzo.

## Come attivare le notifiche sul telefono

1. Aprire il nuovo deploy preview **HTTPS** del branch.
2. Accedere a `admin.html` con le credenziali già esistenti; non ne vengono create di nuove.
3. Toccare **Attiva push su questo dispositivo** e permettere le notifiche nel browser.
4. Toccare **Invia una prova**. Il pannello indica se il servizio push ha accettato l'invio. Controllare la notifica sul dispositivo, anche con scheda chiusa.
5. Ripetere su ciascun dispositivo autorizzato dello staff.

Su iPhone/iPad aprire il sito in Safari, usare **Condividi → Aggiungi alla schermata Home**, avviare l'app dalla Home e **solo da lì** toccare Attiva push. Il browser normale su iPhone non supporta il medesimo flusso. Verificare anche permessi del sistema, modalità silenziosa, concentrazione e risparmio batteria.

Non si può attivare da remoto il permesso browser: deve essere concesso dal titolare con un gesto.

## Ritentativi automatici

I nuovi eventi vengono inviati subito dalla Pages Function tramite `context.waitUntil`. In caso di temporanea indisponibilità del provider rimangono nella coda D1 e vengono ritentati quando si verificano altre attività.

Per un **recupero periodico anche in assenza di nuovi ordini o visite al sito**, è pronto un Cloudflare Worker con Cron ogni 2 minuti: `scripts/push-cron-worker.mjs` e `wrangler.push-cron.toml`. È un deploy **separato**, non incluso automaticamente in Pages e **non è ancora stato attivato**. Utilizza lo stesso D1 e deve ricevere le stesse variabili VAPID; i secret vanno impostati nel Worker e non nel codice.

Comandi da eseguire solo dopo aver deciso di attivarlo e configurato le credenziali Cloudflare:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY --config wrangler.push-cron.toml
npx wrangler secret put VAPID_PRIVATE_KEY --config wrangler.push-cron.toml
npx wrangler secret put VAPID_SUBJECT --config wrangler.push-cron.toml
npx wrangler deploy --config wrangler.push-cron.toml
```

Il file `wrangler.push-cron.toml` punta **al database di produzione**, quindi **NON fare deploy del Cron Worker durante la sola prova del branch**. Se serve il cron su preview, configurare prima un D1 di prova e cambiare `PUSH_ORIGINS` con l'URL specifico di preview.

## Controlli prima del lancio

- Confermare che le Pages Functions del deploy usino un binding `DB` corretto e preferibilmente **un D1 separato per la preview**.
- Creare prenotazione online: verifica immediata nell'admin, badge e Web Push.
- Creare prenotazione telefonica: verifica nella griglia e Web Push.
- Confermare un ordine contanti e un ordine con pagamento SumUp riuscito: nessuna push prima dell'effettiva conferma.
- Ricaricare la pagina e chiuderla: ripetere con il test push.
- Su Android testare Chrome e le impostazioni notifiche; su iOS testare la web app dalla Home.
- Il pulsante **Invia una prova** e `GET /admin/push` forniscono diagnostica: `configured`, `activeDevices`, `pending`, ultimi tentativi.
- Se non ci sono dispositivi registrati, il sistema non può inviare push reali; la prenotazione/l'ordine rimangono regolarmente registrati.

**Nessuna API può garantire al 100% la visualizzazione delle notifiche:** il provider può accettare il messaggio, ma OS, browser, connessione e permessi decidono la consegna effettiva. Mantenere il controllo dell'admin e gli avvisi locali come canali supplementari.
