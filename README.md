# Library System (HTML/CSS/JS)

Offline-first library system with student registration, login, book browsing, and borrow requests.

## Features

### Students
- Register with name, age, course/strand, year, section, address, and email (contact number optional)
- Login using email and password
- View available books and how many copies are left
- Request to borrow a book (sent to admin for approval)
- Track borrow request status (pending, approved, rejected)

### Admin
- Login with default admin account
- Add, update, delete, and view books
- Import books from Excel (.xlsx/.xls)
- Export books to Excel
- Review and approve/reject student borrow requests
- Optional online sync via POST endpoint

## How to use
1. Open `index.html` or `login.html` in your browser.
2. **Register** as a student at `register.html`, or sign in as admin:
   - Login: `admin`
   - Password: `admin123`
3. Students are redirected to the **Student Portal** to browse books and request borrows.
4. Admins are redirected to the **Admin Dashboard** to manage books and review requests.

## Pages

| Page | Purpose |
|------|---------|
| `index.html` | Entry point — redirects to login or dashboard |
| `login.html` | Sign in |
| `register.html` | Student registration |
| `student.html` | Browse books and request borrows |
| `admin.html` | Manage books and borrow requests |

## Data storage (localStorage)
| Key | Contents |
|-----|----------|
| `library_users_v1` | Registered users |
| `library_session_v1` | Current login session |
| `library_books_v1` | Book catalog |
| `library_borrow_requests_v1` | Borrow requests |

## Notes
- This is a browser-only demo. Data is stored locally and is not shared across devices.
- Passwords are stored in plain text in localStorage — suitable for school projects only, not production.
- SheetJS (CDN) is used for Excel import/export on the admin page.
