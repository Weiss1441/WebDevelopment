# TaskBoard – Full-Stack Web Application

TaskBoard is a full-stack web application for creating and managing tasks.
The project includes a Node.js + Express backend, a web-based frontend UI,
and a MongoDB Atlas database. All CRUD operations are available directly
through the web interface.

---

## Team Members
- Nurym
- Iskander
- Group: SE-2427

---

## Project Topic
This project demonstrates the development of a production-ready full-stack
web application. Users can create, view, update, and delete tasks using a
browser-based interface connected to a REST API.

The project was developed as part of **Assignment 3 – Part 2** and extends
Assignment 3 – Part 1 by adding:
- a frontend web interface,
- MongoDB Atlas as a production database,
- deployment to a public hosting platform.

---

## Technology Stack

### Backend
- Node.js
- Express.js
- MongoDB (MongoDB Atlas)
- REST API

### Frontend
- HTML
- CSS
- JavaScript (Fetch API)

### Deployment
- Public hosting platform (Render)
- Environment variables for production configuration

---

## Database
- Database: MongoDB Atlas
- Database Name: `taskboard_db`
- Collection: `tasks`

### Document Structure
- `_id` – MongoDB ObjectId
- `title` – string
- `details` – string
- `status` – todo | in-progress | done
- `createdAt` – Date
- `updatedAt` – Date (optional)

---

## Pages (Web Interface)

### `/` – Home Page
- Main landing page of the application
- Navigation links to all pages
- API test links

---

### `/tasks` – Task Management Page
- Main web interface of the application
- Displays tasks as a list (catalog view)
- Allows:
  - Creating new tasks
  - Updating existing tasks
  - Deleting tasks
- Data is loaded dynamically from the backend API using `fetch()`
- No Postman usage required

---

### `/contact`
- Demo contact form
- Simulates form submission handling

---

## API Routes

### `GET /api/tasks`
- Returns all tasks in JSON format
- Optional query parameters:
  - `title` – strict title filter (case-insensitive)
  - `sort` – sorting (e.g. `title`, `-createdAt`)
- Status Codes:
  - 200 OK
  - 500 Internal Server Error

---

### `GET /api/tasks/:id`
- Returns a single task by ID
- Validation:
  - ID must be a valid MongoDB ObjectId
- Status Codes:
  - 200 OK
  - 400 Bad Request
  - 404 Not Found

---

### `POST /api/tasks`
- Creates a new task
- Request Body:
  - `title` (string, required)
  - `details` (string, required)
  - `status` (string, optional)
- Status Codes:
  - 201 Created
  - 400 Bad Request
  - 500 Internal Server Error

---

### `PUT /api/tasks/:id`
- Updates an existing task
- Request Body:
  - `title` (string, required)
  - `details` (string, required)
  - `status` (string)
- Status Codes:
  - 200 OK
  - 400 Bad Request
  - 404 Not Found

---

### `DELETE /api/tasks/:id`
- Deletes a task by ID
- Status Codes:
  - 200 OK
  - 400 Bad Request
  - 404 Not Found

---

### `GET /api/info`
- Returns project metadata in JSON format

