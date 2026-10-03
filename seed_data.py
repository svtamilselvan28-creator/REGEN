"""
seed_data.py - Seeds realistic sample data for the Student ReCraft platform.
Run this script to initialize the database with pre-populated users, items, and requests.
"""

from werkzeug.security import generate_password_hash
from database import get_db, init_db
from datetime import date, timedelta

def seed_database():
    # Make sure tables exist
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    # Check if data already exists
    cursor.execute("SELECT COUNT(*) FROM users;")
    if cursor.fetchone()[0] > 0:
        print("Database already contains data. Skipping seeding.")
        conn.close()
        return

    print("Seeding database with realistic student items and accounts...")

    # Default password for all sample accounts: password123
    sample_password_hash = generate_password_hash("password123")

    # 1. Insert Sample Users
    users = [
        (
            "Alex Chen",
            "alex@campus.edu",
            sample_password_hash,
            "College of Engineering - Hall 4",
            "+1 (555) 234-5678",
            "3rd year Mechanical Engineering student. Happy to lend tools to juniors!"
        ),
        (
            "Priya Sharma",
            "priya@campus.edu",
            sample_password_hash,
            "School of Science & Math - Dorm B",
            "+1 (555) 345-6789",
            "Biochemistry sophomore. Keeping reusable lab gear in circulation."
        ),
        (
            "Marcus Miller",
            "marcus@campus.edu",
            sample_password_hash,
            "School of Architecture & Design",
            "+1 (555) 456-7890",
            "Architecture junior. Big fan of cycling, sketching, and campus reuse."
        )
    ]

    cursor.executemany("""
    INSERT INTO users (name, email, password_hash, college, phone, bio)
    VALUES (?, ?, ?, ?, ?, ?);
    """, users)
    conn.commit()

    # Fetch inserted user IDs
    cursor.execute("SELECT id, email FROM users;")
    user_map = {row['email']: row['id'] for row in cursor.fetchall()}

    alex_id = user_map["alex@campus.edu"]
    priya_id = user_map["priya@campus.edu"]
    marcus_id = user_map["marcus@campus.edu"]

    today = date.today()
    next_month = today + timedelta(days=60)

    # 2. Insert Sample Items
    items = [
        (
            alex_id,
            "Engineering Mini Drafter with Clamp & 360-Degree Scale",
            "Heavy-duty steel arm mini drafter with transparent acrylic scales and table clamp. Used for one semester in Engineering Graphics (EG-101). In perfect working condition, zero slop in the joints.",
            "Stationery & Drawing",
            "Rent",
            30.00,
            150.00,
            "Mechanical Engineering Building, Room 204 or North Dorms",
            today.isoformat(),
            next_month.isoformat(),
            "/static/images/drafter.svg",
            1
        ),
        (
            alex_id,
            "TI-84 Plus CE Color Graphing Calculator",
            "Rechargeable graphing calculator with high-res color backlit screen. Comes with mini-USB charging cable and protective slide case. Pre-loaded with polynomial solver and matrix math tools.",
            "Electronics",
            "Rent",
            50.00,
            300.00,
            "Main Science & Engineering Library Lobby",
            today.isoformat(),
            next_month.isoformat(),
            "/static/images/calculator.svg",
            1
        ),
        (
            marcus_id,
            "Complete Engineering Drawing Instrument Box",
            "Complete 14-piece technical drawing set including large extension compass, beam divider, drop spring bow, and lead refills. Great for freshman architecture and drafting labs.",
            "Stationery & Drawing",
            "Borrow (Free)",
            0.00,
            100.00,
            "Architecture Studio 3 / Hallway lockers",
            today.isoformat(),
            next_month.isoformat(),
            "/static/images/drawing_tools.svg",
            1
        ),
        (
            priya_id,
            "Calculus & Linear Algebra Textbook Bundle (Hardcover)",
            "Stewart Calculus (8th Edition) plus Gilbert Strang Linear Algebra. Some light highlighting in chapter 3, but clean pages throughout. Graduating and want to pass these on to someone who needs them!",
            "Books",
            "Reuse (Giveaway)",
            0.00,
            0.00,
            "Student Center Couches or Campus Cafe",
            today.isoformat(),
            next_month.isoformat(),
            "/static/images/books.svg",
            1
        ),
        (
            priya_id,
            "White Cotton Chemistry Lab Coat & Splash Goggles (Size M)",
            "100% thick white cotton lab coat with snap buttons and two deep hip pockets. Includes ANSI Z87.1 certified anti-fog safety splash goggles. Washed and sanitized, ready for Organic Chem labs.",
            "Lab & Medical",
            "Borrow (Free)",
            0.00,
            50.00,
            "Bio-Chem Science Complex, 1st Floor Foyer",
            today.isoformat(),
            next_month.isoformat(),
            "/static/images/labcoat.svg",
            1
        ),
        (
            marcus_id,
            "Campus Commuter Hybrid Bicycle with Helmet & U-Lock",
            "Reliable 7-speed hybrid bike with front basket and rear rack. Ideal for getting across campus between classes. Includes a high-security Kryptonite U-Lock and adjustable helmet.",
            "Bicycles & Sports",
            "Rent",
            50.00,
            250.00,
            "East Campus Bike Shelter (near Dorm Block C)",
            today.isoformat(),
            next_month.isoformat(),
            "/static/images/bicycle.svg",
            1
        ),
        (
            alex_id,
            "Arduino Uno Ultimate Starter Kit + Sensor Shield",
            "Official Arduino Uno R3 board with breadboard, ultrasonic sensor, servo motors, LCD 1602 display, jumper wires, and resistor pack. Perfect for microcontrollers or IoT projects.",
            "Electronics",
            "Rent",
            40.00,
            200.00,
            "Robotics & Makerspace Lab (Engineering Hall B)",
            today.isoformat(),
            next_month.isoformat(),
            "/static/images/electronics.svg",
            1
        )
    ]

    cursor.executemany("""
    INSERT INTO items (owner_id, title, description, category, item_type, price, deposit, location, available_from, available_until, image_path, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, items)
    conn.commit()

    # Fetch inserted items
    cursor.execute("SELECT id, title, owner_id FROM items;")
    items_list = cursor.fetchall()
    item_by_title = {row['title']: row['id'] for row in items_list}

    # 3. Insert Sample Rental Requests for demonstration
    # - Priya asks to borrow Alex's Drafter (Pending)
    # - Marcus rents Alex's Calculator (Accepted)
    drafter_id = item_by_title.get("Engineering Mini Drafter with Clamp & 360° Scale")
    calc_id = item_by_title.get("TI-84 Plus CE Color Graphing Calculator")

    req_start = today + timedelta(days=2)
    req_end = today + timedelta(days=5)

    if drafter_id:
        cursor.execute("""
        INSERT INTO rental_requests (item_id, requester_id, owner_id, start_date, end_date, message, status)
        VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (drafter_id, priya_id, alex_id, req_start.isoformat(), req_end.isoformat(),
              "Hi Alex! I have an engineering drawing assignment due this Friday. Would love to borrow your mini drafter for 3 days.", "Pending"))

    if calc_id:
        cursor.execute("""
        INSERT INTO rental_requests (item_id, requester_id, owner_id, start_date, end_date, message, status)
        VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (calc_id, marcus_id, alex_id, req_start.isoformat(), req_end.isoformat(),
              "Hey Alex, taking the physics exam this Thursday and need an approved graphing calculator. Can pay the $3/day cash or Venmo!", "Accepted"))
        req_id = cursor.lastrowid

        # Insert a message between Marcus and Alex
        cursor.execute("""
        INSERT INTO request_messages (request_id, sender_id, message)
        VALUES (?, ?, ?);
        """, (req_id, alex_id, "Accepted! I can meet you at the Library lobby on Wednesday at 4 PM to hand it over."))

        cursor.execute("""
        INSERT INTO request_messages (request_id, sender_id, message)
        VALUES (?, ?, ?);
        """, (req_id, marcus_id, "Sounds great, see you there at 4 PM. Thanks a lot!"))

    conn.commit()
    conn.close()
    print("Database successfully seeded with realistic sample data!")

if __name__ == '__main__':
    seed_database()

