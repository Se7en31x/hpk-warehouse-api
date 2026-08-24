# 🏥 HPK Warehouse Management — Backend API

> RESTful API สำหรับระบบบริหารจัดการคลังเวชภัณฑ์โรงพยาบาล  
> Built with **Express.js 5**, **Prisma ORM**, **PostgreSQL (Supabase)**, and **Socket.IO**

[![Express.js](https://img.shields.io/badge/Express.js-5-000000?logo=express)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql)](https://supabase.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io)](https://socket.io/)
[![Azure](https://img.shields.io/badge/Deploy-Azure_Web_App-0078D4?logo=microsoft-azure)](https://azure.microsoft.com/)

---

## 📖 Overview

HPK Warehouse API เป็น Backend ของระบบบริหารจัดการคลังเวชภัณฑ์ ให้บริการ RESTful API สำหรับจัดการสินค้าคงคลัง, ใบเบิก-ยืม-คืน, Lot tracking, ครุภัณฑ์, รายงาน และ Real-time Notifications

### 🏗️ Architecture Pattern

ใช้ **Layered Architecture** แบ่ง Responsibility ชัดเจน:

```
Request → Routes → Controller → Service → Repository → Prisma → PostgreSQL
                      ↓
                     DTO (Validation & Transformation)
```

| Layer | Responsibility |
|---|---|
| **Routes** | Route definition + middleware binding |
| **Controllers** | HTTP handling, request parsing, response formatting |
| **DTOs** | Data validation & transformation (input sanitization) |
| **Services** | Business logic & orchestration |
| **Repositories** | Data access (Prisma queries) |
| **Adapters** | Integration กับ external systems (e.g. Dispense adapter) |

---

## ✨ Features

### Core Modules

| Module | Endpoints | Description |
|---|---|---|
| **Items** | `/api/v1/items` | CRUD เวชภัณฑ์ + Barcode, รูปภาพ (Cloudinary) |
| **Lots** | `/api/v1/lots` | จัดการ Lot (Lot Code, หมดอายุ, ราคาทุน, FIFO) |
| **Categories** | `/api/v1/categories` | หมวดหมู่เวชภัณฑ์ + Code Prefix |
| **Units** | `/api/v1/units` | หน่วยนับ |
| **Warehouses** | `/api/v1/warehouses` | คลังสินค้า |
| **Suppliers** | `/api/v1/suppliers` | ข้อมูลผู้จำหน่าย + บัญชีธนาคาร |

### Inventory Operations

| Module | Endpoints | Description |
|---|---|---|
| **Receives** | `/api/v1/receives` | รับเข้าสต็อก (รองรับ Batch, หลาย Lot ต่อ 1 ใบรับ) |
| **Requisitions** | `/api/v1/requisitions` | ใบเบิกเวชภัณฑ์ (DRAFT→APPROVED→ALLOCATED→ISSUED) |
| **Borrows** | `/api/v1/borrows` | ยืม-คืนเวชภัณฑ์ พร้อม Return verification |
| **Stock Movements** | `/api/v1/stock-movements` | ประวัติเคลื่อนไหวสต็อก (IN, OUT, ADJUST, TRANSFER) |

### Asset Management

| Module | Endpoints | Description |
|---|---|---|
| **Assets** | `/api/v1/assets` | ครุภัณฑ์การแพทย์ (Medical Assets) + Asset Code tracking |
| **Reusable Items** | `/api/v1/reusable-items` | ครุภัณฑ์หมุนเวียน — Unit-level tracking, เบิก/จ่าย/คืน/โอน |

### Supporting Features

| Module | Endpoints | Description |
|---|---|---|
| **Notifications** | `/api/v1/notifications` | แจ้งเตือน Real-time (Socket.IO) + Cron Job |
| **Reports** | `/api/v1/reports` | รายงานสรุป (สต็อก, เคลื่อนไหว, Lot ใกล้หมดอายุ, มูลค่า) |
| **Analytics** | `/api/v1/analytics` | Dashboard Analytics (สถิติ, กราฟ, Trend) |
| **Barcodes** | `/api/v1/barcodes` | สร้างและค้นหาด้วย Barcode/QR Code |
| **Files** | `/api/v1/files` | Upload/Download ไฟล์ผ่าน Cloudinary |
| **Lookups** | `/api/v1/lookup` | ข้อมูลอ้างอิง (คำนำหน้า, แผนก, เพศ, ฯลฯ) |
| **Settings** | `/api/v1/settings` | ตั้งค่าระบบ |
| **Profile** | `/api/v1/user/profile` | โปรไฟล์ผู้ใช้ |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20 |
| **Framework** | Express.js 5 |
| **ORM** | Prisma 5 (PostgreSQL) |
| **Database** | PostgreSQL (via Supabase) |
| **Authentication** | Supabase JWT (ES256) + JWKS verification |
| **Real-time** | Socket.IO 4 |
| **File Storage** | Cloudinary |
| **Scheduled Jobs** | node-cron |
| **Date/Time** | Day.js |
| **Upload Parsing** | Multer |
| **CI/CD** | GitHub Actions → Azure Web App |

---

## 📁 Project Structure

```
src/
├── server.js               # Entry point — HTTP server + Socket.IO + Cron jobs
├── app.js                  # Express app setup (CORS, JSON, routes, error handler)
├── routes/                 # Route definitions (23 route files)
│   └── index.js            #   Central router — v1 (auth required) + v2 (public)
├── controllers/            # HTTP handlers (21 controllers)
├── services/               # Business logic (19 services)
├── repositories/           # Data access layer (16 repositories)
├── dtos/                   # Data Transfer Objects (8 DTOs)
├── middleware/
│   ├── auth.js             #   JWT verification via Supabase JWKS
│   ├── upload.js           #   File upload (Multer + Cloudinary)
│   └── validate.js         #   Request validation
├── adapters/
│   └── dispense.adapter.js #   External dispense system integration
├── config/
│   └── cloudinary.js       #   Cloudinary configuration
├── jobs/
│   └── notification.cron.js#   Scheduled notification jobs (สต็อกต่ำ, Lot ใกล้หมดอายุ)
└── utils/
    └── socket.js           #   Socket.IO initialization & helpers

prisma/
├── schema.prisma           # Database schema (30+ models, 3 schemas)
├── migrations/             # Database migrations
├── sql/                    # Custom SQL scripts
└── views/                  # Database views
```

---

## 🗄️ Database Schema

ฐานข้อมูลแบ่งเป็น 3 Schemas:

| Schema | Description | Key Models |
|---|---|---|
| **inventory** | ข้อมูลคลังหลัก | items, item_lots, stocks_movement, requisition_header/item, receive_header/item, medical_assets, reusable_item_units |
| **public** | ข้อมูลพื้นฐาน | profiles, departments, supplier, lookups |
| **auth** | Supabase Auth | users, sessions, identities (managed by Supabase) |

### Key Models & Relationships

```
items ──┬── item_lots (Lot tracking)
        ├── requisition_item → requisition_header (เบิก/ยืม)
        ├── receive_item → receive_header → receive_batch (รับเข้า)
        ├── medical_assets → asset_units (ครุภัณฑ์ถาวร)
        ├── reusable_item_units → movement_logs (ครุภัณฑ์หมุนเวียน)
        └── stocks_movement (ประวัติเคลื่อนไหว)

requisition_header → profiles (requester/approver)
                   → departments
                   → borrower_details (สำหรับ BORROW type)
```

---

## 🔐 Authentication & Authorization

### JWT Verification Flow
1. Client ส่ง `Authorization: Bearer <supabase-jwt>` ในทุก Request
2. Backend ดึง JWKS Public Key จาก Supabase endpoint
3. Verify JWT ด้วย Algorithm **ES256**
4. แกะ `app_metadata` → `role`, `departments`, `systems`
5. Inject `req.user` สำหรับ Controllers ใช้งาน

```javascript
req.user = {
  sub: "uuid",
  email: "user@example.com",
  role: { id: 1, name: "warehouse_manager" },
  departments: [{ id: 1, name: "คลังหลัก" }],
  systems: [{ id: 1, name: "Warehouse" }]
}
```

### API Versioning
- **`/api/v1/*`** — ทุก Route ต้องผ่าน Auth middleware
- **`/api/v2/*`** — Public endpoints (ไม่ต้อง Auth)
- **`/api/health`** — Health check (ไม่ต้อง Auth)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL (หรือ Supabase project)
- Cloudinary account

### Installation

```bash
# Clone repository
git clone <repository-url>
cd hpk-warehouse-api

# Install dependencies
npm install

# Setup Prisma
npx prisma generate
npx prisma db push    # หรือ npx prisma migrate deploy
```

### Environment Variables

สร้างไฟล์ `.env` ที่ root ของ project:

```env
# Database
DATABASE_URL=                     # PostgreSQL connection string (pooled)
DIRECT_URL=                       # PostgreSQL direct connection string

# Supabase
SUPABASE_PROJECT_ID=              # Supabase project ID (สำหรับ JWKS)

# Cloudinary
CLOUDINARY_CLOUD_NAME=            # Cloudinary cloud name
CLOUDINARY_API_KEY=               # Cloudinary API key
CLOUDINARY_API_SECRET=            # Cloudinary API secret

# Server
PORT=4000                         # Server port (default: 4000)
```

### Development

```bash
npm run dev        # Start dev server with nodemon (hot-reload)
npm run start      # Start production server
```

---

## 🔄 Real-time (Socket.IO)

ระบบใช้ Socket.IO สำหรับ:
- **แจ้งเตือน Real-time** เมื่อมีใบเบิกใหม่ / ใบเบิกถูกอนุมัติ / สต็อกต่ำ
- **Broadcast events** ไปยัง Client ที่เชื่อมต่ออยู่
- Controllers เรียก `req.io.emit()` เพื่อส่ง event โดยตรง

---

## ⏰ Scheduled Jobs (Cron)

| Job | Schedule | Description |
|---|---|---|
| Stock Alert | ทุกวัน | ตรวจสอบเวชภัณฑ์ที่สต็อกต่ำกว่า min_stock |
| Expiry Alert | ทุกวัน | ตรวจสอบ Lot ที่ใกล้หมดอายุ |

---

## 🚢 Deployment

### CI/CD Pipeline (GitHub Actions → Azure)

```
Push to main → Build (npm install) → Upload Artifact → Azure Login (OIDC) → Deploy to Azure Web App
```

- **Platform**: Azure Web App (`warehouse-hpk-api`)
- **Trigger**: Push to `main` branch หรือ Manual dispatch
- **Authentication**: Azure OIDC (Federated Credentials)

---

## 🔗 Related Repositories

| Repository | Description |
|---|---|
| **hpk-warehouse-web** | Frontend (Next.js 16 + TypeScript) |
| HPK HMS Portal | Portal หลัก — จัดการ SSO, Role, Systems |

---

## 📄 License

This project is developed as part of a final project for educational and professional portfolio purposes.
