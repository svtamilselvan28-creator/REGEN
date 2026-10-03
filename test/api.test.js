/**
 * test/api.test.js - Comprehensive Verification Suite for ReCraft Migration
 * Tests all Express routes, Nunjucks template rendering, and REST API endpoints.
 */

const http = require('http');
const app = require('../app');

let server;
let baseUrl;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        ...headers
      }
    };

    let payload = null;
    if (body) {
      if (typeof body === 'object') {
        payload = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
      } else {
        payload = body;
      }
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting ReCraft Node.js / Express Integration Tests ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Start test server on random open port
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Test server running on ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // TEST 1: Home Page (SSR)
    console.log('1. Testing Home Page (GET /)...');
    const homeRes = await makeRequest('GET', '/');
    assert(homeRes.status === 200, 'Home page returns HTTP 200');
    assert(homeRes.body.includes('ReCraft'), 'Home page contains brand name "ReCraft"');
    assert(homeRes.body.includes('Rent what you need'), 'Home page contains hero tagline');
    assert(!homeRes.body.includes('1,240+ Items Shared'), 'Home page does NOT contain removed stats section');

    // TEST 2: Browse Page (SSR)
    console.log('\n2. Testing Browse Page (GET /browse)...');
    const browseRes = await makeRequest('GET', '/browse');
    assert(browseRes.status === 200, 'Browse page returns HTTP 200');
    assert(browseRes.body.includes('Casio fx-991EX') || browseRes.body.includes('Mini Drafter'), 'Browse page lists items');
    assert(browseRes.body.includes('₹'), 'Browse page preserves Indian Rupee currency symbol');

    // TEST 3: Item Detail Page (SSR)
    console.log('\n3. Testing Item Detail Page (GET /item/1)...');
    const itemRes = await makeRequest('GET', '/item/1');
    assert(itemRes.status === 200, 'Item detail page returns HTTP 200');
    assert(itemRes.body.includes('Mini Drafter'), 'Item detail contains item title');
    assert(itemRes.body.includes('₹30.00') || itemRes.body.includes('30.00'), 'Item detail displays price formatted in Rupee');

    // TEST 4: REST API - Browse Items
    console.log('\n4. Testing REST API (GET /api/items)...');
    const apiItemsRes = await makeRequest('GET', '/api/items');
    assert(apiItemsRes.status === 200, '/api/items returns HTTP 200');
    const itemsData = JSON.parse(apiItemsRes.body);
    assert(itemsData.success === true, '/api/items success flag is true');
    assert(Array.isArray(itemsData.items) && itemsData.items.length > 0, '/api/items returns items array');

    // TEST 5: REST API - Student Signup
    console.log('\n5. Testing REST API Student Signup (POST /api/auth/signup)...');
    const testEmail = `student_${Date.now()}@campus.edu`;
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Test Student',
      email: testEmail,
      college: 'Information Technology',
      phone: '+91 99999 88888',
      password: 'password123',
      confirm_password: 'password123'
    });
    assert(signupRes.status === 201, '/api/auth/signup returns HTTP 201 Created');
    const signupData = JSON.parse(signupRes.body);
    assert(signupData.success === true, 'Signup succeeds');
    assert(Boolean(signupData.token), 'Signup returns JWT token');
    const authToken = signupData.token;

    // TEST 6: REST API - Student Login
    console.log('\n6. Testing REST API Student Login (POST /api/auth/login)...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: 'password123'
    });
    assert(loginRes.status === 200, '/api/auth/login returns HTTP 200');
    const loginData = JSON.parse(loginRes.body);
    assert(loginData.success === true, 'Login succeeds');
    assert(loginData.user.name === 'Test Student', 'Login returns user profile');

    // TEST 7: REST API - Post Item with Listing Type Rules
    console.log('\n7. Testing Post Item Listing Types (POST /api/items)...');
    
    // Borrow (Free) listing: deposit only
    const borrowItemRes = await makeRequest('POST', '/api/items', {
      title: 'Lab Apron for Bio Lab',
      description: 'Clean bio lab apron, free for use during exams.',
      category: 'Lab & Medical',
      item_type: 'Borrow (Free)',
      deposit: 100,
      location: 'Biology Building 202',
      available_from: '2026-10-05',
      available_until: '2026-11-05'
    }, { Authorization: `Bearer ${authToken}` });
    assert(borrowItemRes.status === 201, 'Post Borrow item returns HTTP 201');
    const borrowItemData = JSON.parse(borrowItemRes.body);
    assert(borrowItemData.item.price === 0, 'Borrow item price is 0 (Free)');
    assert(borrowItemData.item.deposit === 100, 'Borrow item deposit is preserved');

    // Reuse (Giveaway) listing: total price only
    const reuseItemRes = await makeRequest('POST', '/api/items', {
      title: 'Calculus 3 Study Notes & Formulas',
      description: 'Comprehensive handwritten semester notes.',
      category: 'Books',
      item_type: 'Reuse (Giveaway)',
      total_price: 150,
      location: 'Library 3rd Floor',
      available_from: '2026-10-05',
      available_until: '2026-12-05'
    }, { Authorization: `Bearer ${authToken}` });
    assert(reuseItemRes.status === 201, 'Post Reuse item returns HTTP 201');
    const reuseItemData = JSON.parse(reuseItemRes.body);
    assert(reuseItemData.item.price === 150, 'Reuse item price is total price');
    assert(reuseItemData.item.deposit === 0, 'Reuse item deposit is 0');

    // TEST 8: REST API - Rental Request & Workflow
    console.log('\n8. Testing Rental Request Flow (POST /api/requests)...');
    const reqRes = await makeRequest('POST', '/api/requests', {
      item_id: 1, // Mini drafter owned by user 3
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      message: 'Need this for architectural drafting midterms!'
    }, { Authorization: `Bearer ${authToken}` });
    assert(reqRes.status === 201, 'Create rental request returns HTTP 201');
    const reqData = JSON.parse(reqRes.body);
    assert(reqData.success === true, 'Request created successfully');
    const requestId = reqData.request.id;

    // Send internal message
    const msgRes = await makeRequest('POST', `/api/requests/${requestId}/messages`, {
      message: 'Can we meet at the campus cafe?'
    }, { Authorization: `Bearer ${authToken}` });
    assert(msgRes.status === 201, 'Send message on request thread returns HTTP 201');

    // TEST 9: User Profile (GET /user/1)
    console.log('\n9. Testing Public Student Profile (GET /user/1)...');
    const profileRes = await makeRequest('GET', '/user/1');
    assert(profileRes.status === 200, 'Student profile returns HTTP 200');
    assert(profileRes.body.includes('Alice Sharma'), 'Profile displays student name');

    // TEST 10: 404 Error Handling
    console.log('\n10. Testing 404 Handler...');
    const notFoundRes = await makeRequest('GET', '/non-existent-page-url');
    assert(notFoundRes.status === 404, 'Unknown URL returns HTTP 404');
    assert(notFoundRes.body.includes('404') || notFoundRes.body.includes('Page Not Found'), '404 page renders');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    console.log(`\n========================================`);
    console.log(` Tests Finished: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
