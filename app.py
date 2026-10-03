"""
app.py - Main Flask Application for Student ReCraft
A beginner-friendly, clean, and secure campus sharing platform.
"""

import os
from datetime import date, datetime
from functools import wraps
from flask import (
    Flask, render_template, request, redirect,
    url_for, flash, session, g, abort
)
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

from database import get_db, init_db

# Initialize Flask application
app = Flask(__name__)

# Secret key for session signing from environment or fallback
app.secret_key = os.environ.get('SECRET_KEY', 'rent-and-reuse-production-secret-key-campus-2026')

# Support reverse proxies (Cloudflare, Render, Nginx, Heroku) so HTTPS is properly detected
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Ensure database tables exist upon startup
init_db()

# Configure upload folder for user images
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # Max 5MB upload

def allowed_file(filename):
    """Check if uploaded file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# -------------------------------------------------------------
# AUTHENTICATION DECORATOR & CONTEXT PROCESSORS
# -------------------------------------------------------------

def login_required(f):
    """
    Decorator that protects routes requiring a logged-in user.
    If not logged in, redirects to the login page with a helpful message.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('user_id'):
            flash('Please log in first to access this page.', 'warning')
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated_function

@app.before_request
def load_logged_in_user():
    """
    Runs before every request.
    Loads pending requests count for the logged-in user so the navbar badge works.
    """
    user_id = session.get('user_id')
    if user_id:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM rental_requests
            WHERE owner_id = ? AND status = 'Pending';
        """, (user_id,))
        g.pending_requests_count = cursor.fetchone()[0]
        conn.close()
    else:
        g.pending_requests_count = 0

# -------------------------------------------------------------
# CATEGORY PRESET ASSETS HELPER
# -------------------------------------------------------------

def get_default_image_for_category(category):
    """Assigns a clean local SVG image if the user doesn't upload a photo."""
    cat_lower = category.lower()
    if 'stationery' in cat_lower or 'drawing' in cat_lower:
        return '/static/images/drafter.svg'
    elif 'calc' in cat_lower or 'tech' in cat_lower or 'electron' in cat_lower:
        return '/static/images/calculator.svg'
    elif 'book' in cat_lower or 'study' in cat_lower:
        return '/static/images/books.svg'
    elif 'lab' in cat_lower or 'medic' in cat_lower:
        return '/static/images/labcoat.svg'
    elif 'bike' in cat_lower or 'sport' in cat_lower:
        return '/static/images/bicycle.svg'
    else:
        return '/static/images/default_item.svg'

# -------------------------------------------------------------
# PUBLIC ROUTES
# -------------------------------------------------------------

@app.route('/')
def index():
    """Home landing page with hero, search, categories, and featured items."""
    conn = get_db()
    cursor = conn.cursor()

    # Get recent available items
    cursor.execute("""
        SELECT * FROM items 
        WHERE is_available = 1 
        ORDER BY id DESC 
        LIMIT 6;
    """)
    featured_items = cursor.fetchall()

    # Get total count of available items
    cursor.execute("SELECT COUNT(*) FROM items WHERE is_available = 1;")
    total_items_count = cursor.fetchone()[0]

    conn.close()
    return render_template('index.html', featured_items=featured_items, total_items_count=total_items_count)

@app.route('/browse')
def browse():
    """Catalog browse page with search, filters (category, type, sort)."""
    search_query = request.args.get('q', '').strip()
    category = request.args.get('category', '').strip()
    item_type = request.args.get('item_type', '').strip()
    sort_option = request.args.get('sort', 'newest').strip()

    conn = get_db()
    cursor = conn.cursor()

    # Base query
    sql = "SELECT * FROM items WHERE 1=1"
    params = []

    # Filter by search keyword
    if search_query:
        sql += " AND (title LIKE ? OR description LIKE ? OR location LIKE ?)"
        term = f"%{search_query}%"
        params.extend([term, term, term])

    # Filter by category
    if category:
        sql += " AND category = ?"
        params.append(category)

    # Filter by item listing type (Rent / Borrow / Giveaway)
    if item_type:
        sql += " AND item_type = ?"
        params.append(item_type)

    # Sorting
    if sort_option == 'price_asc':
        sql += " ORDER BY price ASC, id DESC"
    elif sort_option == 'price_desc':
        sql += " ORDER BY price DESC, id DESC"
    else:
        # Default newest first
        sql += " ORDER BY id DESC"

    cursor.execute(sql, params)
    items = cursor.fetchall()

    # List of all categories for dropdown
    categories = [
        "Stationery & Drawing",
        "Electronics",
        "Books",
        "Lab & Medical",
        "Bicycles & Sports",
        "Dorm & Living",
        "Other"
    ]

    conn.close()
    return render_template(
        'browse.html',
        items=items,
        categories=categories,
        current_query=search_query,
        current_category=category,
        current_type=item_type,
        current_sort=sort_option
    )

@app.route('/item/<int:item_id>')
def item_detail(item_id):
    """Detailed view of an individual item listing."""
    conn = get_db()
    cursor = conn.cursor()

    # Fetch item
    cursor.execute("SELECT * FROM items WHERE id = ?;", (item_id,))
    item = cursor.fetchone()

    if not item:
        conn.close()
        abort(404)

    # Fetch owner details
    cursor.execute("SELECT id, name, email, college, phone, bio, created_at FROM users WHERE id = ?;", (item['owner_id'],))
    owner = cursor.fetchone()

    conn.close()

    today_iso = date.today().isoformat()
    return render_template('item_detail.html', item=item, owner=owner, today_iso=today_iso)

# -------------------------------------------------------------
# ITEM MANAGEMENT (POST, EDIT, DELETE, MY ITEMS)
# -------------------------------------------------------------

@app.route('/item/new', methods=['GET', 'POST'])
@login_required
def post_item():
    """Allows logged-in students to post an unused item."""
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        category = request.form.get('category', '').strip()
        item_type = request.form.get('item_type', 'Rent').strip()
        price_raw = request.form.get('price', '0').strip()
        deposit_raw = request.form.get('deposit', '0').strip()
        location = request.form.get('location', '').strip()
        available_from = request.form.get('available_from', '').strip()
        available_until = request.form.get('available_until', '').strip()
        description = request.form.get('description', '').strip()

        # Server-side validation
        if not title or not category or not location or not available_from or not available_until or not description:
            flash('Please fill in all required fields marked with an asterisk (*).', 'danger')
            return redirect(url_for('post_item'))

        # Handle price and deposit according to Listing Type
        try:
            if item_type == 'Borrow (Free)':
                price = 0.0
                deposit_raw = request.form.get('deposit', '0').strip()
                deposit = float(deposit_raw) if deposit_raw else 0.0
                if deposit < 0:
                    flash('Deposit cannot be a negative number.', 'danger')
                    return redirect(url_for('post_item'))
            elif item_type == 'Reuse (Giveaway)':
                deposit = 0.0
                total_price_raw = (request.form.get('total_price') or request.form.get('price', '0')).strip()
                price = float(total_price_raw) if total_price_raw else 0.0
                if price < 0:
                    flash('Total price cannot be a negative number.', 'danger')
                    return redirect(url_for('post_item'))
            else:  # 'Rent'
                price_raw = request.form.get('price', '0').strip()
                deposit_raw = request.form.get('deposit', '0').strip()
                price = float(price_raw) if price_raw else 0.0
                deposit = float(deposit_raw) if deposit_raw else 0.0
                if price < 0 or deposit < 0:
                    flash('Rental price and deposit cannot be negative numbers.', 'danger')
                    return redirect(url_for('post_item'))
        except ValueError:
            flash('Please enter a valid numeric amount.', 'danger')
            return redirect(url_for('post_item'))

        if available_from > available_until:
            flash('The "Available From" date cannot be after the "Available Until" date.', 'danger')
            return redirect(url_for('post_item'))

        # Handle image file upload or default preset illustration
        image_path = get_default_image_for_category(category)
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename and allowed_file(file.filename):
                safe_name = secure_filename(file.filename)
                unique_name = f"{session['user_id']}_{int(datetime.now().timestamp())}_{safe_name}"
                dest_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
                file.save(dest_path)
                image_path = f"/static/uploads/{unique_name}"

        # Insert item into database
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO items (
                owner_id, title, description, category, item_type, price, deposit,
                location, available_from, available_until, image_path, is_available
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);
        """, (
            session['user_id'], title, description, category, item_type,
            price, deposit, location, available_from, available_until, image_path
        ))
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()

        flash(f'Your item "{title}" has been published successfully!', 'success')
        return redirect(url_for('item_detail', item_id=new_id))

    today_iso = date.today().isoformat()
    return render_template('post_item.html', today_iso=today_iso)

@app.route('/my-items')
@login_required
def my_items():
    """Dashboard showing all items posted by the logged-in student."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM items 
        WHERE owner_id = ? 
        ORDER BY id DESC;
    """, (session['user_id'],))
    user_items = cursor.fetchall()
    conn.close()
    return render_template('my_items.html', items=user_items)

@app.route('/item/<int:item_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_item(item_id):
    """Allows an owner to edit their listed item."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM items WHERE id = ?;", (item_id,))
    item = cursor.fetchone()

    if not item:
        conn.close()
        abort(404)

    # Security check: User must own this item
    if item['owner_id'] != session['user_id']:
        conn.close()
        flash('You are not authorized to edit this item.', 'danger')
        return redirect(url_for('browse'))

    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        category = request.form.get('category', '').strip()
        item_type = request.form.get('item_type', 'Rent').strip()
        price_raw = request.form.get('price', '0').strip()
        deposit_raw = request.form.get('deposit', '0').strip()
        location = request.form.get('location', '').strip()
        available_from = request.form.get('available_from', '').strip()
        available_until = request.form.get('available_until', '').strip()
        description = request.form.get('description', '').strip()
        is_available = 1 if request.form.get('is_available') else 0

        # Form validation
        if not title or not category or not location or not available_from or not available_until or not description:
            flash('All required fields must be filled.', 'danger')
            return redirect(url_for('edit_item', item_id=item_id))

        # Handle price and deposit according to Listing Type
        try:
            if item_type == 'Borrow (Free)':
                price = 0.0
                deposit_raw = request.form.get('deposit', '0').strip()
                deposit = float(deposit_raw) if deposit_raw else 0.0
                if deposit < 0:
                    flash('Deposit cannot be a negative number.', 'danger')
                    return redirect(url_for('edit_item', item_id=item_id))
            elif item_type == 'Reuse (Giveaway)':
                deposit = 0.0
                total_price_raw = (request.form.get('total_price') or request.form.get('price', '0')).strip()
                price = float(total_price_raw) if total_price_raw else 0.0
                if price < 0:
                    flash('Total price cannot be a negative number.', 'danger')
                    return redirect(url_for('edit_item', item_id=item_id))
            else:  # 'Rent'
                price_raw = request.form.get('price', '0').strip()
                deposit_raw = request.form.get('deposit', '0').strip()
                price = float(price_raw) if price_raw else 0.0
                deposit = float(deposit_raw) if deposit_raw else 0.0
                if price < 0 or deposit < 0:
                    flash('Rental price and deposit cannot be negative numbers.', 'danger')
                    return redirect(url_for('edit_item', item_id=item_id))
        except ValueError:
            flash('Invalid price or deposit entered.', 'danger')
            return redirect(url_for('edit_item', item_id=item_id))

        # Check for image replacement
        image_path = item['image_path']
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename and allowed_file(file.filename):
                safe_name = secure_filename(file.filename)
                unique_name = f"{session['user_id']}_{int(datetime.now().timestamp())}_{safe_name}"
                dest_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
                file.save(dest_path)
                image_path = f"/static/uploads/{unique_name}"

        cursor.execute("""
            UPDATE items SET
                title = ?, description = ?, category = ?, item_type = ?,
                price = ?, deposit = ?, location = ?, available_from = ?,
                available_until = ?, image_path = ?, is_available = ?
            WHERE id = ?;
        """, (
            title, description, category, item_type, price, deposit,
            location, available_from, available_until, image_path, is_available, item_id
        ))
        conn.commit()
        conn.close()

        flash('Your item listing has been updated!', 'success')
        return redirect(url_for('item_detail', item_id=item_id))

    conn.close()
    return render_template('edit_item.html', item=item)

@app.route('/item/<int:item_id>/delete', methods=['POST'])
@login_required
def delete_item(item_id):
    """Allows an owner to permanently delete an item."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT owner_id, title FROM items WHERE id = ?;", (item_id,))
    item = cursor.fetchone()

    if not item:
        conn.close()
        abort(404)

    # Security check: User must own this item
    if item['owner_id'] != session['user_id']:
        conn.close()
        flash('Unauthorized: You cannot delete another student’s item.', 'danger')
        return redirect(url_for('browse'))

    cursor.execute("DELETE FROM items WHERE id = ?;", (item_id,))
    conn.commit()
    conn.close()

    flash(f'Listing "{item["title"]}" has been removed.', 'info')
    return redirect(url_for('my_items'))

# -------------------------------------------------------------
# RENTAL & BORROW REQUESTS
# -------------------------------------------------------------

@app.route('/item/<int:item_id>/request', methods=['POST'])
@login_required
def request_item(item_id):
    """Submits a rental or borrow request for an item."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM items WHERE id = ?;", (item_id,))
    item = cursor.fetchone()

    if not item:
        conn.close()
        abort(404)

    # Security check: Cannot rent your own item
    if item['owner_id'] == session['user_id']:
        conn.close()
        flash("You cannot request your own item!", "warning")
        return redirect(url_for('item_detail', item_id=item_id))

    # Check if item is available
    if item['is_available'] != 1:
        conn.close()
        flash("This item is currently reserved or unavailable.", "warning")
        return redirect(url_for('item_detail', item_id=item_id))

    start_date = request.form.get('start_date', '').strip()
    end_date = request.form.get('end_date', '').strip()
    message = request.form.get('message', '').strip()

    if not start_date or not end_date:
        conn.close()
        flash("Please specify both start and return dates.", "danger")
        return redirect(url_for('item_detail', item_id=item_id))

    if start_date > end_date:
        conn.close()
        flash("Start date cannot be after the return date.", "danger")
        return redirect(url_for('item_detail', item_id=item_id))

    # Create request record
    cursor.execute("""
        INSERT INTO rental_requests (item_id, requester_id, owner_id, start_date, end_date, message, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending');
    """, (item_id, session['user_id'], item['owner_id'], start_date, end_date, message))
    req_id = cursor.lastrowid
    conn.commit()
    conn.close()

    flash('Your rental request has been submitted! The owner will review it.', 'success')
    return redirect(url_for('request_detail', request_id=req_id))

@app.route('/requests')
@login_required
def requests_dashboard():
    """Dashboard showing incoming requests (as owner) and outgoing requests (as borrower)."""
    user_id = session['user_id']
    conn = get_db()
    cursor = conn.cursor()

    # 1. Incoming requests: where I am the owner
    cursor.execute("""
        SELECT r.*, i.title as item_title, i.category, i.image_path as item_image,
               u.name as requester_name, u.college as requester_college, u.email as requester_email
        FROM rental_requests r
        JOIN items i ON r.item_id = i.id
        JOIN users u ON r.requester_id = u.id
        WHERE r.owner_id = ?
        ORDER BY r.id DESC;
    """, (user_id,))
    incoming_requests = cursor.fetchall()

    # 2. Outgoing requests: where I am the requester
    cursor.execute("""
        SELECT r.*, i.title as item_title, i.location as item_location, i.image_path as item_image,
               u.name as owner_name, u.email as owner_email
        FROM rental_requests r
        JOIN items i ON r.item_id = i.id
        JOIN users u ON r.owner_id = u.id
        WHERE r.requester_id = ?
        ORDER BY r.id DESC;
    """, (user_id,))
    outgoing_requests = cursor.fetchall()

    conn.close()
    return render_template('requests.html', incoming_requests=incoming_requests, outgoing_requests=outgoing_requests)

@app.route('/requests/<int:request_id>/respond/<action>', methods=['POST'])
@login_required
def respond_request(request_id, action):
    """Owner responds to a request: accepts or declines."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rental_requests WHERE id = ?;", (request_id,))
    req_record = cursor.fetchone()

    if not req_record:
        conn.close()
        abort(404)

    # Security check: Only the owner of the item can accept or reject
    if req_record['owner_id'] != session['user_id']:
        conn.close()
        flash('Unauthorized: You are not the owner of this requested item.', 'danger')
        return redirect(url_for('requests_dashboard'))

    if action == 'accept':
        cursor.execute("UPDATE rental_requests SET status = 'Accepted' WHERE id = ?;", (request_id,))
        # Optionally reserve the item
        cursor.execute("UPDATE items SET is_available = 0 WHERE id = ?;", (req_record['item_id'],))
        conn.commit()
        flash('Request accepted! Contact details and handover notes are now unlocked.', 'success')
    elif action == 'reject':
        cursor.execute("UPDATE rental_requests SET status = 'Rejected' WHERE id = ?;", (request_id,))
        conn.commit()
        flash('Request declined.', 'info')
    else:
        conn.close()
        abort(400)

    conn.close()
    return redirect(url_for('request_detail', request_id=request_id))

# -------------------------------------------------------------
# INTERNAL MESSAGING & CONTACT HANDOVER
# -------------------------------------------------------------

@app.route('/requests/<int:request_id>')
@login_required
def request_detail(request_id):
    """Detailed view of a request, showing handover details and internal message stream."""
    user_id = session['user_id']
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT r.*, 
               i.title as item_title, i.category, i.location as item_location, i.image_path as item_image,
               owner.name as owner_name, owner.email as owner_email, owner.phone as owner_phone, owner.college as owner_college,
               renter.name as requester_name, renter.email as requester_email, renter.phone as requester_phone, renter.college as requester_college
        FROM rental_requests r
        JOIN items i ON r.item_id = i.id
        JOIN users owner ON r.owner_id = owner.id
        JOIN users renter ON r.requester_id = renter.id
        WHERE r.id = ?;
    """, (request_id,))
    req_record = cursor.fetchone()

    if not req_record:
        conn.close()
        abort(404)

    # Security check: Only the requester OR the owner can view this request
    if user_id != req_record['requester_id'] and user_id != req_record['owner_id']:
        conn.close()
        flash('Unauthorized: You do not have permission to view this request.', 'danger')
        return redirect(url_for('requests_dashboard'))

    # Fetch message stream
    cursor.execute("""
        SELECT m.*, u.name as sender_name
        FROM request_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.request_id = ?
        ORDER BY m.id ASC;
    """, (request_id,))
    messages = cursor.fetchall()
    conn.close()

    is_owner = (user_id == req_record['owner_id'])
    return render_template('request_detail.html', req=req_record, messages=messages, is_owner=is_owner)

@app.route('/requests/<int:request_id>/messages', methods=['POST'])
@login_required
def send_request_message(request_id):
    """Adds a message to the internal request thread."""
    message_text = request.form.get('message', '').strip()
    if not message_text:
        flash('Cannot send an empty message.', 'warning')
        return redirect(url_for('request_detail', request_id=request_id))

    user_id = session['user_id']
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT requester_id, owner_id FROM rental_requests WHERE id = ?;", (request_id,))
    req_record = cursor.fetchone()

    if not req_record:
        conn.close()
        abort(404)

    # Security check: User must be part of this rental transaction
    if user_id != req_record['requester_id'] and user_id != req_record['owner_id']:
        conn.close()
        abort(403)

    cursor.execute("""
        INSERT INTO request_messages (request_id, sender_id, message)
        VALUES (?, ?, ?);
    """, (request_id, user_id, message_text))
    conn.commit()
    conn.close()

    return redirect(url_for('request_detail', request_id=request_id))

# -------------------------------------------------------------
# USER PROFILE & TRUST FEATURES
# -------------------------------------------------------------

@app.route('/user/<int:user_id>')
def profile(user_id):
    """Student profile showing campus info, listed items, and community trust stats."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, name, email, college, phone, bio, created_at FROM users WHERE id = ?;", (user_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        abort(404)

    # Get items listed by this user
    cursor.execute("SELECT * FROM items WHERE owner_id = ? ORDER BY id DESC;", (user_id,))
    user_items = cursor.fetchall()

    # Activity count (completed/accepted requests involving this user)
    cursor.execute("""
        SELECT COUNT(*) FROM rental_requests 
        WHERE (owner_id = ? OR requester_id = ?) AND status = 'Accepted';
    """, (user_id, user_id))
    activity_count = cursor.fetchone()[0]

    conn.close()
    return render_template('profile.html', profile_user=user, user_items=user_items, activity_count=activity_count)

@app.route('/report/<target_type>/<int:target_id>', methods=['GET', 'POST'])
@login_required
def report(target_type, target_id):
    """Campus Trust & Safety report form."""
    if target_type not in ['item', 'user']:
        abort(400)

    conn = get_db()
    cursor = conn.cursor()

    target_name = "Listing"
    if target_type == 'item':
        cursor.execute("SELECT title FROM items WHERE id = ?;", (target_id,))
        row = cursor.fetchone()
        if row:
            target_name = row['title']
    else:
        cursor.execute("SELECT name FROM users WHERE id = ?;", (target_id,))
        row = cursor.fetchone()
        if row:
            target_name = row['name']

    if request.method == 'POST':
        reason = request.form.get('reason', '').strip()
        details = request.form.get('details', '').strip()

        if not reason or not details:
            flash('Please provide both a reason and details for the report.', 'danger')
            return redirect(url_for('report', target_type=target_type, target_id=target_id))

        cursor.execute("""
            INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
            VALUES (?, ?, ?, ?, ?);
        """, (session['user_id'], target_type, target_id, reason, details))
        conn.commit()
        conn.close()

        flash('Thank you for helping keep our campus safe. Your report has been submitted to campus moderators.', 'success')
        return redirect(url_for('browse'))

    conn.close()
    return render_template('report.html', target_type=target_type, target_id=target_id, target_name=target_name)

# -------------------------------------------------------------
# AUTHENTICATION (SIGNUP, LOGIN, LOGOUT)
# -------------------------------------------------------------

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """Student registration route."""
    if session.get('user_id'):
        return redirect(url_for('browse'))

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip().lower()
        college = request.form.get('college', '').strip()
        phone = request.form.get('phone', '').strip()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')

        # Server-side validation
        if not name or not email or not college or not password:
            flash('Please complete all required fields.', 'danger')
            return render_template('signup.html')

        if password != confirm_password:
            flash('Passwords do not match. Please try again.', 'danger')
            return render_template('signup.html')

        if len(password) < 6:
            flash('Password must be at least 6 characters long.', 'danger')
            return render_template('signup.html')

        conn = get_db()
        cursor = conn.cursor()

        # Check if email is already taken
        cursor.execute("SELECT id FROM users WHERE email = ?;", (email,))
        if cursor.fetchone():
            conn.close()
            flash('An account with that email already exists. Please log in.', 'warning')
            return redirect(url_for('login'))

        # Securely hash the password
        password_hash = generate_password_hash(password)

        cursor.execute("""
            INSERT INTO users (name, email, password_hash, college, phone)
            VALUES (?, ?, ?, ?, ?);
        """, (name, email, password_hash, college, phone))
        conn.commit()
        new_user_id = cursor.lastrowid
        conn.close()

        # Automatically log the student in
        session['user_id'] = new_user_id
        session['user_name'] = name
        session['user_email'] = email

        flash(f'Welcome to ReCraft, {name}! Your campus account is ready.', 'success')
        return redirect(url_for('browse'))

    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Student login route."""
    if session.get('user_id'):
        return redirect(url_for('browse'))

    next_page = request.args.get('next')

    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        if not email or not password:
            flash('Please enter both your email and password.', 'danger')
            return render_template('login.html')

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?;", (email,))
        user = cursor.fetchone()
        conn.close()

        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['user_name'] = user['name']
            session['user_email'] = user['email']
            flash(f'Welcome back, {user["name"]}!', 'success')

            if next_page and next_page.startswith('/'):
                return redirect(next_page)
            return redirect(url_for('browse'))
        else:
            flash('Invalid email or password. Please verify and try again.', 'danger')

    return render_template('login.html')

@app.route('/logout')
def logout():
    """Logs the student out and clears the session."""
    session.clear()
    flash('You have been logged out successfully.', 'info')
    return redirect(url_for('index'))

# -------------------------------------------------------------
# ERROR HANDLERS
# -------------------------------------------------------------

@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(403)
def forbidden(e):
    flash('Forbidden: You do not have permission to perform this action.', 'danger')
    return redirect(url_for('index'))

# -------------------------------------------------------------
# RUNNER
# -------------------------------------------------------------

if __name__ == '__main__':
    # Read environment configurations
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ['true', '1']
    use_waitress = os.environ.get('USE_WAITRESS', 'True').lower() in ['true', '1'] and not debug_mode

    print(f"Starting ReCraft server on http://{host}:{port} (Debug: {debug_mode}) ...")

    if use_waitress:
        try:
            from waitress import serve
            print(f"Serving with production WSGI server (Waitress) on port {port}...")
            serve(app, host=host, port=port)
        except ImportError:
            app.run(debug=debug_mode, host=host, port=port)
    else:
        app.run(debug=debug_mode, host=host, port=port)

