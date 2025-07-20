# 🎟️ EventFlowBackend API

This repository contains the **backend API** for the **EventFlow** application – a robust system to manage and book events. Built with **Node.js**, **Express**, and **MySQL**, it features **JWT authentication**, **role-based access control**, and **image uploads via Cloudinary**.

---

## 📚 Table of Contents

- [✨ Features](#-features)
- [🛠 Technologies Used](#-technologies-used)
- [📦 Prerequisites](#-prerequisites)
- [📡 API Endpoints](#-api-endpoints)
- [🌍 Deployment](#-deployment)

---

## ✨ Features

- 🔐 **JWT-based User Authentication**
- 🛡 **Role-Based Access Control** (`user`, `organizer`, `admin`)
- 📅 **Event Management** with image support (Cloudinary)
- 📥 **Event Booking System** with cancellation support
- 🔒 **Password Hashing** using bcryptjs
- 🌐 **CORS Handling** for cross-origin support
- ☁️ **Cloudinary Integration** for image uploads

---

## 🛠 Technologies Used

- **Node.js** + **Express.js**
- **MySQL** (via `mysql2`)
- **JWT** for stateless authentication
- **bcryptjs**, **dotenv**, **cors**, **multer**
- **Cloudinary** (image uploads)

---

## 📦 Prerequisites

- Node.js (LTS recommended)
- npm
- MySQL Server

---

## 📡 API Endpoints
- All endpoints are prefixed with /api

## 🔐 Auth
POST /api/auth/register
- Register new user
- body: { username, email, password }

POST /api/auth/login
- Login and get token
- body: { email, password }
- response: { token, userId, username, role }

---

## 📅 Events
GET /api/events
- Get all events (auth required)

GET /api/events/:id
- Get event by ID (auth required)

POST /api/events
- Create event (organizer/admin only)
- multipart/form-data: title, description, date, location, capacity, image

PUT /api/events/:id
- Update event (creator or admin only)

DELETE /api/events/:id
- Delete event (creator or admin only)

---

## 📥 Bookings
POST /api/bookings
- Book an event
- body: { eventId }

GET /api/bookings/my
- View user's bookings

DELETE /api/bookings/:id
- Cancel booking
  
---

## 🌍 Deployment (e.g., Render)
- Configure environment variables in Render
- Ensure DB access (Aiven/MySQL)
- Set proper CORS for your frontend domain

---

