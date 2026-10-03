/**
 * lib/supabase.js - Supabase Client & Database Services
 * Handles Supabase PostgreSQL database connections and storage uploads.
 * If credentials are not set, falls back to a development in-memory store
 * to facilitate local testing before live deployment.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('your-supabase-url') &&
  !supabaseKey.includes('your-anon-key')
);

if (isSupabaseConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    console.log('[Supabase] Successfully connected to Supabase PostgreSQL at:', supabaseUrl);
  } catch (err) {
    console.error('[Supabase] Error initializing Supabase client:', err.message);
  }
} else {
  console.warn('[Supabase] SUPABASE_URL / SUPABASE_ANON_KEY not configured. Running with in-memory dev database.');
}

// -------------------------------------------------------------
// LOCAL FALLBACK SEED DATA (Used when Supabase is not configured)
// -------------------------------------------------------------
const mockUsers = [
  {
    id: 1,
    name: 'Alice Sharma',
    email: 'alice@campus.edu',
    password_hash: '$2a$10$3pt1EgbO3boFTnLwzVsyre8raUa.xAxmwZ2jEwq8Qy5jAgBo2oGVW', // password123
    college: 'School of Engineering',
    phone: '+91 98765 43210',
    bio: 'Third-year Mechanical Engineering student. Passionate about robotics and 3D printing.',
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Rohan Verma',
    email: 'rohan@campus.edu',
    password_hash: '$2a$10$3pt1EgbO3boFTnLwzVsyre8raUa.xAxmwZ2jEwq8Qy5jAgBo2oGVW', // password123
    college: 'Department of Computer Science',
    phone: '+91 91234 56789',
    bio: 'CS sophomore. Love coding, open-source hardware, and sharing campus essentials.',
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    name: 'Priya Patel',
    email: 'priya@campus.edu',
    password_hash: '$2a$10$3pt1EgbO3boFTnLwzVsyre8raUa.xAxmwZ2jEwq8Qy5jAgBo2oGVW', // password123
    college: 'Faculty of Architecture & Design',
    phone: '+91 99887 76655',
    bio: 'Fourth-year Architecture student. Have lots of drafting instruments available!',
    created_at: new Date().toISOString()
  }
];

const mockItems = [
  {
    id: 1,
    owner_id: 3,
    title: 'Professional Mini Drafter with Cover',
    description: 'High precision steel mini-drafter for Engineering Graphics and Architecture studios. Comes with protective carrying pouch.',
    category: 'Stationery & Drawing',
    item_type: 'Rent',
    price: 30.00,
    deposit: 150.00,
    location: 'Architecture Studio, North Campus',
    available_from: '2026-10-01',
    available_until: '2026-12-15',
    image_path: '/static/images/drafter.svg',
    is_available: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    owner_id: 2,
    title: 'Casio fx-991EX ClassWiz Scientific Calculator',
    description: 'Advanced scientific calculator with 552 functions. Essential for calculus, matrix calculations, and thermodynamics exams.',
    category: 'Electronics',
    item_type: 'Borrow (Free)',
    price: 0.00,
    deposit: 300.00,
    location: 'Hostel Block C, Room 204',
    available_from: '2026-10-01',
    available_until: '2026-11-30',
    image_path: '/static/images/calculator.svg',
    is_available: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    owner_id: 1,
    title: 'Engineering Physics & Mathematics Reference Set',
    description: 'Set of reference textbooks including Higher Engineering Mathematics by B.S. Grewal and Concepts of Physics.',
    category: 'Books',
    item_type: 'Reuse (Giveaway)',
    price: 250.00,
    deposit: 0.00,
    location: 'Central Campus Library Foyer',
    available_from: '2026-10-01',
    available_until: '2026-12-31',
    image_path: '/static/images/books.svg',
    is_available: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 4,
    owner_id: 1,
    title: 'Cotton Chemistry Lab Coat (Medium)',
    description: '100% white cotton protective lab coat with buttons and front pockets. Washed and sanitized, fits height 5ft 5in to 5ft 10in.',
    category: 'Lab & Medical',
    item_type: 'Rent',
    price: 20.00,
    deposit: 100.00,
    location: 'Science Block, Room 102',
    available_from: '2026-10-01',
    available_until: '2026-12-31',
    image_path: '/static/images/labcoat.svg',
    is_available: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 5,
    owner_id: 2,
    title: 'Single-Speed Campus Commuter Bicycle',
    description: 'Reliable single-speed bicycle with front basket, bell, and heavy-duty combination lock. Ideal for quick trips between hostels.',
    category: 'Bicycles & Sports',
    item_type: 'Rent',
    price: 50.00,
    deposit: 500.00,
    location: 'East Gate Cycle Stand',
    available_from: '2026-10-01',
    available_until: '2026-11-15',
    image_path: '/static/images/bicycle.svg',
    is_available: 1,
    created_at: new Date().toISOString()
  }
];

const mockRequests = [];
const mockMessages = [];
const mockReports = [];

let nextUserId = 4;
let nextItemId = 6;
let nextReqId = 1;
let nextMsgId = 1;
let nextReportId = 1;

// -------------------------------------------------------------
// HELPER FOR DEFAULT CATEGORY IMAGES
// -------------------------------------------------------------
function getDefaultImageForCategory(category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('stationery') || cat.includes('drawing')) {
    return '/static/images/drafter.svg';
  } else if (cat.includes('calc') || cat.includes('tech') || cat.includes('electron')) {
    return '/static/images/calculator.svg';
  } else if (cat.includes('book') || cat.includes('study')) {
    return '/static/images/books.svg';
  } else if (cat.includes('lab') || cat.includes('medic')) {
    return '/static/images/labcoat.svg';
  } else if (cat.includes('bike') || cat.includes('sport')) {
    return '/static/images/bicycle.svg';
  } else {
    return '/static/images/default_item.svg';
  }
}

// -------------------------------------------------------------
// DB SERVICE METHODS (Supabase with Mock Fallback)
// -------------------------------------------------------------

const db = {
  isConfigured: () => isSupabaseConfigured,

  // USERS
  users: {
    async findByEmail(email) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', email.toLowerCase().trim())
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
      }
      return mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase().trim()) || null;
    },

    async findById(id) {
      const numId = Number(id);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, college, phone, bio, created_at')
          .eq('id', numId)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
      }
      const u = mockUsers.find(u => u.id === numId);
      if (!u) return null;
      const { password_hash, ...safeUser } = u;
      return safeUser;
    },

    async create({ name, email, password_hash, college, phone, bio }) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('users')
          .insert([{
            name,
            email: email.toLowerCase().trim(),
            password_hash,
            college,
            phone: phone || null,
            bio: bio || null
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const newUser = {
        id: nextUserId++,
        name,
        email: email.toLowerCase().trim(),
        password_hash,
        college,
        phone: phone || null,
        bio: bio || null,
        created_at: new Date().toISOString()
      };
      mockUsers.push(newUser);
      return newUser;
    }
  },

  // ITEMS
  items: {
    async list({ search, category, item_type, sort, limit } = {}) {
      if (isSupabaseConfigured) {
        let query = supabase.from('items').select('*');

        if (search) {
          query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`);
        }
        if (category) {
          query = query.eq('category', category);
        }
        if (item_type) {
          query = query.eq('item_type', item_type);
        }

        if (sort === 'price_asc') {
          query = query.order('price', { ascending: true }).order('id', { ascending: false });
        } else if (sort === 'price_desc') {
          query = query.order('price', { ascending: false }).order('id', { ascending: false });
        } else {
          query = query.order('id', { ascending: false });
        }

        if (limit) {
          query = query.limit(limit);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(item => ({
          ...item,
          price: Number(item.price),
          deposit: Number(item.deposit)
        }));
      }

      let res = [...mockItems];
      if (search) {
        const q = search.toLowerCase();
        res = res.filter(it => 
          (it.title && it.title.toLowerCase().includes(q)) ||
          (it.description && it.description.toLowerCase().includes(q)) ||
          (it.location && it.location.toLowerCase().includes(q))
        );
      }
      if (category) {
        res = res.filter(it => it.category === category);
      }
      if (item_type) {
        res = res.filter(it => it.item_type === item_type);
      }
      if (sort === 'price_asc') {
        res.sort((a, b) => a.price - b.price || b.id - a.id);
      } else if (sort === 'price_desc') {
        res.sort((a, b) => b.price - a.price || b.id - a.id);
      } else {
        res.sort((a, b) => b.id - a.id);
      }
      if (limit) {
        res = res.slice(0, limit);
      }
      return res;
    },

    async countAvailable() {
      if (isSupabaseConfigured) {
        const { count, error } = await supabase
          .from('items')
          .select('*', { count: 'exact', head: true })
          .eq('is_available', 1);
        if (error) throw error;
        return count || 0;
      }
      return mockItems.filter(it => it.is_available === 1).length;
    },

    async findById(id) {
      const numId = Number(id);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('id', numId)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return null;
        return {
          ...data,
          price: Number(data.price),
          deposit: Number(data.deposit)
        };
      }
      return mockItems.find(it => it.id === numId) || null;
    },

    async findByOwnerId(ownerId) {
      const numId = Number(ownerId);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('owner_id', numId)
          .order('id', { ascending: false });
        if (error) throw error;
        return (data || []).map(item => ({
          ...item,
          price: Number(item.price),
          deposit: Number(item.deposit)
        }));
      }
      return mockItems.filter(it => it.owner_id === numId).sort((a, b) => b.id - a.id);
    },

    async create(itemData) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('items')
          .insert([{
            owner_id: itemData.owner_id,
            title: itemData.title,
            description: itemData.description,
            category: itemData.category,
            item_type: itemData.item_type || 'Rent',
            price: Number(itemData.price || 0),
            deposit: Number(itemData.deposit || 0),
            location: itemData.location,
            available_from: itemData.available_from,
            available_until: itemData.available_until,
            image_path: itemData.image_path,
            is_available: 1
          }])
          .select()
          .single();
        if (error) throw error;
        return {
          ...data,
          price: Number(data.price),
          deposit: Number(data.deposit)
        };
      }

      const newItem = {
        id: nextItemId++,
        ...itemData,
        price: Number(itemData.price || 0),
        deposit: Number(itemData.deposit || 0),
        is_available: 1,
        created_at: new Date().toISOString()
      };
      mockItems.unshift(newItem);
      return newItem;
    },

    async update(id, itemData) {
      const numId = Number(id);
      if (isSupabaseConfigured) {
        const updatePayload = {};
        if (itemData.title !== undefined) updatePayload.title = itemData.title;
        if (itemData.description !== undefined) updatePayload.description = itemData.description;
        if (itemData.category !== undefined) updatePayload.category = itemData.category;
        if (itemData.item_type !== undefined) updatePayload.item_type = itemData.item_type;
        if (itemData.price !== undefined) updatePayload.price = Number(itemData.price);
        if (itemData.deposit !== undefined) updatePayload.deposit = Number(itemData.deposit);
        if (itemData.location !== undefined) updatePayload.location = itemData.location;
        if (itemData.available_from !== undefined) updatePayload.available_from = itemData.available_from;
        if (itemData.available_until !== undefined) updatePayload.available_until = itemData.available_until;
        if (itemData.image_path !== undefined) updatePayload.image_path = itemData.image_path;
        if (itemData.is_available !== undefined) updatePayload.is_available = itemData.is_available;

        const { data, error } = await supabase
          .from('items')
          .update(updatePayload)
          .eq('id', numId)
          .select()
          .single();
        if (error) throw error;
        return {
          ...data,
          price: Number(data.price),
          deposit: Number(data.deposit)
        };
      }

      const index = mockItems.findIndex(it => it.id === numId);
      if (index === -1) return null;
      mockItems[index] = {
        ...mockItems[index],
        ...itemData,
        price: Number(itemData.price !== undefined ? itemData.price : mockItems[index].price),
        deposit: Number(itemData.deposit !== undefined ? itemData.deposit : mockItems[index].deposit)
      };
      return mockItems[index];
    },

    async delete(id) {
      const numId = Number(id);
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('items')
          .delete()
          .eq('id', numId);
        if (error) throw error;
        return true;
      }
      const index = mockItems.findIndex(it => it.id === numId);
      if (index !== -1) {
        mockItems.splice(index, 1);
        return true;
      }
      return false;
    }
  },

  // RENTAL REQUESTS
  requests: {
    async create({ item_id, requester_id, owner_id, start_date, end_date, message }) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('rental_requests')
          .insert([{
            item_id: Number(item_id),
            requester_id: Number(requester_id),
            owner_id: Number(owner_id),
            start_date,
            end_date,
            message: message || null,
            status: 'Pending'
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const newReq = {
        id: nextReqId++,
        item_id: Number(item_id),
        requester_id: Number(requester_id),
        owner_id: Number(owner_id),
        start_date,
        end_date,
        message: message || '',
        status: 'Pending',
        created_at: new Date().toISOString()
      };
      mockRequests.unshift(newReq);
      return newReq;
    },

    async findById(id) {
      const numId = Number(id);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('rental_requests')
          .select(`
            *,
            items:item_id (title, category, location, image_path),
            owner:owner_id (name, email, phone, college),
            requester:requester_id (name, email, phone, college)
          `)
          .eq('id', numId)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return null;

        return {
          id: data.id,
          item_id: data.item_id,
          requester_id: data.requester_id,
          owner_id: data.owner_id,
          start_date: data.start_date,
          end_date: data.end_date,
          message: data.message,
          status: data.status,
          created_at: data.created_at,
          item_title: data.items?.title,
          category: data.items?.category,
          item_location: data.items?.location,
          item_image: data.items?.image_path,
          owner_name: data.owner?.name,
          owner_email: data.owner?.email,
          owner_phone: data.owner?.phone,
          owner_college: data.owner?.college,
          requester_name: data.requester?.name,
          requester_email: data.requester?.email,
          requester_phone: data.requester?.phone,
          requester_college: data.requester?.college
        };
      }

      const req = mockRequests.find(r => r.id === numId);
      if (!req) return null;

      const item = mockItems.find(i => i.id === req.item_id) || {};
      const owner = mockUsers.find(u => u.id === req.owner_id) || {};
      const requester = mockUsers.find(u => u.id === req.requester_id) || {};

      return {
        ...req,
        item_title: item.title,
        category: item.category,
        item_location: item.location,
        item_image: item.image_path,
        owner_name: owner.name,
        owner_email: owner.email,
        owner_phone: owner.phone,
        owner_college: owner.college,
        requester_name: requester.name,
        requester_email: requester.email,
        requester_phone: requester.phone,
        requester_college: requester.college
      };
    },

    async getIncoming(ownerId) {
      const numId = Number(ownerId);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('rental_requests')
          .select(`
            *,
            items:item_id (title, category, image_path),
            requester:requester_id (name, email, college)
          `)
          .eq('owner_id', numId)
          .order('id', { ascending: false });
        if (error) throw error;

        return (data || []).map(r => ({
          ...r,
          item_title: r.items?.title,
          category: r.items?.category,
          item_image: r.items?.image_path,
          requester_name: r.requester?.name,
          requester_email: r.requester?.email,
          requester_college: r.requester?.college
        }));
      }

      return mockRequests
        .filter(r => r.owner_id === numId)
        .map(r => {
          const item = mockItems.find(i => i.id === r.item_id) || {};
          const requester = mockUsers.find(u => u.id === r.requester_id) || {};
          return {
            ...r,
            item_title: item.title,
            category: item.category,
            item_image: item.image_path,
            requester_name: requester.name,
            requester_email: requester.email,
            requester_college: requester.college
          };
        })
        .sort((a, b) => b.id - a.id);
    },

    async getOutgoing(requesterId) {
      const numId = Number(requesterId);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('rental_requests')
          .select(`
            *,
            items:item_id (title, location, image_path),
            owner:owner_id (name, email)
          `)
          .eq('requester_id', numId)
          .order('id', { ascending: false });
        if (error) throw error;

        return (data || []).map(r => ({
          ...r,
          item_title: r.items?.title,
          item_location: r.items?.location,
          item_image: r.items?.image_path,
          owner_name: r.owner?.name,
          owner_email: r.owner?.email
        }));
      }

      return mockRequests
        .filter(r => r.requester_id === numId)
        .map(r => {
          const item = mockItems.find(i => i.id === r.item_id) || {};
          const owner = mockUsers.find(u => u.id === r.owner_id) || {};
          return {
            ...r,
            item_title: item.title,
            item_location: item.location,
            item_image: item.image_path,
            owner_name: owner.name,
            owner_email: owner.email
          };
        })
        .sort((a, b) => b.id - a.id);
    },

    async updateStatus(id, status, itemId = null) {
      const numId = Number(id);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('rental_requests')
          .update({ status })
          .eq('id', numId)
          .select()
          .single();
        if (error) throw error;

        if (status === 'Accepted' && itemId) {
          await supabase.from('items').update({ is_available: 0 }).eq('id', Number(itemId));
        }
        return data;
      }

      const req = mockRequests.find(r => r.id === numId);
      if (req) {
        req.status = status;
        if (status === 'Accepted' && (itemId || req.item_id)) {
          const item = mockItems.find(i => i.id === (itemId || req.item_id));
          if (item) item.is_available = 0;
        }
      }
      return req;
    },

    async getPendingCount(ownerId) {
      const numId = Number(ownerId);
      if (isSupabaseConfigured) {
        const { count, error } = await supabase
          .from('rental_requests')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', numId)
          .eq('status', 'Pending');
        if (error) throw error;
        return count || 0;
      }
      return mockRequests.filter(r => r.owner_id === numId && r.status === 'Pending').length;
    },

    async getActivityCount(userId) {
      const numId = Number(userId);
      if (isSupabaseConfigured) {
        const { count, error } = await supabase
          .from('rental_requests')
          .select('*', { count: 'exact', head: true })
          .or(`owner_id.eq.${numId},requester_id.eq.${numId}`)
          .eq('status', 'Accepted');
        if (error) throw error;
        return count || 0;
      }
      return mockRequests.filter(r => 
        (r.owner_id === numId || r.requester_id === numId) && r.status === 'Accepted'
      ).length;
    }
  },

  // MESSAGES
  messages: {
    async getByRequestId(requestId) {
      const numId = Number(requestId);
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('request_messages')
          .select(`
            *,
            users:sender_id (name)
          `)
          .eq('request_id', numId)
          .order('id', { ascending: true });
        if (error) throw error;

        return (data || []).map(m => ({
          ...m,
          sender_name: m.users?.name
        }));
      }

      return mockMessages
        .filter(m => m.request_id === numId)
        .map(m => {
          const sender = mockUsers.find(u => u.id === m.sender_id) || {};
          return {
            ...m,
            sender_name: sender.name
          };
        })
        .sort((a, b) => a.id - b.id);
    },

    async create({ request_id, sender_id, message }) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('request_messages')
          .insert([{
            request_id: Number(request_id),
            sender_id: Number(sender_id),
            message
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const newMsg = {
        id: nextMsgId++,
        request_id: Number(request_id),
        sender_id: Number(sender_id),
        message,
        created_at: new Date().toISOString()
      };
      mockMessages.push(newMsg);
      return newMsg;
    }
  },

  // REPORTS
  reports: {
    async create({ reporter_id, target_type, target_id, reason, details }) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('reports')
          .insert([{
            reporter_id: Number(reporter_id),
            target_type,
            target_id: Number(target_id),
            reason,
            details: details || null
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const newReport = {
        id: nextReportId++,
        reporter_id: Number(reporter_id),
        target_type,
        target_id: Number(target_id),
        reason,
        details: details || null,
        created_at: new Date().toISOString()
      };
      mockReports.push(newReport);
      return newReport;
    }
  },

  // STORAGE UPLOAD (Supabase Storage bucket 'item-images')
  storage: {
    async uploadImage(fileBuffer, originalName, mimeType, userId) {
      const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
      const fileName = `${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
      
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.storage
            .from('item-images')
            .upload(fileName, fileBuffer, {
              contentType: mimeType || 'image/jpeg',
              upsert: true
            });
          
          if (error) {
            console.error('[Supabase Storage Upload Error]', error.message);
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('item-images')
              .getPublicUrl(fileName);
            if (publicUrlData?.publicUrl) {
              return publicUrlData.publicUrl;
            }
          }
        } catch (uploadErr) {
          console.error('[Supabase Storage Exception]', uploadErr.message);
        }
      }

      // Local fallback: save to static/uploads
      try {
        const uploadsDir = path.join(__dirname, '..', 'static', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, fileBuffer);
        return `/static/uploads/${fileName}`;
      } catch (localErr) {
        console.error('[Local Upload Save Error]', localErr.message);
        return '/static/images/default_item.svg';
      }
    }
  },

  getDefaultImageForCategory
};

module.exports = { db, supabase };
