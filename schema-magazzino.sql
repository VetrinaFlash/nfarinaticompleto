-- ============================================================
-- NFARINATI - MODULO ORDINI MATERIE PRIME (Magazzino)
-- Schema D1 + Seed — modulo SEPARATO, non tocca le tabelle menu
-- Eseguire: wrangler d1 execute nfarinati-db --remote --file=schema-magazzino.sql
-- (in alternativa: POST /admin/setup-magazzino da loggati come admin)
-- ============================================================

-- Utenti staff (login individuale, ruolo staff/admin)
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('staff','admin')),
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Anagrafica materie prime: chiave univoca = (nome, reparto)
CREATE TABLE IF NOT EXISTS raw_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL CHECK(department IN ('Pizzeria','Cucina')),
  supplier TEXT NOT NULL DEFAULT '',
  active INTEGER DEFAULT 1,
  UNIQUE(name, department)
);

-- Ordini materie prime (separati dalla tabella "orders" dei clienti)
-- modified/modified_at: l'admin ha rettificato l'ordine
CREATE TABLE IF NOT EXISTS supply_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_user_id INTEGER NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inviato' CHECK(status IN ('inviato','evaso')),
  created_at TEXT DEFAULT (datetime('now','localtime')),
  fulfilled_at TEXT,
  modified INTEGER DEFAULT 0,
  modified_at TEXT,
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id)
);

-- Righe ordine: materia + quantità + prezzo unitario opzionale.
-- original_quantity: quantità chiesta dallo staff se l'admin l'ha cambiata;
-- removed: riga annullata dall'admin; added_by_admin: riga aggiunta dall'admin.
CREATE TABLE IF NOT EXISTS supply_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_order_id INTEGER NOT NULL,
  raw_material_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL,
  original_quantity REAL,
  removed INTEGER DEFAULT 0,
  added_by_admin INTEGER DEFAULT 0,
  FOREIGN KEY (supply_order_id) REFERENCES supply_orders(id),
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id)
);

CREATE INDEX IF NOT EXISTS idx_supply_orders_user ON supply_orders(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_supply_orders_status ON supply_orders(status);
CREATE INDEX IF NOT EXISTS idx_supply_order_items_order ON supply_order_items(supply_order_id);
CREATE INDEX IF NOT EXISTS idx_supply_order_items_material ON supply_order_items(raw_material_id);

-- Anagrafica fornitori (numero WhatsApp per l'invio ordini con messaggio precompilato)
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  whatsapp TEXT DEFAULT '',
  active INTEGER DEFAULT 1
);

-- ============================================================
-- SEED: UTENTI STAFF
-- hash = SHA-256("nfarinati-staff:<USERNAME>:<PASSWORD>")
-- ============================================================
INSERT OR IGNORE INTO staff_users (username, password_hash, display_name, role) VALUES
  ('UCCELLO', '8551135fa91cf81e4cccf25dd80a8e3174361cd0eaa3fc732858aba4944ee164', 'Uccello', 'staff'),
  ('GALICI',  'b85df3b605ac375292be1a597f60d61f8ac224bd06adce64731a8f43fc92e35c', 'Galici',  'staff');

-- ============================================================
-- SEED: ANAGRAFICA MATERIE PRIME (nome, reparto, fornitore)
-- ============================================================
INSERT OR IGNORE INTO raw_materials (name, department, supplier) VALUES
('CIPOLLE BIANCHE','Pizzeria','Vincenzo'),
('CIPOLLE ROSSE','Cucina','Vincenzo'),
('POMODORI','Cucina','Vincenzo'),
('ICEBERG','Cucina','Vincenzo'),
('FUNGHI','Pizzeria','Vincenzo'),
('PEPERONI','Cucina','Vincenzo'),
('RADICCHIO','Pizzeria','Vincenzo'),
('AGLIO','Cucina','Vincenzo'),
('BASILICO','Pizzeria','Vincenzo'),
('POMODORINI','Pizzeria','Vincenzo'),
('RUCOLA','Pizzeria','Vincenzo'),
('AVOCADO','Cucina','Vincenzo'),
('CAROTE','Cucina','Vincenzo'),
('LIMONI','Cucina','Vincenzo'),
('ZUCCHINE','Pizzeria','Vincenzo'),
('MELENZANE','Pizzeria','Vincenzo'),
('PERE','Pizzeria','Vincenzo'),
('ZUCCA ROSSA','Pizzeria','Vincenzo'),
('ZUCCA','Pizzeria','Vincenzo'),
('PATATE VECCHIE','Cucina','Giovanni'),
('MOZZARELLA','Pizzeria','Galbani'),
('BUFALA','Pizzeria','Galbani'),
('SOTTILETTE','Cucina','Di Leo'),
('CHEDDAR','Pizzeria','Di Leo'),
('CHEDDAR FETTE','Cucina','Oikos'),
('WURSTEL PICCOLI','Pizzeria','Di Leo'),
('WURSTEL GRANDI','Cucina','Di Leo'),
('GORGONZOLA','Pizzeria','Di Leo'),
('PROSCIUTTO COTTO','Pizzeria','Di Leo'),
('PROSCIUTTO CRUDO','Pizzeria','Di Leo'),
('SPECK','Pizzeria','Di Leo'),
('BACON PEZZI','Pizzeria','Blu Ocean'),
('BACON CUCINA','Cucina','Oikos'),
('SALAMINO PICCANTE','Pizzeria','Di Leo'),
('MORTADELLA','Pizzeria','Di Leo'),
('PECORINO ROMANO','Pizzeria','Cirulle'),
('GRANA PADANA','Pizzeria','Di Leo'),
('RICOTTA','Pizzeria','Cirulle'),
('EMMENTHAL','Cucina','Cirulle'),
('PROVOLETTA','Pizzeria','Cirulle'),
('BRESAOLA','Pizzeria','Cirulle'),
('COTTO ALLE ERBE','Pizzeria','Cirulle'),
('BURRATA','Pizzeria','Galbani'),
('MOZZARELLINE','Pizzeria','Di Leo'),
('COTTO CARTOCCI','Cucina','Oikos'),
('ACCIUGHE','Pizzeria','Sardina'),
('ORIGANO','Pizzeria','Pitarresi'),
('NO LATTOSIO','Pizzeria','Di Leo'),
('PROVOLA AGEROLA','Pizzeria','Di Leo'),
('GALATI PANETTI','Pizzeria','Galbani'),
('OLIO FRIGGITRICE','Cucina','Oikos'),
('OLIO OLIVA','Pizzeria','Di Leo'),
('OLIO SEMI','Pizzeria','Di Leo'),
('FARINA NAPOLI','Pizzeria','La Fenice'),
('FARINA TIPO 1','Pizzeria','La Fenice'),
('RIMACINATO','Pizzeria','La Fenice'),
('LIEVITO','Pizzeria','La Fenice'),
('OLIVE NERE','Pizzeria','Fontana'),
('OLIVE VERDI','Pizzeria','Di Leo'),
('CARCIOFI','Pizzeria','Oikos'),
('TONNO','Pizzeria','Ristoris'),
('PORCINI','Pizzeria','Ristoris'),
('SESAMO','Pizzeria','La Fenice'),
('ZUCCHERO','Pizzeria','Cirulle'),
('BURRO','Pizzeria','Galbani'),
('BURRO','Cucina','Galbani'),
('PESTO DI BASILICO','Pizzeria','Ristoris'),
('PANINI LUNGHI','Cucina','Buttitta'),
('HAMBURGER','Cucina','Mr Bun'),
('MINI BURGER','Cucina','Buttitta'),
('TORTILLAS','Cucina','Blu Ocean'),
('ACETO BIANCO','Cucina','Cirulle'),
('SALE','Pizzeria','Cirulle'),
('UOVA','Cucina','Amadori'),
('MOLLICA','Cucina','Buttitta'),
('PANKO','Cucina','Blu Ocean'),
('SEMOLA DI RISO','Pizzeria','La Fenice'),
('TOVAGLIOLI TAVOLI','Pizzeria','Scianna'),
('BICCHIERI CC 200','Pizzeria','Scianna'),
('KRISTAL 300','Pizzeria','Scianna'),
('TOVAGLIOLI','Pizzeria','Scianna'),
('VASCHETTE 1 PORZIONE','Cucina','Scianna'),
('VASCHETTE 2 PORZIONI','Cucina','Scianna'),
('BOBINA ALLUMINIO','Cucina','Scianna'),
('PELLICOLA TRASPARENTE','Cucina','Scianna'),
('TOVAGLIETTE','Pizzeria','Scianna'),
('FOGLIA A STRAPPO','Pizzeria','Scianna'),
('ROTOLONE','Cucina','Scianna'),
('SCATOLE 45X45','Pizzeria','Graziano'),
('SCATOLE 29X29','Pizzeria','Graziano'),
('BOX BURGER','Cucina','Scianna'),
('VASSOI PANINI','Cucina','Scianna'),
('BICCHIERINI CC 80','Pizzeria','Scianna'),
('TAPPI CC 80','Pizzeria','Scianna'),
('PIATTI PLASTICA','Pizzeria','Scianna'),
('BUSTE CARTA','Cucina','Scianna'),
('CARTA OLEATA','Pizzeria','Scianna'),
('CARTA DA FORNO','Cucina','Scianna'),
('SACCHETTI TRASPARENTI','Cucina','Scianna'),
('SACCHETTI CARTA','Cucina','Scianna'),
('STUZZICA BURGER','Cucina','Scianna'),
('TOVAGLIE VERDI','Pizzeria','Scianna'),
('COCA COLA LATTINA','Pizzeria','Cirulle'),
('COCA COLA ZERO','Pizzeria','Cirulle'),
('SPRITE LATTINA','Pizzeria','Cirulle'),
('FANTA LATTINA','Pizzeria','Cirulle'),
('CHINOTTO','Pizzeria','Cirulle'),
('THE ALLA PESCA','Pizzeria','Cirulle'),
('THE AL LIMONE','Pizzeria','Cirulle'),
('COCA COLA BOTTIGLIA','Pizzeria','Cirulle'),
('SPRITE BOTTIGLIA','Pizzeria','Cirulle'),
('CERES','Pizzeria','Cirulle'),
('HEINEKEN 33','Pizzeria','Cirulle'),
('ICHNUSA','Pizzeria','Cirulle'),
('MORETTI 66','Pizzeria','Cirulle'),
('ACQUA PICCOLA','Pizzeria','Cirulle'),
('BECKS','Pizzeria','Cirulle'),
('ACQUA GRANDE','Pizzeria','Cirulle'),
('HEINEKEN 66','Pizzeria','Cirulle'),
('ACQUA FRIZZANTE','Pizzeria','Cirulle'),
('RANCH','Pizzeria','Blu Ocean'),
('SENAPE','Cucina','Migel'),
('MOSTARDA','Cucina','Migel'),
('MAIONESE 5KG','Cucina','Oikos'),
('KETCHUP 5KG','Cucina','Oikos'),
('BBQ','Cucina','Oikos'),
('BLUE CHEESE','Pizzeria','Blu Ocean'),
('YOGURT','Cucina','Oikos'),
('ACETO GLASSA','Pizzeria','Oikos'),
('PANNA DA CUCINA','Pizzeria','Di Leo'),
('MAIONESE BUSTINE','Cucina','Oikos'),
('KETCHUP BUSTINE','Cucina','Oikos'),
('BBQ BUSTINE','Cucina','Oikos'),
('SALSA BUFFALO','Pizzeria','Blu Ocean'),
('MANGO HABANERO','Pizzeria','Oikos'),
('CESAR DRESSING','Cucina','Oikos'),
('WESTERN BURGER SAUCE','Cucina','Oikos'),
('ALABAMA PEPPERY','Cucina','Oikos'),
('CHIPOTLE MAYO','Cucina','Oikos'),
('CARTA IGIENICA','Cucina','Scianna'),
('SGRASSATORE GRIGLIA','Cucina','Saponando'),
('SGRASSATORE','Cucina','Saponando'),
('CANDEGGINA','Cucina','Saponando'),
('FABULOSO','Cucina','Saponando'),
('SVELTO PIATTI','Cucina','Saponando'),
('PEZZE','Cucina','Saponando'),
('SPUGNE ACCIAIO','Cucina','Saponando'),
('PISTACCHIO INTERO','Pizzeria','Pitarresi'),
('GRANELLA PISTACCHIO','Pizzeria','Pitarresi'),
('MANDORLE','Pizzeria','Pitarresi'),
('NOCCIOLE INTERE','Pizzeria','Pitarresi'),
('GRANELLA NOCCIOLE','Pizzeria','Pitarresi'),
('NOCI','Pizzeria','Pitarresi'),
('PAPRIKA','Cucina','Pitarresi'),
('PEPE NERO','Cucina','Pitarresi'),
('SMARTIES','Pizzeria','Pitarresi'),
('ZUCCHERO A VELO','Pizzeria','Pitarresi'),
('PEPERONCINO','Cucina','Pitarresi'),
('NUTELLA','Pizzeria','Cirulle'),
('OREO','Pizzeria','Cirulle'),
('CREMA PISTACCHIO','Pizzeria','Cirulle'),
('CREMA BIANCA','Pizzeria','Cirulle'),
('TOPPING CARAMELLO','Pizzeria','Cirulle'),
('PATATINE PIZZA','Pizzeria','Migel'),
('PATATE CUCINA 9/9','Cucina','Blu Ocean'),
('PATATE SEASON','Cucina','Blu Ocean'),
('PATATE DOLCI','Cucina','Blu Ocean'),
('CURLY FRIES','Cucina','Blu Ocean'),
('JALAPENOS','Cucina','Blu Ocean'),
('CHICK FINGERS','Cucina','Blu Ocean'),
('MINI CHICKEN RING','Cucina','Amadori'),
('NUGGETS','Cucina','Blu Ocean'),
('WINGS','Cucina','Blu Ocean'),
('PANELLE','Cucina','Palumbo'),
('CROCCHÈ','Cucina','Palumbo'),
('SPINACI','Pizzeria','Blu Ocean'),
('ONION RINGS','Cucina','Blu Ocean'),
('POTATO BUN SMASH','Cucina','Blu Ocean'),
('GHIACCIO','Pizzeria','Migel'),
('SALSICCIA','Pizzeria','Mineo'),
('CARNE PHILLY','Cucina','Mineo'),
('TRITATO','Cucina','Mineo'),
('POLLO','Cucina','Mineo'),
('TORTILLAS DA 30','Cucina','Blu Ocean'),
('FRY N DIP CONCAVE','Cucina','Blu Ocean');

-- ============================================================
-- SEED: FORNITORI (dai fornitori presenti in anagrafica; il numero
-- WhatsApp si inserisce dalla dashboard admin, tab Fornitori)
-- ============================================================
INSERT OR IGNORE INTO suppliers (name)
SELECT DISTINCT supplier FROM raw_materials WHERE supplier != '';
