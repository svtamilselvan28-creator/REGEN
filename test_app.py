"""
test_app.py - Automated tests for Student ReCraft platform.
Validates all core functionality, security checks, and database workflows.
"""

import unittest
import os
import database
from app import app
from werkzeug.security import generate_password_hash

TEST_DB = os.path.join(os.path.dirname(__file__), 'test_rent.db')

class RentReuseTestCase(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Override database path to temporary test DB
        database.DATABASE_PATH = TEST_DB
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False

    def setUp(self):
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
        database.init_db()

        # Seed test data
        conn = database.get_db()
        pw = generate_password_hash("password123")
        conn.execute("INSERT INTO users (name, email, password_hash, college, phone) VALUES (?, ?, ?, ?, ?);",
                     ("Alex Chen", "alex@campus.edu", pw, "Engineering Hall 4", "555-1111"))
        conn.execute("INSERT INTO users (name, email, password_hash, college, phone) VALUES (?, ?, ?, ?, ?);",
                     ("Priya Sharma", "priya@campus.edu", pw, "Science Dorm B", "555-2222"))
        conn.commit()

        # Add items
        conn.execute("""
            INSERT INTO items (owner_id, title, description, category, item_type, price, deposit, location, available_from, available_until, image_path, is_available)
            VALUES (1, 'TI-84 Plus Calculator', 'Great calculator for calculus', 'Electronics', 'Rent', 3.0, 10.0, 'Library', '2026-10-01', '2026-12-01', '/static/images/calculator.svg', 1);
        """)
        conn.execute("""
            INSERT INTO items (owner_id, title, description, category, item_type, price, deposit, location, available_from, available_until, image_path, is_available)
            VALUES (1, 'Engineering Mini Drafter', 'Steel arm mini drafter', 'Stationery & Drawing', 'Rent', 2.0, 15.0, 'Engineering Hall', '2026-10-01', '2026-12-01', '/static/images/drafter.svg', 1);
        """)
        conn.commit()

        # Add 1 pending request from Priya (user 2) to Alex (user 1)
        conn.execute("""
            INSERT INTO rental_requests (item_id, requester_id, owner_id, start_date, end_date, message, status)
            VALUES (1, 2, 1, '2026-10-05', '2026-10-08', 'Need for midterm exam', 'Pending');
        """)
        conn.commit()
        conn.close()

        self.client = app.test_client()

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(TEST_DB):
            try:
                os.remove(TEST_DB)
            except Exception:
                pass
        # Restore default database path
        database.DATABASE_PATH = os.path.join(database.BASE_DIR, database.DATABASE_NAME)

    # 1. Test Homepage
    def test_homepage_loads(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'ReCraft', response.data)
        self.assertIn(b'Browse Items', response.data)

    # 2. Test Browse & Search & Category Filter
    def test_browse_page_and_search(self):
        response = self.client.get('/browse')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'TI-84 Plus Calculator', response.data)
        self.assertIn(b'Engineering Mini Drafter', response.data)

        # Test search query
        search_resp = self.client.get('/browse?q=calculator')
        self.assertEqual(search_resp.status_code, 200)
        self.assertIn(b'TI-84 Plus Calculator', search_resp.data)

        # Test category filter
        cat_resp = self.client.get('/browse?category=Stationery+%26+Drawing')
        self.assertEqual(cat_resp.status_code, 200)
        self.assertIn(b'Engineering Mini Drafter', cat_resp.data)

    # 3. Test Item Detail Page
    def test_item_detail(self):
        response = self.client.get('/item/1')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'TI-84 Plus Calculator', response.data)

        # Non-existent item returns 404
        resp_404 = self.client.get('/item/999999')
        self.assertEqual(resp_404.status_code, 404)

    # 4. Test User Authentication (Login, Duplicate Email, Password Check)
    def test_auth_workflows(self):
        # 1. Test invalid password on fresh client
        fresh_client = app.test_client()
        resp_bad_login = fresh_client.post('/login', data={
            'email': 'alex@campus.edu',
            'password': 'wrongpassword'
        }, follow_redirects=True)
        self.assertIn(b'Invalid email or password', resp_bad_login.data)

        # 2. Test valid login
        resp_login = fresh_client.post('/login', data={
            'email': 'alex@campus.edu',
            'password': 'password123'
        }, follow_redirects=True)
        self.assertEqual(resp_login.status_code, 200)
        self.assertIn(b'Welcome back, Alex Chen!', resp_login.data)

        # Logout
        fresh_client.get('/logout')

        # 3. Test duplicate email registration
        resp_dup = fresh_client.post('/signup', data={
            'name': 'Alex Duplicate',
            'email': 'alex@campus.edu',
            'college': 'Engineering',
            'phone': '123456',
            'password': 'password123',
            'confirm_password': 'password123'
        }, follow_redirects=True)
        self.assertIn(b'already exists', resp_dup.data)

        # 4. Test new student signup
        resp_new_signup = fresh_client.post('/signup', data={
            'name': 'Jordan Lee',
            'email': 'jordan@campus.edu',
            'college': 'School of Business',
            'phone': '555-9999',
            'password': 'securepassword',
            'confirm_password': 'securepassword'
        }, follow_redirects=True)
        self.assertEqual(resp_new_signup.status_code, 200)
        self.assertIn(b'Welcome to ReCraft, Jordan Lee!', resp_new_signup.data)

    # 5. Test Posting Item & Session Guard
    def test_post_item_and_authorization(self):
        # Unauthenticated user redirected
        guest_client = app.test_client()
        resp_unauth = guest_client.get('/item/new', follow_redirects=True)
        self.assertIn(b'Please log in first', resp_unauth.data)

        # Authenticated post
        alex_client = app.test_client()
        alex_client.post('/login', data={'email': 'alex@campus.edu', 'password': 'password123'})

        resp_post = alex_client.post('/item/new', data={
            'title': 'Organic Chemistry Molecular Model Kit',
            'category': 'Lab & Medical',
            'item_type': 'Borrow (Free)',
            'price': '0.00',
            'deposit': '5.00',
            'location': 'Chemistry Bldg Lobby',
            'available_from': '2026-10-01',
            'available_until': '2026-12-01',
            'description': 'Complete 240 piece ball and stick molecular kit.'
        }, follow_redirects=True)

        self.assertEqual(resp_post.status_code, 200)
        self.assertIn(b'Molecular Model Kit', resp_post.data)

    # 6. Test Rental Request Workflow & Self-Rental Prevention
    def test_rental_request_workflow(self):
        # 1. Alex tries to request his own item (item 1)
        alex_client = app.test_client()
        alex_client.post('/login', data={'email': 'alex@campus.edu', 'password': 'password123'})

        resp_self = alex_client.post('/item/1/request', data={
            'start_date': '2026-10-10',
            'end_date': '2026-10-15',
            'message': 'Testing self request'
        }, follow_redirects=True)
        self.assertIn(b'You cannot request your own item!', resp_self.data)

        # 2. Priya requests Alex's Drafter (item 2)
        priya_client = app.test_client()
        priya_client.post('/login', data={'email': 'priya@campus.edu', 'password': 'password123'})

        resp_req = priya_client.post('/item/2/request', data={
            'start_date': '2026-10-10',
            'end_date': '2026-10-15',
            'message': 'Need this for the engineering graphics drawing lab.'
        }, follow_redirects=True)
        self.assertEqual(resp_req.status_code, 200)
        self.assertIn(b'Your rental request has been submitted!', resp_req.data)

    # 7. Test Accepting Request and Internal Messaging
    def test_owner_accept_and_messaging(self):
        # Alex logs in and reviews pending request #1
        alex_client = app.test_client()
        alex_client.post('/login', data={'email': 'alex@campus.edu', 'password': 'password123'})

        # Accept request #1
        resp_accept = alex_client.post('/requests/1/respond/accept', follow_redirects=True)
        self.assertEqual(resp_accept.status_code, 200)
        self.assertIn(b'Request accepted!', resp_accept.data)

        # Send a message to coordinate meetup
        resp_msg = alex_client.post('/requests/1/messages', data={
            'message': 'Hey Priya! Let us meet tomorrow at 11 AM outside the library.'
        }, follow_redirects=True)
        self.assertEqual(resp_msg.status_code, 200)
        self.assertIn(b'outside the library', resp_msg.data)

    # 8. Test Borrow, Rent, and Reuse Dynamic Pricing Rules
    def test_listing_types_pricing_rules(self):
        alex_client = app.test_client()
        alex_client.post('/login', data={'email': 'alex@campus.edu', 'password': 'password123'})

        # Case 1: BORROW - only deposit allowed, price forced to 0.0 even if stray price is sent
        resp_borrow = alex_client.post('/item/new', data={
            'title': 'Borrowable Calculus Book',
            'category': 'Books',
            'item_type': 'Borrow (Free)',
            'price': '99.00',  # Irrelevant price should be ignored
            'deposit': '250.00',
            'location': 'Library',
            'available_from': '2026-10-01',
            'available_until': '2026-12-01',
            'description': 'Lending calculus book for free.'
        }, follow_redirects=True)
        self.assertEqual(resp_borrow.status_code, 200)

        # Case 2: RENT - both rental price and deposit saved
        resp_rent = alex_client.post('/item/new', data={
            'title': 'Rental Laptop Stand',
            'category': 'Electronics',
            'item_type': 'Rent',
            'price': '45.00',
            'deposit': '200.00',
            'location': 'Dorm Hall',
            'available_from': '2026-10-01',
            'available_until': '2026-12-01',
            'description': 'Ergonomic aluminum laptop stand.'
        }, follow_redirects=True)
        self.assertEqual(resp_rent.status_code, 200)

        # Case 3: REUSE - total price saved, deposit forced to 0.0 even if stray deposit is sent
        resp_reuse = alex_client.post('/item/new', data={
            'title': 'Dorm Table Lamp',
            'category': 'Dorm & Living',
            'item_type': 'Reuse (Giveaway)',
            'total_price': '350.00',
            'deposit': '500.00',  # Irrelevant deposit should be ignored
            'location': 'North Dorms',
            'available_from': '2026-10-01',
            'available_until': '2026-12-01',
            'description': 'Selling desk lamp before moving out.'
        }, follow_redirects=True)
        self.assertEqual(resp_reuse.status_code, 200)

        # Verify database values
        conn = database.get_db()
        c = conn.cursor()
        c.execute("SELECT item_type, price, deposit FROM items WHERE title = 'Borrowable Calculus Book';")
        borrow_item = c.fetchone()
        self.assertEqual(borrow_item['item_type'], 'Borrow (Free)')
        self.assertEqual(borrow_item['price'], 0.0)
        self.assertEqual(borrow_item['deposit'], 250.0)

        c.execute("SELECT item_type, price, deposit FROM items WHERE title = 'Rental Laptop Stand';")
        rent_item = c.fetchone()
        self.assertEqual(rent_item['item_type'], 'Rent')
        self.assertEqual(rent_item['price'], 45.0)
        self.assertEqual(rent_item['deposit'], 200.0)

        c.execute("SELECT item_type, price, deposit FROM items WHERE title = 'Dorm Table Lamp';")
        reuse_item = c.fetchone()
        self.assertEqual(reuse_item['item_type'], 'Reuse (Giveaway)')
        self.assertEqual(reuse_item['price'], 350.0)
        self.assertEqual(reuse_item['deposit'], 0.0)
        conn.close()

if __name__ == '__main__':
    unittest.main()

