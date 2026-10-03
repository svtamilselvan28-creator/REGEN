-- ==============================================================================
-- ReCraft Campus - Supabase PostgreSQL Schema
-- Run this script in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ==============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    college TEXT NOT NULL,
    phone TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 2. ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.items (
    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    item_type TEXT DEFAULT 'Rent' NOT NULL, -- 'Rent', 'Borrow (Free)', 'Reuse (Giveaway)'
    price NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    deposit NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    location TEXT NOT NULL,
    available_from DATE NOT NULL,
    available_until DATE NOT NULL,
    image_path TEXT NOT NULL,
    is_available SMALLINT DEFAULT 1 NOT NULL, -- 1: available, 0: reserved/hidden
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_owner_id ON public.items(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON public.items(category);
CREATE INDEX IF NOT EXISTS idx_items_item_type ON public.items(item_type);
CREATE INDEX IF NOT EXISTS idx_items_is_available ON public.items(is_available);

-- 3. RENTAL / BORROW REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.rental_requests (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    requester_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    owner_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'Pending' NOT NULL, -- 'Pending', 'Accepted', 'Rejected'
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rental_requests_item_id ON public.rental_requests(item_id);
CREATE INDEX IF NOT EXISTS idx_rental_requests_requester_id ON public.rental_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_rental_requests_owner_id ON public.rental_requests(owner_id);

-- 4. REQUEST MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.request_messages (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES public.rental_requests(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_messages_request_id ON public.request_messages(request_id);

-- 5. REPORTS TABLE (TRUST & SAFETY)
CREATE TABLE IF NOT EXISTS public.reports (
    id BIGSERIAL PRIMARY KEY,
    reporter_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL, -- 'item' or 'user'
    target_id BIGINT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- STORAGE BUCKET FOR ITEM IMAGES
-- ==============================================================================
-- In Supabase Dashboard -> Storage -> Create new bucket:
-- Bucket Name: "item-images"
-- Public bucket: ON (checked)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-images', 'item-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to uploaded images
CREATE POLICY "Public Read Access on item-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-images');

-- Allow authenticated / service uploads to item-images
CREATE POLICY "Allow Uploads on item-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'item-images');

-- ==============================================================================
-- SAMPLE INITIAL DATA (INDIAN RUPEES)
-- ==============================================================================
-- Password for all sample accounts is: password123
-- Bcrypt hash generated with cost factor 10:
-- $2a$10$3pt1EgbO3boFTnLwzVsyre8raUa.xAxmwZ2jEwq8Qy5jAgBo2oGVW

INSERT INTO public.users (id, name, email, password_hash, college, phone, bio)
VALUES 
(1, 'Alex Chen', 'alex@campus.edu', '$2a$10$3pt1EgbO3boFTnLwzVsyre8raUa.xAxmwZ2jEwq8Qy5jAgBo2oGVW', 'College of Engineering - Hall 4', '+91 98765 43210', '3rd year Mechanical Engineering student. Happy to lend tools to juniors!'),
(2, 'Priya Sharma', 'priya@campus.edu', '$2a$10$3pt1EgbO3boFTnLwzVsyre8raUa.xAxmwZ2jEwq8Qy5jAgBo2oGVW', 'School of Science & Math - Dorm B', '+91 98765 43211', 'Biochemistry sophomore. Keeping reusable lab gear in circulation.'),
(3, 'Marcus Miller', 'marcus@campus.edu', '$2a$10$3pt1EgbO3boFTnLwzVsyre8raUa.xAxmwZ2jEwq8Qy5jAgBo2oGVW', 'School of Architecture & Design', '+91 98765 43212', 'Architecture junior. Big fan of cycling, sketching, and campus reuse.')
ON CONFLICT (id) DO NOTHING;

SELECT setval('public.users_id_seq', (SELECT MAX(id) FROM public.users));

INSERT INTO public.items (id, owner_id, title, description, category, item_type, price, deposit, location, available_from, available_until, image_path, is_available)
VALUES
(1, 1, 'Engineering Mini Drafter with Clamp & 360-Degree Scale', 'Heavy-duty steel arm mini drafter with transparent acrylic scales and table clamp. Used for one semester in Engineering Graphics (EG-101). In perfect working condition, zero slop in the joints.', 'Stationery & Drawing', 'Rent', 30.00, 150.00, 'Mechanical Engineering Building, Room 204 or North Dorms', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '/static/images/drafter.svg', 1),
(2, 1, 'TI-84 Plus CE Color Graphing Calculator', 'Rechargeable graphing calculator with high-res color backlit screen. Comes with mini-USB charging cable and protective slide case. Pre-loaded with polynomial solver and matrix math tools.', 'Electronics', 'Rent', 50.00, 300.00, 'Main Science & Engineering Library Lobby', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '/static/images/calculator.svg', 1),
(3, 3, 'Complete Engineering Drawing Instrument Box', 'Complete 14-piece technical drawing set including large extension compass, beam divider, drop spring bow, and lead refills. Great for freshman architecture and drafting labs.', 'Stationery & Drawing', 'Borrow (Free)', 0.00, 100.00, 'Architecture Studio 3 / Hallway lockers', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '/static/images/drawing_tools.svg', 1),
(4, 2, 'Calculus & Linear Algebra Textbook Bundle (Hardcover)', 'Stewart Calculus (8th Edition) plus Gilbert Strang Linear Algebra. Some light highlighting in chapter 3, but clean pages throughout. Graduating and want to pass these on to someone who needs them!', 'Books', 'Reuse (Giveaway)', 0.00, 0.00, 'Student Center Couches or Campus Cafe', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '/static/images/books.svg', 1),
(5, 2, 'White Cotton Chemistry Lab Coat & Splash Goggles (Size M)', '100% thick white cotton lab coat with snap buttons and two deep hip pockets. Includes ANSI Z87.1 certified anti-fog safety splash goggles. Washed and sanitized, ready for Organic Chem labs.', 'Lab & Medical', 'Borrow (Free)', 0.00, 50.00, 'Bio-Chem Science Complex, 1st Floor Foyer', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '/static/images/labcoat.svg', 1),
(6, 3, 'Campus Commuter Hybrid Bicycle with Helmet & U-Lock', 'Reliable 7-speed hybrid bike with front basket and rear rack. Ideal for getting across campus between classes. Includes a high-security Kryptonite U-Lock and adjustable helmet.', 'Bicycles & Sports', 'Rent', 50.00, 250.00, 'East Campus Bike Shelter (near Dorm Block C)', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '/static/images/bicycle.svg', 1),
(7, 1, 'Arduino Uno Ultimate Starter Kit + Sensor Shield', 'Official Arduino Uno R3 board with breadboard, ultrasonic sensor, servo motors, LCD 1602 display, jumper wires, and resistor pack. Perfect for microcontrollers or IoT projects.', 'Electronics', 'Rent', 40.00, 200.00, 'Robotics & Makerspace Lab (Engineering Hall B)', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '/static/images/electronics.svg', 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval('public.items_id_seq', (SELECT MAX(id) FROM public.items));
