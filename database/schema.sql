-- ============================================================
--  PERFUME POS - Database Schema
--  Locations: Venetian | Planet Hollywood (Las Vegas)
-- ============================================================

-- ----------------------------------------
-- KIOSKS (locations)
-- ----------------------------------------
CREATE TABLE kiosks (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,           -- "Venetian", "Planet Hollywood"
    address     VARCHAR(255),
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO kiosks (name, address) VALUES
    ('Venetian',         'The Venetian Resort, Las Vegas Blvd S, Las Vegas, NV'),
    ('Planet Hollywood', 'Planet Hollywood Resort, Las Vegas Blvd S, Las Vegas, NV');


-- ----------------------------------------
-- EMPLOYEES
-- ----------------------------------------
CREATE TABLE employees (
    id              SERIAL PRIMARY KEY,
    kiosk_id        INT REFERENCES kiosks(id),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    phone           VARCHAR(20),
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'seller'
                        CHECK (role IN ('admin', 'manager', 'seller')),
    -- admin   -> full access (you)
    -- manager -> manage kiosk, view all reports
    -- seller  -> register sales, view own stats
    active          BOOLEAN DEFAULT TRUE,
    hired_at        DATE,
    created_at      TIMESTAMP DEFAULT NOW()
);


-- ----------------------------------------
-- PRODUCTS (perfumes)
-- ----------------------------------------
CREATE TABLE products (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    brand           VARCHAR(100),
    description     TEXT,
    size_ml         INT,                         -- bottle size in ml
    barcode         VARCHAR(50) UNIQUE,
    cost_price      NUMERIC(10,2) NOT NULL,      -- what you paid
    sell_price      NUMERIC(10,2) NOT NULL,      -- what you charge
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);


-- ----------------------------------------
-- INVENTORY (stock per kiosk)
-- ----------------------------------------
CREATE TABLE inventory (
    id              SERIAL PRIMARY KEY,
    kiosk_id        INT NOT NULL REFERENCES kiosks(id),
    product_id      INT NOT NULL REFERENCES products(id),
    quantity        INT NOT NULL DEFAULT 0,
    min_quantity    INT NOT NULL DEFAULT 3,      -- alert threshold
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (kiosk_id, product_id)
);


-- ----------------------------------------
-- CUSTOMERS
-- ----------------------------------------
CREATE TABLE customers (
    id              SERIAL PRIMARY KEY,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100),
    email           VARCHAR(150),
    phone           VARCHAR(20),
    notes           TEXT,                        -- preferences, allergies, etc.
    first_visit     TIMESTAMP DEFAULT NOW(),
    last_visit      TIMESTAMP DEFAULT NOW(),
    total_spent     NUMERIC(10,2) DEFAULT 0
);


-- ----------------------------------------
-- SALES
-- ----------------------------------------
CREATE TABLE sales (
    id                      SERIAL PRIMARY KEY,
    kiosk_id                INT NOT NULL REFERENCES kiosks(id),
    employee_id             INT NOT NULL REFERENCES employees(id),
    customer_id             INT REFERENCES customers(id),     -- optional
    square_transaction_id   VARCHAR(100),                     -- Square API ref
    payment_method          VARCHAR(20) DEFAULT 'card'
                                CHECK (payment_method IN ('card', 'cash', 'other')),
    subtotal                NUMERIC(10,2) NOT NULL,
    discount                NUMERIC(10,2) DEFAULT 0,
    total                   NUMERIC(10,2) NOT NULL,
    notes                   TEXT,
    created_at              TIMESTAMP DEFAULT NOW()
);


-- ----------------------------------------
-- SALE ITEMS (products in each sale)
-- ----------------------------------------
CREATE TABLE sale_items (
    id              SERIAL PRIMARY KEY,
    sale_id         INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id      INT NOT NULL REFERENCES products(id),
    quantity        INT NOT NULL DEFAULT 1,
    unit_price      NUMERIC(10,2) NOT NULL,
    subtotal        NUMERIC(10,2) NOT NULL       -- quantity * unit_price
);


-- ============================================================
--  COMPETITION / LEADERBOARD
-- ============================================================

-- Daily snapshot — saved at end of each day by the system
CREATE TABLE daily_leaderboard (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    employee_id     INT NOT NULL REFERENCES employees(id),
    kiosk_id        INT NOT NULL REFERENCES kiosks(id),
    total_sales     INT NOT NULL DEFAULT 0,      -- number of transactions
    total_revenue   NUMERIC(10,2) NOT NULL DEFAULT 0,
    podium_position INT,                         -- 1st, 2nd, 3rd
    UNIQUE (date, employee_id)
);

-- Live view: today's ranking (used in real-time podium)
CREATE VIEW todays_podium AS
SELECT
    e.id            AS employee_id,
    e.first_name,
    e.last_name,
    k.name          AS kiosk,
    COUNT(s.id)     AS sales_count,
    SUM(s.total)    AS total_revenue,
    RANK() OVER (ORDER BY SUM(s.total) DESC) AS position
FROM employees e
JOIN sales s ON s.employee_id = e.id
JOIN kiosks k ON k.id = e.kiosk_id
WHERE s.created_at::DATE = CURRENT_DATE
  AND e.active = TRUE
GROUP BY e.id, e.first_name, e.last_name, k.name
ORDER BY position;

-- Monthly ranking (for bigger rewards / recognition)
CREATE VIEW monthly_leaderboard AS
SELECT
    e.id            AS employee_id,
    e.first_name,
    e.last_name,
    k.name          AS kiosk,
    COUNT(s.id)     AS sales_count,
    SUM(s.total)    AS total_revenue,
    RANK() OVER (ORDER BY SUM(s.total) DESC) AS position
FROM employees e
JOIN sales s ON s.employee_id = e.id
JOIN kiosks k ON k.id = e.kiosk_id
WHERE DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', CURRENT_DATE)
  AND e.active = TRUE
GROUP BY e.id, e.first_name, e.last_name, k.name
ORDER BY position;


-- ============================================================
--  INDEXES (performance)
-- ============================================================
CREATE INDEX idx_sales_employee   ON sales(employee_id);
CREATE INDEX idx_sales_kiosk      ON sales(kiosk_id);
CREATE INDEX idx_sales_date       ON sales(created_at);
CREATE INDEX idx_inventory_kiosk  ON inventory(kiosk_id);
CREATE INDEX idx_sale_items_sale  ON sale_items(sale_id);
