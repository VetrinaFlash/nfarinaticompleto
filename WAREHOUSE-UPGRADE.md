# Sala, Bar e visibilità staff

Dopo il deploy, il primo accesso al catalogo magazzino o il login staff esegue automaticamente la migrazione D1. Non occorre eseguire nuovamente lo schema completo né reinstallare il magazzino.

La migrazione è transazionale, conserva ID, prodotti, prezzi, stato attivo, ordini, bozze e righe storiche. Registra la versione in `warehouse_migrations` e non sovrascrive password o configurazioni esistenti. I nuovi account sono creati con password hash, seguendo il formato dell'autenticazione staff esistente.

In **Admin → Magazzino → Accessi staff**, scegliere i reparti per ogni dipendente e premere **Salva** sulla relativa riga. Inizialmente tutti i reparti sono visibili; una selezione vuota nega tutti i reparti. Gli amministratori mantengono accesso completo. I controlli API si applicano anche alle sessioni già aperte e impediscono l'invio di prodotti non autorizzati. Gli ordini restano salvati integralmente e sempre consultabili dall'admin; lo staff vede solo le righe dei reparti consentiti.

Sala e Bar partono senza prodotti: si configurano in **Prodotti**, con gli stessi campi, fornitori e prezzi di Pizzeria e Cucina. Nessun prodotto esistente viene spostato automaticamente.

Per attivare esplicitamente la migrazione dopo il deploy, impostare `NFARINATI_ADMIN_USERNAME` e `NFARINATI_ADMIN_PASSWORD` nell'ambiente ed eseguire:

```sh
node scripts/upgrade-warehouse.mjs https://nfarinatimodernpizza.it
```

Lo script effettua il login admin e richiama `POST /admin/upgrade-warehouse`, senza stampare password o cookie. Anche il setup magazzino applica l'upgrade, ma non serve ripetere il seed dei prodotti per un aggiornamento.

Verifica locale con Node 24 o successivo:

```sh
node --test tests/warehouse.test.mjs
```
