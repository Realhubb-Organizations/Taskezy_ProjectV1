# TASKEZY Enterprise Platform
## System Requirements Specification (SRS) & Architectural Blueprint

**Version**: 1.1 (Upgraded for Commercial SaaS Provisioning)  
**Architecture Paradigm**: Distributed, Multi-Tenant, Cloud-Native SaaS  
**Primary Database**: PostgreSQL on AWS (RDS/Aurora)  
**Target Market**: Indian Real Estate Brokerage & Development Sector  

---

## 1. Executive Summary & Product Vision

The TASKEZY platform is a distributed, multi-tenant Software as a Service (SaaS) ecosystem engineered for the highly fluid and operationally demanding real estate sector. To address the complexities of massive lead ingestion, distributed field operations, and rigorous financial compliance, the architecture unifies three primary bounded contexts into a single cloud-native application:
1.  **Customer Relationship Management (CRM)**: Lead and Pipeline Management.
2.  **Human Resources Management System (HRMS)**: Workforce Operations and Telemetry.
3.  **Finance**: Revenue, Taxation, and Ledger Management.

This document serves as the authoritative blueprint for the modernization of the TASKEZY platform, establishing the technical directives for predictable scalability, multi-tenant data isolation, automated commercial provisioning, and precise cost modeling using PostgreSQL on AWS.

---

## 2. System Architecture & Technology Modernization

To support enterprise-grade scaling and optimize the Total Cost of Ownership (TCO), the platform transitions to a modern, highly performant infrastructure.

### 2.1 Frontend & Mobile Runtime
*   **Web Application**: React 18, Next.js 14, and Tailwind CSS. Leveraging Server-Side Rendering (SSR) and Static Site Generation (SSG) for rendering dense data grids on high-resolution displays.
*   **Mobile Native (iOS/Android)**: Capacitor JS (v6.0) functioning as a lightweight native runtime bridge. This encapsulates the optimized Next.js web app while providing secure access to native device APIs (Camera, GPS) without the compilation overhead of React Native.

### 2.2 Database Infrastructure
*   **Modern Standard**: **PostgreSQL on AWS RDS/Aurora** (Logical Schema Partitioning or Row-Level Security [RLS]).
*   **Rationale**: Enforces absolute relational integrity and ACID compliance, which is critical for financial ledger tracking, GST reporting, and complex HRMS timesheet join queries. Adopts a predictable, instance-based compute model that handles substantial load without operational pricing penalties.
*   **Capability**: Implements PostgreSQL schemas per tenant to guarantee logical data isolation, database-level encryption, and strict row protection.

### 2.3 API Security & Auth Protocols
*   **Modern Standard**: OAuth 2.0 ("Facebook Login for Business").
*   **Rationale**: Enforces granular, tenant-explicit consent. Cryptographic access tokens are securely encrypted and stored exclusively within the tenant's logically isolated PostgreSQL database partition.

---

## 3. Bounded Contexts & Business Rules

The platform implements a strict Role-Based Access Control (RBAC) model, governing application logic within isolated departmental contexts.

### 3.1 CRM: Pipeline & Ingestion Logic
*   **Validation & Deduplication**: Lead instantiation requires a strictly formatted 10-digit Indian mobile number. A unique PostgreSQL constraint per tenant schema on the phone number field guarantees instant rejection of duplicate entries.
*   **DAG State Machine**: Lead progression is governed by a strict Directed Acyclic Graph:  
    `New ➔ Contacted ➔ Follow-up ➔ Site Visit Scheduled ➔ Site Visited ➔ Negotiation ➔ Booked`.
*   **Terminal Node Requirements**: Transitioning a lead to "Booked" strictly requires:
    1.  Input of "Deal Value" (Formatted in INR).
    2.  Upload of mandatory KYC Document (Aadhar/PAN Card) via AWS S3 Pre-Signed URLs.
*   **Immutable Audit Trails**: Managerial lead reassignments automatically synthesize chronological, immutable ledger entries recording the timestamp, initiating admin, and recipient agent.

### 3.2 HRMS: Telemetry & Workforce Management
*   **Geofenced Telemetry**: Mobile app authentications via the "Punch In" interface trigger Capacitor Geolocation APIs to capture precise GPS coordinates (Latitude/Longitude) and server-synchronized timestamps.
*   **Automated Auditing**: Backend cron jobs calculate the temporal delta between Punch In/Out. Daily working durations < 4 hours are autonomously flagged as a "Half Day" on the Admin Dashboard.
*   **Leave State Constraints**: Leave requests instantly cross-reference the user's "Leave Balance" integer in PostgreSQL. Zero balances physically disable UI submission capabilities.
*   **Attendance Regularization (Compliance & Payroll)**: In the event of missed telemetry punches, GPS failures, or erroneous "Half Day" flags, the user may submit an "Attendance Regularization Request" containing the correct timings and a justification. This request immediately halts payroll processing for that specific date and routes directly to the Global Administrator queue.  
    **Business Rule**: If the Administrator does not explicitly approve the regularization request before the cycle closes, or if the request is rejected, the system automatically executes a proportional salary deduction for the undocumented timeframe.

### 3.3 Finance: Ledger Mathematics & Compliance
*   **Asynchronous Triggers**: A "Booked" status in the CRM automatically generates a "Draft Booking" in the Finance module.
*   **Compliance Gates**: The "Generate Invoice" function remains strictly disabled until a Finance User manually verifies the attached KYC document and updates the PostgreSQL database verification flag state to true.
*   **Autonomous Tax Engine**: The backend synthesizes sequential Invoice IDs (e.g., `INV-2026-0001`) and calculates 18% GST (bifurcated into 9% CGST and 9% SGST) applied to the base property value.
*   **Overdue State Mutation**: Scheduled background tasks evaluate active invoices against Due Dates. Elapsed dates with Outstanding Balance > 0 automatically mutate to an "Overdue" state, triggering global, high-visibility UI alerts.

---

## 4. SaaS Provisioning & Commercial Engine

To function as an autonomous, high-margin commercial product, the platform integrates a zero-touch SaaS provisioning workflow.

### 4.1 Dynamic Pricing Engine
The Next.js frontend computes real-time Monthly Recurring Revenue (MRR) based on strict per-user licensing:
*   **Administrator Seats**: $1,000 / month
*   **Finance Operations Seats**: $1,000 / month
*   **Field Agent / Sales Seats**: $500 / month
*   **Taxation**: Aggregate subtotal is strictly subject to an 18% mandatory GST calculation to derive Final Pricing.

### 4.2 Automated Provisioning & Cryptography
Upon payment validation (Razorpay/Stripe integration), the Node.js backend:
1.  Initializes an isolated PostgreSQL schema environment within the AWS RDS cluster.
2.  Generates user accounts and cryptographically secure, high-entropy temporary passwords.
3.  Compiles a downloadable PDF of the credential roster for the purchasing agent.

---

## 5. Security Architecture & Global Administration

*   **Omnipotent CRUD Authorization**: The Global Administrator role bypasses standard departmental validation constraints. The NestJS backend API interrogates the JWT; if the role claim is `ADMIN`, the user is granted absolute Create, Read, Update, and Delete capabilities across all tenant domains.
*   **Enforced Password Governance**: To mitigate security risks, the system enforces a strict protocol where only the Global Administrator can manually alter/reset subordinate temporary passwords before offline distribution to the workforce.

---

## 6. Offline Resiliency & Edge Synchronization

*   **Capacitor Network State Disconnection**: Network loss immediately triggers an offline mode, visually alerting the user via the DOM.
*   **Local State Mutability**: Users retain CRUD capabilities for critical CRM state transitions offline. Data is serialized and committed to WatermelonDB (an optimized local SQLite wrapper).
*   **CRDT Background Synchronization**: Upon network restoration, the application autonomously triggers a silent POST push. The backend evaluates Conflict-Free Replicated Data Types (CRDTs) to securely merge offline mutations into the primary cloud database cluster without temporal data collision or loss.

---

## 7. Technology Stack Costings & Economics

A multi-tenant SaaS requires a highly predictable operational expenditure (OpEx) model. Below are the estimated fixed and variable costings for the chosen modern technology stack at a scaled production level.

| Component / Technology | Primary Function | Estimated Costing Model (Monthly) |
| :--- | :--- | :--- |
| **Next.js & React 18** | Web Frontend & Dashboard | $0 (Open Source Framework) |
| **Capacitor JS** | Mobile Wrapper (iOS/Android) | $0 (Open Source Framework) |
| **AWS EC2 / Vercel** | Node.js Backend & SSR Hosting | ~$80 - $200 (Instance/Bandwidth based) |
| **PostgreSQL on AWS RDS** | Primary Relational Cloud Database | ~$50 - $400 (vCPU/RAM allocation, predictable instance cost) |
| **AWS S3** | KYC/PDF Object Storage | ~$15 - $40 (Pay-per-GB storage + Egress bandwidth) |
| **WatermelonDB** | Offline Mobile Storage | $0 (Local Device Compute) |

---

## 8. Database Architecture Analysis (Firebase vs. MongoDB vs. PostgreSQL)

Selecting the correct database is the most critical architectural decision for a multi-tenant SaaS platform. The following tables contrast the legacy NoSQL structures and traditional Relational architecture.

### 8.1 Integration & Server Costing Comparison

| Feature Dimension | Firebase (Cloud Firestore) | MongoDB (Atlas) | PostgreSQL (AWS RDS / Aurora) |
| :--- | :--- | :--- | :--- |
| **Frontend Integration** | Direct Client SDKs (Bypasses custom backend, tight vendor lock-in). | Requires dedicated Node.js/NestJS API gateway layer. | Requires dedicated Node.js/NestJS API gateway layer. |
| **Backend Integration** | Heavy reliance on proprietary Firebase Cloud Functions. | Standard Mongoose/Prisma ORM integration via REST/gRPC. | Standard Prisma/TypeORM integration via REST/gRPC. |
| **Server Costing Model** | Variable (Pay-per-operation). Extremely costly at high scale. | Fixed (Instance-based compute). ~$57 to ~$387/mo based on fixed RAM/Storage. | **Fixed (Instance-based compute). ~$50 to ~$400/mo based on vCPU/RAM allocation.** |
| **Tenant Data Isolation** | Logic-based isolation via complex Firebase Security Rules. | Logical Database Partitioning or Collection-level mapping per tenant. | **Schema-based partitioning (1 schema per tenant) or Row-Level Security (RLS).** |

### 8.2 Database Pros & Cons

| Database Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Firebase (Firestore)** | • Incredible speed to market (MVP).<br>• Built-in real-time WebSocket sync.<br>• Managed authentication layer included. | • The "Pricing Trap": Operational costs scale exponentially.<br>• Extremely poor querying and data aggregation capabilities.<br>• Difficult to migrate away from. |
| **MongoDB Atlas** | • Predictable, flat monthly costs.<br>• Handles polymorphic lead data fields.<br>• Powerful aggregation pipelines. | • Requires manual engineering for real-time WebSocket capabilities.<br>• Lacks strict relational constraints (foreign keys require app-level validation). |
| **PostgreSQL (AWS RDS)** | **• Unmatched ACID compliance, ideal for Finance ledger integrity.<br>• Powerful relational querying (JOINs).<br>• Schema-based separation secures multi-tenant boundaries.** | **• Schema rigidity: Requires structured migrations when altering fields.<br>• Demands structured planning for dynamic agency custom fields.** |

---

## 9. Meta Integration Strategy (Multi-Tenant Ad Accounts)

To capture leads directly from Facebook and Instagram without violating strict enterprise security protocols, the application completely bypasses legacy "System User Tokens" in favor of an automated OAuth 2.0 (Facebook Login for Business) architecture.

### 9.1 The Frictionless User Experience (Client-Side)
From the perspective of the SaaS user (the Real Estate Agency Administrator), the integration process is designed to be entirely zero-touch and frictionless.
1.  **One-Click Login**: The user navigates to their TASKEZY settings dashboard and clicks a standard "Connect Meta/Facebook" button.
2.  **Standard Authentication**: A secure Meta pop-up appears, prompting them to log in using their personal, everyday Facebook credentials.
3.  **Instant Sync**: Once they select the business pages they wish to connect and grant authorization, the setup is 100% complete. The TASKEZY system immediately and automatically begins pulling in leads.

The user never has to generate API keys, configure webhooks, extract tokens, or interact with any complex Developer tools.

### 9.2 The Automated Backend Architecture (Server-Side)
1.  **Token Exchange & Encryption**: Upon successful user login, Meta returns a Short-Lived User Access Token. The TASKEZY backend immediately exchanges this for a Long-Lived Page Access Token. This Token is cryptographically encrypted at rest and saved exclusively to that specific tenant's profile schema in PostgreSQL.
2.  **Automated Webhooks**: The backend programmatically subscribes the tenant's selected pages to the global leadgen Webhook without any manual user configuration.
3.  **Payload Routing**: When a lead submits a form on a Facebook or Instagram Ad, Meta sends a real-time POST request. The backend instantly identifies the Page ID, maps it to the correct tenant's isolated schema in PostgreSQL, and injects the new prospect directly into that specific agency's CRM pipeline.
