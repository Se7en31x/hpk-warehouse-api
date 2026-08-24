# HPK-HMS: Backend API

The backend RESTful API service for the Hospital Warehouse Management System (Graduation Project). 

## 🚀 Overview
This repository contains the backend engine responsible for handling all business logic, database interactions, and API endpoints for central warehouse operations. It is built to seamlessly serve the Next.js frontend application.

## 🛠 Tech Stack
- **Environment:** Node.js / TypeScript
- **Database & ORM:** PostgreSQL with Prisma ORM
- **CI/CD Pipeline:** GitHub Actions (configured for Azure App Service deployment)
- **Development Tools:** Cursor / AI-assisted code generation

## ✨ Key Features
- **Inventory & Requisition Endpoints:** Secure and robust APIs for tracking medical assets, managing stock levels, and processing requisitions.
- **Optimized Return Flows:** Refactored business logic to handle specific operational rules, including the removal of redundant image requirements.
- **Precise Address Lookup:** Implemented an accurate Thai address hierarchy mapping system (binding postal codes strictly to the subdistrict level) to ensure data integrity.

## 💻 Getting Started
To run the API server locally:

1. Clone the repository
\`\`\`bash
git clone https://github.com/Se7en31x/hpk-warehouse-api.git
\`\`\`
2. Install dependencies
\`\`\`bash
npm install
\`\`\`
3. Set up your `.env` file with your `DATABASE_URL` (PostgreSQL).
4. Run Prisma migrations
\`\`\`bash
npx prisma generate
npx prisma db push
\`\`\`
5. Start the development server
\`\`\`bash
npm run dev
\`\`\`
