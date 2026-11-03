/**
 * SAMPLE USERS FOR FRONTEND DEVELOPMENT ONLY (names, emails and dates are illustrative).
 *
 * Verification (team decision, Nov 2026): every account verifies its email with a one-time code. That proves the
 * person owns the address, not that they are enrolled, so there is no "verified student" flag: verified accounts
 * show "Email verified", whatever the email domain. `emailType` only describes the sample address.
 */

/** The signed-in student in sample data (there is no real sign-in yet). */
export const MOCK_CURRENT_USER_ID = 'u-demo'

function user(id, name, { email, emailType = 'UNIVERSITY', emailVerified = true, campus = 'HANOI', programme, memberSince, bio = '', status = 'ACTIVE', role = 'STUDENT' }) {
  return {
    id,
    name,
    email,
    emailType,
    emailVerified,
    campus,
    programme,
    memberSince,
    bio,
    status, // ACTIVE | SUSPENDED (admin moderation)
    role,
  }
}

const list = [
  user('u-minh', 'Minh Nguyen', { email: 'minhnq@fpt.edu.vn', programme: 'Software Engineering · Year 2', memberSince: '2025-09-05', bio: 'Selling the textbooks and gear I no longer need. Usually reply within a few hours.' }),
  user('u-linh', 'Linh Tran', { email: 'linhtt@fpt.edu.vn', programme: 'Graphic Design · Year 3', memberSince: '2024-09-10', bio: 'Design student. Headphones, tablets and art supplies.' }),
  user('u-duc', 'Duc Pham', { email: 'ducpm@fpt.edu.vn', programme: 'Business Administration · Year 1', memberSince: '2026-09-01' }),
  user('u-anh', 'Anh Le', { email: 'anh.le.2005@gmail.com', emailType: 'PERSONAL', campus: 'HCMC', programme: 'Information Assurance · Year 2', memberSince: '2025-10-12' }),
  user('u-huy', 'Huy Do', { email: 'huydq@fpt.edu.vn', campus: 'DA_NANG', programme: 'Artificial Intelligence · Year 4', memberSince: '2023-09-15', bio: 'Final year, clearing out my dorm before graduation.' }),
  user('u-mai', 'Mai Vo', { email: 'maivt@fpt.edu.vn', programme: 'Digital Marketing · Year 2', memberSince: '2025-09-08' }),
  user('u-bao', 'Bao Hoang', { email: 'baohg@fpt.edu.vn', campus: 'HCMC', programme: 'Software Engineering · Year 3', memberSince: '2024-09-12' }),
  user('u-thao', 'Thao Nguyen', { email: 'thaont@fpt.edu.vn', programme: 'Business English · Year 1', memberSince: '2026-09-03' }),
  user('u-khoa', 'Khoa Tran', { email: 'khoa.tran.dev@gmail.com', emailType: 'PERSONAL', campus: 'DA_NANG', programme: 'Information Systems · Year 2', memberSince: '2025-09-20', status: 'SUSPENDED' }),
  user('u-ngoc', 'Ngoc Pham', { email: 'ngocpb@fpt.edu.vn', campus: 'CAN_THO', programme: 'Graphic Design · Year 1', memberSince: '2026-09-05' }),
  user('u-quan', 'Quan Vu', { email: 'quanvm@fpt.edu.vn', programme: 'Artificial Intelligence · Year 2', memberSince: '2025-09-14' }),
  user('u-lan', 'Lan Do', { email: 'lan.do.study@gmail.com', emailType: 'PERSONAL', emailVerified: false, programme: 'Digital Marketing · Year 1', memberSince: '2026-10-28' }),
  user('u-son', 'Son Le', { email: 'sonlh@fpt.edu.vn', campus: 'HCMC', programme: 'Software Engineering · Year 4', memberSince: '2023-09-11' }),
  user('u-vy', 'Vy Hoang', { email: 'vyhn@fpt.edu.vn', campus: 'CAN_THO', programme: 'Business Administration · Year 3', memberSince: '2024-09-18' }),
  user(MOCK_CURRENT_USER_ID, 'Demo Student', {
    email: 'demo.student@fpt.edu.vn',
    programme: 'Information Systems · Year 3',
    memberSince: '2024-09-01',
    bio: 'Information Systems student at Hoa Lac. Selling study gear and dorm items.',
  }),
]

/** All sample users by ID. */
export const MOCK_USERS = Object.fromEntries(list.map((u) => [u.id, u]))

/** The sample administrator shown in the admin workspace (not a student account). */
export const MOCK_ADMIN = { id: 'admin-1', name: 'UniMarket Admin', title: 'Moderator', email: 'admin@unimarket.local' }
