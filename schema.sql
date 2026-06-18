-- ============================================================
-- NFARINATI MODERN PIZZA - Schema D1 + Seed completo
-- Eseguire: wrangler d1 execute nfarinati-db --file=schema.sql
-- ============================================================

-- Categorie menu
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🍴',
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

-- Prodotti menu (prezzi e opzioni in JSON per compatibilità con il frontend)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  image_url TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  mandatory_choice INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  prezzi_json TEXT DEFAULT '[]',
  options_json TEXT DEFAULT '{}',
  multi_options_json TEXT DEFAULT '{}',
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Ordini
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  pickup_time TEXT NOT NULL,
  order_type TEXT DEFAULT 'takeaway',
  delivery_address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount_rate REAL DEFAULT 0,
  promo_code TEXT DEFAULT '',
  promo_discount REAL DEFAULT 0,
  delivery_fee REAL DEFAULT 0,
  total REAL NOT NULL,
  status TEXT DEFAULT 'nuovo',
  payment_method TEXT DEFAULT 'contanti',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Clienti (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  order_count INTEGER DEFAULT 1,
  total_spent REAL DEFAULT 0,
  first_order_at TEXT,
  last_order_at TEXT
);

-- Promo Code
CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('percentage','fixed')),
  value REAL NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Impostazioni chiave-valore
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================
-- SEED: CATEGORIE
-- ============================================================
INSERT OR IGNORE INTO categories (id, name, icon, sort_order) VALUES
  ('appetizers',               'Appetizers',              '🍟', 1),
  ('american-hamburger',       'American Hamburger',      '🍔', 2),
  ('pizze',                    'Pizze',                   '🍕', 3),
  ('pizze-americane',          'Pizze Americane',         '🗽', 4),
  ('pizze-gourmet',            'Pizze Gourmet',           '⭐', 5),
  ('pizze-senza-glutine',      'Pizze Senza Glutine',     '🌾', 6),
  ('calzoni',                  'Calzoni',                 '🥙', 7),
  ('insalate',                 'Insalate',                '🥗', 8),
  ('mini-burgers',             'Mini burgers',            '🍔', 9),
  ('wrap',                     'Wrap',                    '🌯', 10),
  ('panini-americani',         'Panini Americani',        '🥖', 11),
  ('philly-style-cheesesteaks','Philly Style Cheesesteaks','🥩', 12),
  ('panini-piastrati',         'Panini Piastrati',        '🥪', 13),
  ('specialita',               'Specialità',              '🌟', 14),
  ('pizze-dessert',            'Pizze Dessert',           '🍫', 15),
  ('bevande',                  'Bevande',                 '🥤', 16),
  ('birre',                    'Birre',                   '🍺', 17);

-- ============================================================
-- SEED: PRODOTTI
-- Abbreviazioni usate nei commenti:
--   PATATINE = opzioni patatine standard (vedi prima riga Appetizers)
-- ============================================================

-- patatineOptions JSON (riutilizzato in molti prodotti)
-- [{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]

-- APPETIZERS
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('appetizers','Mega mozza-stick','Stick di mozzarella panata lunghezza circa 20 cm',3.00,'[{"prezzo":3.0}]','{}','{"Salse":[{"valore":"Salsa rosa","supplemento":0.0},{"valore":"Salsa BBQ","supplemento":0.0},{"valore":"Honey mustard","supplemento":0.0},{"valore":"Ketchup","supplemento":0.0},{"valore":"BBQ mayo","supplemento":0.0},{"valore":"Ranch dressing","supplemento":0.0},{"valore":"Mango habanero sauce","supplemento":0.0},{"valore":"Mayonese","supplemento":0.0},{"valore":"Senza salse","supplemento":0.0}]}',1),
('appetizers','Chicken Nuggets','bocconcini di pollo (8 pezzi)',6.00,'[{"prezzo":6.0,"variante":"8 pezzi"}]','{}','{}',2),
('appetizers','Jalapeños Red Hot','jalapeños ripieni al formaggio, panati e fritti (6 pezzi)',6.50,'[{"prezzo":6.5,"variante":"6 pezzi"}]','{}','{}',3),
('appetizers','Pizza Fries','patate curly aromatizzate alla cipolla + salsa di pomodoro, mozzarella fiordilatte, salamino piccante',6.00,'[{"prezzo":6.0}]','{}','{}',4),
('appetizers','Crazy Fries','patatine fritte, wurstel fritti, bacon, salsa rosa Ranch, mozzarella, sottilette e cheddar',7.00,'[{"prezzo":7.0}]','{}','{}',5),
('appetizers','Mozzarella Sticks','listelle di mozzarella home made, panate e fritte (6 pezzi)',5.00,'[{"prezzo":5.0,"variante":"6 pezzi"}]','{}','{}',6),
('appetizers','Seasoned Fries (spicchi spicy)','spicchi di patate con buccia e rivestimento speziato',3.50,'[{"prezzo":3.5,"variante":"1 porzione"},{"prezzo":4.5,"variante":"2 porzioni"}]','{}','{}',7),
('appetizers','Cheese Fries','patatine fritte con cheddar fuso',4.50,'[{"prezzo":4.5}]','{}','{}',8),
('appetizers','French Fries','patatine fritte',2.00,'[{"prezzo":2.0,"variante":"1 porzione"},{"prezzo":3.0,"variante":"2 porzioni"}]','{}','{}',9),
('appetizers','Combo Platter','chicken wings 2 pz, mozzarella sticks 2 pz, nuggets 2 pz, onion rings 2 pz e patatine fritte',7.00,'[{"prezzo":7.0}]','{}','{}',10),
('appetizers','Onion Rings','anelli di cipolla fritti home made',4.00,'[{"prezzo":4.0}]','{}','{}',11),
('appetizers','Chicken Wings','alette di pollo fritte (6 pezzi)',6.00,'[{"prezzo":6.0,"variante":"6 pezzi"}]','{}','{}',12),
('appetizers','Patate Surecrisp Fry''n Dip Con Buccia','bastoncini di patate concavi con buccia e rivestimento croccante',4.00,'[{"prezzo":4.0}]','{}','{}',13),
('appetizers','Chicken Fingers','straccetti di pollo croccanti (8 pezzi)',6.50,'[{"prezzo":6.5,"variante":"8 pezzi"}]','{}','{}',14),
('appetizers','Sweet Potato Fries','patate dolci fritte con rivestimento croccante',5.50,'[{"prezzo":5.5}]','{}','{}',15),
('appetizers','Wurstel alla Griglia','wurstel grigliati con olio, limone, sale, pepe e origano',5.00,'[{"prezzo":5.0}]','{}','{}',16),
('appetizers','Crostini di Tuma Fritta','stick di tuma panata e fritta (6 pezzi)',6.50,'[{"prezzo":6.5,"variante":"6 pezzi"}]','{}','{}',17),
('appetizers','Misto Caldo','panelle, crocchette e patatine',6.00,'[{"prezzo":6.0}]','{}','{}',18),
('appetizers','Curly Fries','patate a spirale con aromi speciali',5.00,'[{"prezzo":5.0}]','{}','{}',19),
('appetizers','Franky Fries','patatine fritte, bacon, sottilette, mozzarella, ranch e cheddar',6.00,'[{"prezzo":6.0}]','{}','{}',20);

-- AMERICAN HAMBURGER
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('american-hamburger','Nuovo smash burger','Doppio smashed burger, cheddar filante, bacon croccante, salsa burger, avvolto in un potato bun originale Martins',6.50,'[{"prezzo":6.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',1),
('american-hamburger','Quad smashed burger','Quadruplo smashed burger alla perfezione, quadruplo cheddar, triplo bacon, doppia salsa burger, avvolto in un potato bun originale Martins',14.50,'[{"prezzo":14.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',2),
('american-hamburger','Drive in Burger','burger di vitello, cheddar, salamino piccante, bacon, lattuga, cipolla rossa, pomodoro, Peppery White BBQ',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',3),
('american-hamburger','Pistacchino Burger','Hamburger di vitello, mortadella, burrata, radicchio, pesto di pistacchio, servito con patatine al pistacchio',13.00,'[{"prezzo":13.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',4),
('american-hamburger','Country Burger','hamburger di vitello, emmental, carote, chips di zucchine, chipotle mayo, rucola',10.50,'[{"prezzo":10.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',5),
('american-hamburger','Greta Burger','hamburger di vitello, avocado, funghi, cipolle, cheddar, rucola, chipotle mayo',10.00,'[{"prezzo":10.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',6),
('american-hamburger','Fat Bastard Burger','doppio burger, sottiletta, onion rings, bacon, cheddar, barbecue maionese, lattuga',13.00,'[{"prezzo":13.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',7),
('american-hamburger','GB Style Burger','Burger, emmental, salsa rosa, pomodorini, lattuga a filetti e cipolle',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',8),
('american-hamburger','The Lo Galbo''s Burger','burger, cheddar, salsa rosa, lattuga a filetti e pomodoro a fette',8.00,'[{"prezzo":8.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',9),
('american-hamburger','Jersey Boy Burger','burger, peperoni, cipolla, funghi, emmental, lattuga a filetti, pomodoro',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',10),
('american-hamburger','Sinaloa Mexico Burger','burger, bruschetta, salsa buffalo, salsiccia piccante, avocado, lattuga a filetti e cheddar',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',11),
('american-hamburger','Good Fellas Burger','burger, mozzarella, radicchio, spinaci, bacon, funghi, chipotle mayo',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',12),
('american-hamburger','N''farinati Original Burger','burger di vitello, salsa chipotle, avocado, bacon, funghi, onion rings, rucola, mozzarella filante',10.00,'[{"prezzo":10.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',13),
('american-hamburger','New York Times Burger','burger, bacon, onion rings, salsa barbecue, sottilette, lattuga a filetti',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',14);

-- PIZZE
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('pizze','Caprese Agro-Sarnese','pomodoro San Marzano, pecorino stagionato, origano siciliano; in uscita mozzarella di bufala D.O.P., pomodoro secco sott''olio, caviale di pesto di basilico, rucola',12.00,'[{"prezzo":12.0,"variante":"Personale"},{"prezzo":14.0,"variante":"Gluten free"},{"prezzo":14.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',1),
('pizze','Marinara elegante D.O.P.','pomodoro San Marzano D.O.P., origano siciliano, stracciatella di bufala D.O.P., acciughe di aspra, perlage di basilico, olio biologico locale',11.00,'[{"prezzo":11.0,"variante":"Personale"},{"prezzo":13.5,"variante":"Gluten free"},{"prezzo":13.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',2),
('pizze','La Quinta Margherita','salsa di pomodoro giallo, fiordilatte, grana padana, pomodorini confit, pesto di basilico fresco',9.00,'[{"prezzo":9.0,"variante":"Personale"},{"prezzo":18.5,"variante":"Familiare"},{"prezzo":11.5,"variante":"Gluten free"},{"prezzo":11.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',3),
('pizze','Queen Margherita D.O.P.','pomodoro San Marzano D.O.P., pecorino romano stagionato, mozzarella di bufala campana D.O.P., basilico, olio biologico locale',10.50,'[{"prezzo":10.5,"variante":"Personale"},{"prezzo":21.0,"variante":"Familiare"},{"prezzo":13.0,"variante":"Gluten free"},{"prezzo":12.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',4),
('pizze','Margherita 1983','salsa di pomodoro giallo, mozzarella di bufala, pesto di pistacchio, mandorle tostate, basilico',9.00,'[{"prezzo":9.0,"variante":"Personale"},{"prezzo":19.5,"variante":"Familiare"},{"prezzo":11.5,"variante":"Gluten free"},{"prezzo":11.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',5),
('pizze','Margherita 23','pomodoro, provola di Agerola affumicata; in uscita burrata, granella e pesto di nocciole, basilico',10.50,'[{"prezzo":10.5,"variante":"Personale"},{"prezzo":21.5,"variante":"Familiare"},{"prezzo":13.0,"variante":"Gluten free"},{"prezzo":12.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',6),
('pizze','Margherita classica','pomodoro e mozzarella fiordilatte',6.00,'[{"prezzo":6.0,"variante":"Personale"},{"prezzo":12.5,"variante":"Familiare"},{"prezzo":8.0,"variante":"Gluten free"},{"prezzo":8.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',7),
('pizze','Naples','pomodoro, mozzarella e acciughe',6.50,'[{"prezzo":6.5,"variante":"Personale"},{"prezzo":13.0,"variante":"Familiare"},{"prezzo":9.0,"variante":"Gluten free"},{"prezzo":8.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',8),
('pizze','Romana','pomodoro, mozzarella fiordilatte e prosciutto cotto',7.50,'[{"prezzo":7.5,"variante":"Personale"},{"prezzo":15.5,"variante":"Familiare"},{"prezzo":9.5,"variante":"Gluten free"},{"prezzo":9.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',9),
('pizze','Diavola','pomodoro, mozzarella fiordilatte e salamino piccante',7.50,'[{"prezzo":7.5,"variante":"Personale"},{"prezzo":15.5,"variante":"Familiare"},{"prezzo":9.5,"variante":"Gluten free"},{"prezzo":9.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',10),
('pizze','Don Calogero','pomodoro, mozzarella fiordilatte, salamino piccante e salsiccia',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.5,"variante":"Familiare"},{"prezzo":10.0,"variante":"Gluten free"},{"prezzo":10.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',11),
('pizze','4 Gusti','pomodoro, mozzarella fiordilatte, prosciutto cotto, wurstel, funghi, olio extravergine d''oliva',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.0,"variante":"Familiare"},{"prezzo":10.5,"variante":"Gluten free"},{"prezzo":10.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',12),
('pizze','Capricciosa','pomodoro, mozzarella fiordilatte, prosciutto cotto, wurstel, carciofi, funghi, olive, olio extravergine d''oliva',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.0,"variante":"Familiare"},{"prezzo":11.0,"variante":"Gluten free"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',13),
('pizze','Bresa Hola Pizza','mozzarella fiordilatte, bresaola punta d''anca, rucola, scaglie di grana, limone e olio extravergine d''oliva',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":20.0,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',14),
('pizze','Eggplant Parmigiana','pomodoro, mozzarella, melanzane fritte, pecorino romano, ricotta e basilico fresco',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Gluten free"},{"prezzo":10.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',15),
('pizze','Orto Bio','mozzarella fiordilatte, polpa di pomodoro, zucchine, melanzane fritte, ricotta e mandorle',9.00,'[{"prezzo":9.0,"variante":"Personale"},{"prezzo":18.5,"variante":"Familiare"},{"prezzo":11.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',16),
('pizze','San Francesco','pomodoro, mozzarella fiordilatte, prosciutto crudo di Parma, scaglie di grana, rucola e olio extravergine d''oliva',9.00,'[{"prezzo":9.0,"variante":"Personale"},{"prezzo":18.0,"variante":"Familiare"},{"prezzo":11.5,"variante":"Gluten free"},{"prezzo":11.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',17),
('pizze','Parmigiana','pomodoro, mozzarella fiordilatte, melanzane fritte e grana padano',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.0,"variante":"Familiare"},{"prezzo":10.5,"variante":"Gluten free"},{"prezzo":10.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',18),
('pizze','Veggy Pizza','pomodoro, mozzarella fiordilatte, funghi, cipolle, peperoni, olive, melanzane e spinaci',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.0,"variante":"Familiare"},{"prezzo":11.0,"variante":"Gluten free"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',19),
('pizze','Patabom','pomodoro, mozzarella e patatine fritte',7.50,'[{"prezzo":7.5,"variante":"Personale"},{"prezzo":15.5,"variante":"Familiare"},{"prezzo":9.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',20),
('pizze','Bianca','mozzarella fiordilatte',5.50,'[{"prezzo":5.5,"variante":"Personale"},{"prezzo":10.5,"variante":"Familiare"},{"prezzo":8.0,"variante":"Gluten free"},{"prezzo":7.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',21),
('pizze','4 Cheese','mozzarella fiordilatte, provoletta, ricotta, pecorino e gorgonzola',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Gluten free"},{"prezzo":10.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',22),
('pizze','Sfincione Modern Pizza','crema di cipolle caramellate, mozzarella, acciughe, ricotta, tocchetti di tuma fritta, pecorino grattugiato, origano',9.00,'[{"prezzo":9.0,"variante":"Personale"},{"prezzo":18.5,"variante":"Familiare"},{"prezzo":11.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',23),
('pizze','Aspra Mare','pomodoro, mozzarella fiordilatte, tonno in olio d''oliva, cipolle rosse e olive verdi',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Gluten free"},{"prezzo":10.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',24);

-- PIZZE AMERICANE
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('pizze-americane','Cuzin Tano','mozzarella di bufala, alfredo sauce, salsiccia, bacon; all''uscita rucola e prosciutto crudo di Parma',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":20.5,"variante":"Familiare"},{"prezzo":11.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',1),
('pizze-americane','Don Francisco Taco','mozzarella fiordilatte, carne taco piccante, bruschetta, lattuga, cheddar e buffalo sauce',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":20.5,"variante":"Familiare"},{"prezzo":11.58,"variante":"Impasto integrale ai semi misti"}]','{}','{}',2),
('pizze-americane','Mango Habanero Chicken Pizza','mango habanero sauce, pollo fritto, bacon, cipolla rossa a cubetti, mozzarella fiordilatte; in uscita ranch dressing',11.50,'[{"prezzo":11.5,"variante":"Personale"},{"prezzo":24.5,"variante":"Familiare"}]','{}','{}',3),
('pizze-americane','Buffalo Bill Chicken','mozzarella fiordilatte, pollo piccante al buffalo sauce, cheddar e blue cheese',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',4),
('pizze-americane','Grandma NCY Pizza','mozzarella fiordilatte, pomodoro polpa, basilico fresco, pecorino e olio extravergine d''oliva',7.00,'[{"prezzo":7.0,"variante":"Personale"},{"prezzo":15.5,"variante":"Familiare"},{"prezzo":9.5,"variante":"Gluten free"},{"prezzo":9.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',5),
('pizze-americane','BBQ Chicken','mozzarella fiordilatte, pollo al barbecue e cheddar cheese',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',6),
('pizze-americane','Chicken Parm','pomodoro, mozzarella fiordilatte, pollo fritto, pecorino romano e basilico',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',7),
('pizze-americane','Sicilian in New Jersey','mozzarella fiordilatte, salsiccia, spinaci, pomodorini, limone e rucola',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":11.0,"variante":"Gluten free"}]','{}','{}',8),
('pizze-americane','Chicken & Pesto','mozzarella fiordilatte, pollo fritto, pomodoro, bruschetta e pesto di basilico',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',9),
('pizze-americane','Only Meat Lover','pomodoro, mozzarella fiordilatte, salsiccia, prosciutto cotto DOC, salsiccia piccante, bacon e wurstel',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":20.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',10),
('pizze-americane','Chicken Rancho','mozzarella fiordilatte, pollo fritto, ranch dressing, bacon e cheddar cheese',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":20.5,"variante":"Familiare"},{"prezzo":11.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',11),
('pizze-americane','Heart Attack','mozzarella, salsa segreta al barbecue, patatine fritte, pollo fritto, anelli di cipolla, mozzarella sticks, bacon e ranch',11.50,'[{"prezzo":11.5,"variante":"Personale"},{"prezzo":23.0,"variante":"Familiare"},{"prezzo":13.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',12),
('pizze-americane','Pizza Mania Original','pomodoro, mozzarella fiordilatte, funghi, cipolle, peperoni, salsiccia, prosciutto cotto DOC e salsiccia piccante',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":20.5,"variante":"Familiare"},{"prezzo":11.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',13),
('pizze-americane','Potato & Onion Deluxe','mozzarella, patate a spicchi fritte, cipolle, salsiccia e salsa buffalo ranch',9.00,'[{"prezzo":9.0,"variante":"Personale"},{"prezzo":18.5,"variante":"Familiare"},{"prezzo":11.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',14),
('pizze-americane','Greenfield','misto 4 formaggi (mozzarella, provoletta, gorgonzola, pecorino), funghi, bacon; all''uscita pesto di pistacchio e granella di pistacchi',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":20.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',15),
('pizze-americane','Stuffed Meat Pizza Familiare Ripiena','mozzarella fiordilatte, prosciutto cotto, salsiccia, salamino piccante, bacon (ripieno); sopra salsa di pomodoro, mozzarella, würstel',25.00,'[{"prezzo":25.0}]','{}','{}',16),
('pizze-americane','Chicken Caesar Crust','mozzarella fiordilatte, pollo alla griglia, lattuga romana, pecorino e caesar dressing',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":11.0,"variante":"Gluten free"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',17),
('pizze-americane','Tropical Hawaiian','mozzarella fiordilatte, ricotta, bacon e ananas a cubetti',7.50,'[{"prezzo":7.5,"variante":"Personale"},{"prezzo":15.5,"variante":"Familiare"},{"prezzo":9.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',18),
('pizze-americane','Twenty Miles','mozzarella fiordilatte, alfredo sauce, pollo fritto, bacon e cheddar',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',19),
('pizze-americane','Sweet Alabama','pollo fritto, bacon, mozzarella, cheddar e honey mustard dressing',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":19.0,"variante":"Familiare"},{"prezzo":11.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',20),
('pizze-americane','Las Vegas Nevada','mozzarella fiordilatte, alfredo sauce, bacon, patate e cheddar',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',21),
('pizze-americane','Brooklyn Original','mozzarella fiordilatte, provoletta, pomodoro, origano e pecorino',7.00,'[{"prezzo":7.0,"variante":"Personale"},{"prezzo":14.5,"variante":"Familiare"},{"prezzo":9.5,"variante":"Gluten free"},{"prezzo":9.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',22),
('pizze-americane','French Fries Pie','mozzarella fiordilatte, salsa rosa, patatine fritte, bacon e cheddar',8.50,'[{"prezzo":8.5,"variante":"Personale"},{"prezzo":17.5,"variante":"Familiare"},{"prezzo":10.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',23),
('pizze-americane','Cheese Steak and Bake','mozzarella fiordilatte, bistecca sfilettata cheesesteak con cipolle, funghi, peperoni e cheddar',11.00,'[{"prezzo":11.0,"variante":"Personale"},{"prezzo":23.5,"variante":"Familiare"},{"prezzo":13.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',24),
('pizze-americane','Chips Pizza','mozzarella fiordilatte, patatine chips classiche, salsa rosa, salsa ranch, cheddar e pollo fritto',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":18.5,"variante":"Familiare"},{"prezzo":11.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',25);

-- PIZZE GOURMET
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('pizze-gourmet','Bronx','mozzarella di bufala, cipolle; all''uscita rucola, grana, prosciutto cotto all''erbette aromatiche e mandorle tostate',10.50,'[{"prezzo":10.5,"variante":"Personale"},{"prezzo":21.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',1),
('pizze-gourmet','Orton Zola','mozzarella fiordilatte, fonduta di gorgonzola, zucchine, melanzane, mandorle e pesto di basilico',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":20.0,"variante":"Familiare"},{"prezzo":11.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',2),
('pizze-gourmet','La Maria','polpa di pomodoro giallo; mix formaggi (provola, gorgonzola, fiordilatte) in uscita; pomodorini, pesto di pistacchio, grana e prosciutto crudo di Parma 18 mesi',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":21.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',3),
('pizze-gourmet','October Fest Pizza','crema di zucca, mozzarella di bufala, chips di zucchine, speck; burrata, rucola, mandorle tostate e crema di cipolle caramellate',12.00,'[{"prezzo":12.0,"variante":"Personale"},{"prezzo":25.5,"variante":"Familiare"},{"prezzo":14.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',4),
('pizze-gourmet','Atlantic City Pizza','polpa di pomodoro giallo, provola di Agerola; in uscita pecorino stagionato, mandorle tostate, pomodoro secco, acciughe, ciliegino di fiordilatte, basilico, filetti di peperoncino',12.00,'[{"prezzo":12.0}]','{}','{}',5),
('pizze-gourmet','Malcolm Ave','crema di zucca, mozzarella di bufala DOP, bacon, pistacchio e basilico',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":21.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',6),
('pizze-gourmet','Focarcina','pomodoro, mozzarella di bufala DOP, funghi porcini; all''uscita prosciutto crudo di Parma e rucola',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":21.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',7),
('pizze-gourmet','Raffinata','mozzarella di bufala, funghi, ciliegino, rucola, prosciutto crudo, glassa balsamica, pecorino romano e olio evo',11.00,'[{"prezzo":11.0,"variante":"Personale"},{"prezzo":22.5,"variante":"Familiare"},{"prezzo":13.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',8),
('pizze-gourmet','Romana Luxury','salsa di pomodoro giallo, provola di Agerola; in uscita prosciutto cotto aromatizzato, pesto+granella di nocciole, sesamo nero, fiocchi di pomodoro, filetti di peperoncino, burrata, basilico',13.50,'[{"prezzo":13.5,"variante":"Personale"},{"prezzo":15.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',9),
('pizze-gourmet','Saint Thomas','mozzarella di bufala DOP, cipolle, gorgonzola; all''uscita mortadella, mandorle tostate, granella+pesto di pistacchio, miele',11.50,'[{"prezzo":11.5,"variante":"Personale"},{"prezzo":24.5,"variante":"Familiare"},{"prezzo":13.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',10),
('pizze-gourmet','Pumpkin Pizza','crema di zucca rossa, datterino rosso, speck e rucola',9.00,'[{"prezzo":9.0,"variante":"Personale"},{"prezzo":19.5,"variante":"Familiare"},{"prezzo":11.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',11),
('pizze-gourmet','N''farinati Originale','mozzarella fiordilatte, salsiccia, bacon, cipolle, rucola e buffalo ranch piccante',9.50,'[{"prezzo":9.5,"variante":"Personale"},{"prezzo":20.0,"variante":"Familiare"},{"prezzo":12.0,"variante":"Gluten free"},{"prezzo":11.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',12),
('pizze-gourmet','Guancia-Tella','Salsa di pomodoro San Marzano dell''agro Sarnese Nocerino D.O.P., provola di Agerola affumicata. In uscita: guanciale croccante, stracciatella di bufala D.O.P., perlage di basilico, grana padano',12.50,'[{"prezzo":12.5,"variante":"Personale"},{"prezzo":14.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',13),
('pizze-gourmet','Serenata','mozzarella fiordilatte, fonduta di gorgonzola, pere, prosciutto crudo, noci, rucola e glassa balsamica',10.50,'[{"prezzo":10.5,"variante":"Personale"},{"prezzo":21.5,"variante":"Familiare"},{"prezzo":13.0,"variante":"Gluten free"},{"prezzo":12.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',14),
('pizze-gourmet','South Beach','mozzarella di bufala DOP, crema di cipolle caramellate; in uscita rucola, cotto alle erbette, pomodoro secco, ciliegine di mozzarella, burrata, pesto e granella di pistacchio',12.00,'[{"prezzo":12.0,"variante":"Personale"},{"prezzo":25.5,"variante":"Familiare"},{"prezzo":14.5,"variante":"Gluten free"},{"prezzo":14.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',15),
('pizze-gourmet','Sole Giallo','polpa di pomodoro giallo, mozzarella di bufala; all''uscita rucola e prosciutto cotto alle erbette',10.50,'[{"prezzo":10.5,"variante":"Personale"},{"prezzo":20.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Impasto integrale ai semi misti"}]','{}','{}',16),
('pizze-gourmet','Porcini Mushroom','mozzarella di bufala, crema di porcini, radicchio e speck',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":21.0,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',17),
('pizze-gourmet','Wall Street Pizza','salsa di datterino giallo; in uscita mozzarella di bufala DOP, speck, chips di zucchine croccanti, noci, miele',11.00,'[{"prezzo":11.0,"variante":"Personale"},{"prezzo":23.5,"variante":"Familiare"},{"prezzo":13.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',18),
('pizze-gourmet','Murtade''','mozzarella di bufala, crema di ricotta e pistacchio in cottura; in uscita mortadella, granella di pistacchio, rucola, pesto di pistacchio',10.00,'[{"prezzo":10.0,"variante":"Personale"},{"prezzo":21.5,"variante":"Familiare"},{"prezzo":12.5,"variante":"Gluten free"},{"prezzo":12.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',19),
('pizze-gourmet','Lady Brown Pizza','provola di Agerola affumicata; in uscita radicchio, mortadella, pesto+granella di nocciola, pomodoro secco in olio, ciliegino di mozzarella, basilico',12.00,'[{"prezzo":12.0,"variante":"Personale"},{"prezzo":25.5,"variante":"Familiare"},{"prezzo":14.5,"variante":"Gluten free"},{"prezzo":14.0,"variante":"Impasto integrale ai semi misti"}]','{}','{}',20);

-- PIZZE SENZA GLUTINE
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('pizze-senza-glutine','Naples SG','pomodoro, mozzarella e acciughe',9.00,'[{"prezzo":9.0}]','{}','{}',1),
('pizze-senza-glutine','Sicilian in New Jersey SG','mozzarella fiordilatte, salsiccia, spinaci, pomodorini, limone e rucola',11.00,'[{"prezzo":11.0}]','{}','{}',2),
('pizze-senza-glutine','Aspra Mare SG','pomodoro, mozzarella fiordilatte, tonno in olio d''oliva, cipolle rosse e olive verdi',10.50,'[{"prezzo":10.5}]','{}','{}',3),
('pizze-senza-glutine','La Maria SG','polpa di pomodoro giallo; mix formaggi (provola, gorgonzola, fiordilatte) in uscita; pomodorini, pesto di pistacchio, grana e prosciutto crudo di Parma 18 mesi',12.50,'[{"prezzo":12.5}]','{}','{}',4),
('pizze-senza-glutine','San Francesco SG','pomodoro, mozzarella fiordilatte, prosciutto crudo di Parma, scaglie di grana, rucola e olio extravergine d''oliva',11.50,'[{"prezzo":11.5}]','{}','{}',5),
('pizze-senza-glutine','Parmigiana SG','pomodoro, mozzarella fiordilatte, melanzane fritte e grana padano',10.50,'[{"prezzo":10.5}]','{}','{}',6),
('pizze-senza-glutine','Brooklyn Original SG','mozzarella fiordilatte, provoletta, pomodoro, origano e pecorino',9.50,'[{"prezzo":9.5}]','{}','{}',7),
('pizze-senza-glutine','Serenata SG','mozzarella fiordilatte, fonduta di gorgonzola, pere, prosciutto crudo, noci, rucola e glassa balsamica',12.50,'[{"prezzo":12.5}]','{}','{}',8),
('pizze-senza-glutine','Veggy Pizza SG','pomodoro, mozzarella fiordilatte, funghi, cipolle, peperoni, olive, melanzane e spinaci',11.00,'[{"prezzo":11.0}]','{}','{}',9),
('pizze-senza-glutine','Murtade'' SG','mozzarella di bufala, crema di ricotta e pistacchio in cottura; in uscita mortadella, granella di pistacchio, rucola, pesto di pistacchio',12.50,'[{"prezzo":12.5}]','{}','{}',10),
('pizze-senza-glutine','4 Gusti SG','pomodoro, mozzarella fiordilatte, prosciutto cotto, wurstel, funghi, olio extravergine d''oliva',10.50,'[{"prezzo":10.5}]','{}','{}',11),
('pizze-senza-glutine','Diavola SG','pomodoro, mozzarella fiordilatte e salamino piccante',9.50,'[{"prezzo":9.5}]','{}','{}',12),
('pizze-senza-glutine','Only Meat Lover SG','pomodoro, mozzarella fiordilatte, salsiccia, prosciutto cotto DOC, salsiccia piccante, bacon e wurstel',12.50,'[{"prezzo":12.5}]','{}','{}',13),
('pizze-senza-glutine','Eggplant Parmigiana SG','pomodoro, mozzarella, melanzane fritte, pecorino romano, ricotta e basilico fresco',10.50,'[{"prezzo":10.5}]','{}','{}',14),
('pizze-senza-glutine','Romana SG','pomodoro, mozzarella fiordilatte e prosciutto cotto',9.50,'[{"prezzo":9.5}]','{}','{}',15),
('pizze-senza-glutine','Capricciosa SG','pomodoro, mozzarella fiordilatte, prosciutto cotto, wurstel, carciofi, funghi, olive, olio extravergine d''oliva',11.00,'[{"prezzo":11.0}]','{}','{}',16),
('pizze-senza-glutine','Malcolm Ave SG','crema di zucca, mozzarella di bufala DOP, bacon, pistacchio e basilico',12.50,'[{"prezzo":12.5}]','{}','{}',17),
('pizze-senza-glutine','Bianca SG','mozzarella fiordilatte',8.00,'[{"prezzo":8.0}]','{}','{}',18),
('pizze-senza-glutine','Greenfield SG','misto 4 formaggi (mozzarella, provoletta, gorgonzola, pecorino), funghi, bacon; all''uscita pesto di pistacchio, granella di pistacchi',12.50,'[{"prezzo":12.5}]','{}','{}',19),
('pizze-senza-glutine','4 Cheese SG','mozzarella fiordilatte, provoletta, ricotta, pecorino e gorgonzola',10.50,'[{"prezzo":10.5}]','{}','{}',20),
('pizze-senza-glutine','Don Calogero SG','pomodoro, mozzarella fiordilatte, salamino piccante e salsiccia',10.00,'[{"prezzo":10.0}]','{}','{}',21),
('pizze-senza-glutine','South Beach SG','mozzarella di bufala DOP, crema di cipolle caramellate; in uscita rucola, cotto alle erbette, pomodoro secco, ciliegine di mozzarella, burrata, pesto e granella di pistacchio',14.50,'[{"prezzo":14.5}]','{}','{}',22),
('pizze-senza-glutine','Chicken Caesar Crust SG','mozzarella fiordilatte, pollo alla griglia, lattuga romana, pecorino e caesar dressing',11.00,'[{"prezzo":11.0}]','{}','{}',23),
('pizze-senza-glutine','Bresa Hola Pizza SG','mozzarella fiordilatte, bresaola punta d''anca, rucola, scaglie di grana, limone e olio extravergine d''oliva',12.50,'[{"prezzo":12.5}]','{}','{}',24),
('pizze-senza-glutine','Grandma NCY Pizza SG','mozzarella fiordilatte, pomodoro polpa, basilico fresco, pecorino e olio extravergine d''oliva',9.50,'[{"prezzo":9.5}]','{}','{}',25),
('pizze-senza-glutine','Margherita classica SG','pomodoro e mozzarella fiordilatte',8.00,'[{"prezzo":8.0}]','{}','{}',26);

-- CALZONI
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('calzoni','Ham & Cheese Calzone','mozzarella fiordilatte e prosciutto cotto DOC',7.50,'[{"prezzo":7.5}]','{}','{}',1),
('calzoni','BBQ Chicken Calzone','mozzarella, pollo fritto, salsa BBQ',8.50,'[{"prezzo":8.5}]','{}','{}',2),
('calzoni','Buffalo Chicken Calzone','mozzarella fiordilatte e pollo fritto al buffalo piccante',8.50,'[{"prezzo":8.5}]','{}','{}',3),
('calzoni','Veggie Calzone','mozzarella fiordilatte, funghi, cipolle, spinaci, peperoni, olive e carciofi',8.50,'[{"prezzo":8.5}]','{}','{}',4),
('calzoni','Hot Boy Calzone','mozzarella fiordilatte, salsiccia piccante, peperoni, salsiccia e cipolle',9.00,'[{"prezzo":9.0}]','{}','{}',5);

-- INSALATE
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('insalate','Burger Salad','lattuga, burger di vitello, crispy bacon, funghi freschi, pomodorini, ciliegino di fiordilatte, ceasar dressing',12.50,'[{"prezzo":12.5}]','{}','{}',1),
('insalate','Cesar Palace Salad','lattuga, pollo grigliato, bacon croccante, Cesar dressing, pecorino stagionato',12.50,'[{"prezzo":12.5}]','{}','{}',2),
('insalate','Los Angeles Salad','lattuga, crudo di Parma, pomodorini, chips di zucchine, mozzarella di bufala, pesto+granella di pistacchio',14.00,'[{"prezzo":14.0}]','{}','{}',3),
('insalate','Finest Salad','lattuga, rucola, radicchio, scaglie di grana, bresaola punta d''anca, mandorle tostate, funghi freschi, glassa balsamica',14.00,'[{"prezzo":14.0}]','{}','{}',4),
('insalate','Midland Salad','lattuga, pollo grigliato, pomodorini, avocado, scaglie di grana, ciliegino di fiordilatte, salsa yogurt',12.50,'[{"prezzo":12.5}]','{}','{}',5),
('insalate','Crispy Salad','lattuga, pollo croccante, crispy bacon, cipolla rossa cruda, avocado, ciliegino di fiordilatte, ranch dressing',14.00,'[{"prezzo":14.0}]','{}','{}',6);

-- MINI BURGERS
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('mini-burgers','Mini Chicken 2','mini buns + anelli di pollo, cheddar, salsa rosa, anelli di cipolla',2.50,'[{"prezzo":2.5}]','{"Patatine":[{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',1),
('mini-burgers','Mini Burger 1','Mini buns produzione nostra con mini smashed cheeseburger con cheddar e salsa rosa',2.00,'[{"prezzo":2.0}]','{"Patatine":[{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',2),
('mini-burgers','Mini Chicken 1','Mini buns produzione nostra con anelli di pollo Amadori prima scelta, cheddar e salsa rosa',2.00,'[{"prezzo":2.0}]','{"Patatine":[{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',3),
('mini-burgers','Mini Burger 2','mini buns + smashed cheeseburger, cheddar, bacon, salsa rosa',2.50,'[{"prezzo":2.5}]','{"Patatine":[{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',4);

-- WRAP
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('wrap','Pump It Up Wrap','pollo alla griglia marinato, spinaci, funghi, mozzarella, radicchio, avocado, salsa yogurt',8.00,'[{"prezzo":8.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',1),
('wrap','Burger Wrap','hamburger di vitello, bacon, cheddar, cipolle, lattuga, pomodoro, salsa rosa',10.50,'[{"prezzo":10.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',2),
('wrap','NY Giants Wrap','pollo fritto, cheddar, bacon, rucola, carote a filetti, cipolle, ranch dressing',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',3),
('wrap','Chicken Quesadillas Wrap','pollo alla griglia, cheddar, lattuga, pomodoro',8.00,'[{"prezzo":8.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',4),
('wrap','Hip Hop Wrap','pollo fritto, mozzarella sticks, onion rings, bacon, lattuga a filetti, maionese al barbecue, cheddar',10.00,'[{"prezzo":10.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',5),
('wrap','Buffalo Style Wrap','pollo fritto buffalo piccante, emmental, lattuga a filetti, pomodoro a fette, blue cheese dressing',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',6),
('wrap','Chicken Chips Wrap','pollo fritto croccante, chips di patate, bacon, salsa cheddar, ranch dressing, lattuga',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',7),
('wrap','West Palm Beach Wrap','pollo fritto, mozzarella fiordilatte, lattuga a filetti, pomodorini, avocado e maionese',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',8),
('wrap','Baby Wrap','prosciutto cotto, mozzarella, patatine fritte',6.50,'[{"prezzo":6.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',9),
('wrap','High Class Wrap','prosciutto di Parma, grana a scaglie, rucola, pomodorini, mozzarella di bufala, glassa balsamica',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',10),
('wrap','Chicago Wrap','pollo fritto honey mustard homemade, bacon croccante, cheddar, lattuga a filetti',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',11),
('wrap','BBQ Chicken Wrap','pollo fritto al barbecue, patatine fritte, mozzarella, lattuga a filetti e cipolle',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',12),
('wrap','Belmar Wrap','hamburger di vitello, cheddar, bacon, onion rings, crocchè di patate, honey mustard',11.00,'[{"prezzo":11.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',13),
('wrap','Chicken Caesar Wrap','pollo alla griglia marinato, lattuga, ceasar dressing, pecorino romano',7.50,'[{"prezzo":7.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',14),
('wrap','Tom''s River Wraps','pollo fritto croccante, chips di zucchine, chipotle mayo, avocado, lattuga, patate a spicchi aromatizzate',10.50,'[{"prezzo":10.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',15);

-- PANINI AMERICANI
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('panini-americani','Panino California Chicken','pollo fritto, lattuga, pomodoro, cipolla rossa cruda, maionese, olio, sale e pepe',8.00,'[{"prezzo":8.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',1),
('panini-americani','Panino Chicken BLT','pollo fritto, bacon, lattuga, pomodoro, olio, sale e pepe',8.00,'[{"prezzo":8.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',2),
('panini-americani','Panino Chicken Parm','pollo fritto, salsa di pomodoro, mozzarella fiordilatte, pecorino romano, basilico',8.00,'[{"prezzo":8.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',3),
('panini-americani','Panino Chicken Bacon Ranch','pollo fritto, bacon croccante, salsa ranch, lattuga, pomodoro',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',4),
('panini-americani','Panino Fat Bastard','pollo fritto, bacon croccante, salamino piccante, patatine fritte, mozzarella sticks, salsa barbecue, cheddar',11.00,'[{"prezzo":11.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',5),
('panini-americani','Panino Cardiac Arrest','chicken fingers, mozzarella sticks, onion rings, patatine fritte, salsa ranch, sottiletta e salsa americana piccante buffalo sauce',11.00,'[{"prezzo":11.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',6),
('panini-americani','Hot Dog Maxi','hot dog, mostarda e ketchup',6.00,'[{"prezzo":6.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',7),
('panini-americani','Panino Italian Hot Dog','wurstel arrostiti, cipolle, peperoni, patatine fritte e cheddar',7.00,'[{"prezzo":7.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',8),
('panini-americani','Panino Heavy Hitter Piccante','pollo fritto marinato con salsa americana piccante buffalo sauce, cipolle, funghi, emmental, salsa ranch, lattuga a filetti e pomodoro',10.50,'[{"prezzo":10.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',9),
('panini-americani','Panini Grilled Chicken','pollo grigliato con peperoni, funghi, cipolle, emmental, rucola',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',10);

-- PHILLY STYLE CHEESESTEAKS
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('philly-style-cheesesteaks','Cheesesteak','carne di vitello sfilacciata philly style, mozzarella fiordilatte',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',1),
('philly-style-cheesesteaks','Original Philly Sandwich','carne di vitello sfilacciata philly style, mozzarella fiordilatte, peperoni, cipolle e funghi',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',2),
('philly-style-cheesesteaks','California Style','carne di vitello sfilacciata philly style, mozzarella fiordilatte, lattuga, pomodoro a fette e maionese',9.00,'[{"prezzo":9.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',3),
('philly-style-cheesesteaks','Cheesesteak on Steroids','carne di vitello sfilacciata philly style, cheddar, funghi, peperoni, cipolle, patatine fritte e salsa BBQ Mayo',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',4),
('philly-style-cheesesteaks','Bacon Ranch','carne di vitello sfilacciata philly style, cheddar, cipolla, bacon, ranch dressing, lattuga e pomodoro',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',5),
('philly-style-cheesesteaks','''Nfari Steak Sandwich','carne di vitello sfilacciata philly style, sottiletta, bacon, funghi, cipolle, rucola e pomodoro a fette',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',6),
('philly-style-cheesesteaks','Devil Melt','carne di vitello sfilacciata philly style, emmental, salsa americana buffalo piccante, salamino piccante, lattuga e pomodoro',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',7),
('philly-style-cheesesteaks','Southern Style','carne di vitello sfilacciata philly style, mozzarella fiordilatte, peperoni, funghi, cipolle fritte croccanti, salsa BBQ e lattuga',9.50,'[{"prezzo":9.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',8);

-- PANINI PIASTRATI
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('panini-piastrati','Panino Cartoccio','prosciutto, mozzarella e salsa a scelta',5.00,'[{"prezzo":5.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',1),
('panini-piastrati','Panino Topolino','prosciutto, wurstel, mozzarella e salsa a scelta',5.50,'[{"prezzo":5.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',2),
('panini-piastrati','Panino San Daniele','prosciutto crudo di Parma, mozzarella, scaglie di grana, rucola, olio, sale e pepe',8.00,'[{"prezzo":8.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',3),
('panini-piastrati','Panino Piccantino','salamino piccante, mozzarella, tabasco, cipolle in padella e lattuga',7.50,'[{"prezzo":7.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',4),
('panini-piastrati','Panino Tonno e Cipolla','tonno in olio d''oliva, cipolla rossa cruda, rucola, olio, sale, pepe, leggera spremuta di limone',7.00,'[{"prezzo":7.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',5),
('panini-piastrati','Panino Bresa Hola','bresaola punta d''anca, mozzarella di bufala, grana, rucola, limone, olio, sale e pepe',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',6),
('panini-piastrati','Panino Alessio Player','patatine fritte, cheddar',5.00,'[{"prezzo":5.0}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',7),
('panini-piastrati','Panino ''Nfarinati Special','mortadella, mozzarella di bufala, crema di cipolle caramellate, radicchio e granella di pistacchio',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',8),
('panini-piastrati','Sofisticato','prosciutto crudo di Parma, chips di zucchine, mozzarella di bufala, rucola, pesto di pistacchio',8.50,'[{"prezzo":8.5}]','{"Patatine":[{"valore":"Patate dolci (sweet potato)","supplemento":2.0},{"valore":"Curly fries","supplemento":2.5},{"valore":"Patate surecrisp Fry''n Dip Con Buccia","supplemento":1.5},{"valore":"Patate a spicchi piccanti (spicchi spicy)","supplemento":2.0},{"valore":"Chips di patate fresche","supplemento":0.0},{"valore":"Patatine fritte surgelate","supplemento":1.0}]}','{}',9);

-- SPECIALITÀ
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('specialita','Family Style','mozzarella, prosciutto cotto, funghi, salsiccia, salamino piccante, peperoni, cipolle',8.00,'[{"prezzo":8.0,"variante":"Per Uno"},{"prezzo":16.5,"variante":"Per Tre"}]','{}','{}',1),
('specialita','Cool Ranch','mozzarella fiordilatte, pollo fritto al ranch, bacon',8.50,'[{"prezzo":8.5,"variante":"Per Uno"},{"prezzo":17.5,"variante":"Per Tre"}]','{}','{}',2),
('specialita','Mr Potato','mozzarella, patatine fritte, pollo fritto, bacon, salsa barbecue',8.50,'[{"prezzo":8.5,"variante":"Per Uno"},{"prezzo":17.5,"variante":"Per Tre"}]','{}','{}',3),
('specialita','American Classic','mozzarella, salsiccia, salamino piccante',7.50,'[{"prezzo":7.5,"variante":"Per Uno"},{"prezzo":15.5,"variante":"Per Tre"}]','{}','{}',4);

-- PIZZE DESSERT
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('pizze-dessert','Oreos Pizza','nutella, oreo, smarties, zucchero a velo',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.5,"variante":"Familiare"}]','{}','{}',1),
('pizze-dessert','Nutella''s','nutella, smarties, zucchero a velo',6.50,'[{"prezzo":6.5,"variante":"Personale"},{"prezzo":13.5,"variante":"Familiare"}]','{}','{}',2),
('pizze-dessert','Green Love','crema al pistacchio, mandorle, zucchero a velo',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.5,"variante":"Familiare"}]','{}','{}',3),
('pizze-dessert','Black and White','crema al cioccolato bianco, oreo frantumati, zucchero a velo, caramello',8.00,'[{"prezzo":8.0,"variante":"Personale"},{"prezzo":16.5,"variante":"Familiare"}]','{}','{}',4);

-- BEVANDE
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('bevande','COCA-COLA Original Taste PET 1,5 L','',3.50,'[{"prezzo":3.5}]','{}','{}',1),
('bevande','Sprite PET 1,5 L','',3.50,'[{"prezzo":3.5}]','{}','{}',2),
('bevande','Sprite Sleek Can 330 ml','',2.50,'[{"prezzo":2.5}]','{}','{}',3),
('bevande','Coca-Cola Sleek 33cl','',2.50,'[{"prezzo":2.5}]','{}','{}',4),
('bevande','Acqua Naturale 50cl','',1.50,'[{"prezzo":1.5}]','{}','{}',5),
('bevande','Bibita in Lattina 33cl Chinotto','',2.50,'[{"prezzo":2.5}]','{}','{}',6),
('bevande','Bibita in Lattina 33cl Tè al Limone','',2.50,'[{"prezzo":2.5}]','{}','{}',7),
('bevande','Bibita in Lattina 33cl Tè alla Pesca','',2.50,'[{"prezzo":2.5}]','{}','{}',8),
('bevande','Fanta Original Sleek 33 cl','',2.50,'[{"prezzo":2.5}]','{}','{}',9);

-- BIRRE
INSERT OR IGNORE INTO products (category_id, name, description, price, prezzi_json, options_json, multi_options_json, sort_order) VALUES
('birre','Birra 33cl Heineken','',3.00,'[{"prezzo":3.0}]','{}','{}',1),
('birre','Birra 33cl Ceres','',4.00,'[{"prezzo":4.0}]','{}','{}',2),
('birre','Birra 33cl Ichnusa','',4.00,'[{"prezzo":4.0}]','{}','{}',3),
('birre','Birra 33cl Beck''s 33cl','',3.00,'[{"prezzo":3.0}]','{}','{}',4),
('birre','Heineken 66cl','',3.50,'[{"prezzo":3.5}]','{}','{}',5),
('birre','Moretti 66cl','',3.50,'[{"prezzo":3.5}]','{}','{}',6);

-- ============================================================
-- SEED: IMPOSTAZIONI DEFAULT
-- ============================================================
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('whatsapp_number',    '393759084330'),
  ('promo_bar_text',     '🎉 10% di Sconto su tutti gli ordini online!'),
  ('locale_chiuso',      'false'),
  ('homepage_hours',     'Mar–Dom 18:30–23:30 (Lunedì Chiusi)'),
  ('homepage_hours_note','(Lunedì chiusi)'),
  ('homepage_buttons',   '[{"text":"Apri il Menù","link":"menu.html","style":"primary","icon":"fa-pizza-slice"},{"text":"Chiama","link":"tel:+390918432674","style":"secondary","icon":"fa-phone"}]'),
  ('opening_hours',      '{"1":null,"2":{"open":"18:30","close":"23:30"},"3":{"open":"18:30","close":"23:30"},"4":{"open":"18:30","close":"23:30"},"5":{"open":"18:30","close":"23:30"},"6":{"open":"18:00","close":"23:00"},"0":{"open":"18:30","close":"23:30"}}');
