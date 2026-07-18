# TASKEZY Enterprise Platform
## Software Development Life Cycle (SDLC) Manual

**Version**: 1.0  
**Effective Date**: June 2026  
**Target Domain**: Indian Real Estate Brokerage & Development SaaS  

---

## Executive Summary

The TASKEZY enterprise platform unifies sales (CRM), HR, and finance for real estate firms. This document enforces the official SDLC model for the platform: a **Hybrid Agile/Scrum + DevSecOps + CI/CD framework**. It outlines the strategic roadmap for delivering the Minimum Viable Product (MVP) by October 31, 2026, and establishes strict governance for post-MVP iteration, ensuring all user-feedback-driven updates remain fully documented, tested, and compliant.

---

## 1. The SDLC Model: Hybrid Agile + DevSecOps

To meet the complex demands of a multi-tenant SaaS application requiring high scalability, offline resilience, and strict financial data isolation, TASKEZY employs a Hybrid Agile Scrum + DevSecOps + CI/CD approach.

This hybrid module comprises three core pillars:
*   **Agile Scrum Foundation**: Development is executed in structured 2- to 4-week iterations (sprints). This provides the flexibility to adapt to changing user requirements (e.g., dynamic CRM workflows, new external API integrations) while maintaining a predictable delivery cadence.
*   **DevSecOps Integration**: Security and compliance (e.g., GST calculations, data residency, multi-tenant database schema isolation) are embedded continuously through automated code reviews and security spikes.
*   **CI/CD Automation**: Continuous Integration and Continuous Deployment pipelines ensure that shippable increments are automatically tested and deployed, preventing bottlenecks and guaranteeing high deployment frequencies.

```
       1. Discovery            2. Architecture          3. Agile Sprints         4. CI/CD Deploy          5. Post-MVP
    [PRD, SRS, Backlog]  ->  [Tech Spikes, Sec]  ->  [2-4 Week Sprints]  ->  [Auto-Test, Rollout]  ->  [Feedback Loop]
             ^                                                |                       |                      |
             |________________________________________________v_______________________v______________________|
                                                       Shippable Increments
```

---

## 2. Project Phases and MVP Timeline

The initial project lifecycle is rigidly structured to ensure the delivery of the core platform by the target deadline. **The MVP Delivery Date is strictly set for October 31, 2026.**

| Phase | Timeline | Key Deliverables | Milestone |
| :--- | :--- | :--- | :--- |
| **1. Initiation & Planning** | Weeks 1–4 | Product Requirements Document (PRD), Baseline Backlog, Multi-tenant Architecture Design. | Charter Approved |
| **2. Arch. & Design Spikes** | Weeks 5–6 | Tenant partitioning logic, OAuth 2.0 flows, Data isolation strategies, Database schemas. | Design Frozen |
| **3. Development Sprints** | Weeks 7–20 | Core CRM components (webhooks, deduplication, state machine), HR, and Finance integration. | Feature Complete |
| **4. Testing & QA** | Weeks 21–22 | Performance benchmarking, Security/Audit testing, User Acceptance Testing (UAT). | Go/No-Go Decision |
| **5. Deployment & Go-Live** | Weeks 23–24 | Production provisioning, final data migration, and live deployment. | **Oct 31, 2026** |

---

## 3. Post-MVP Governance & Continuous Iteration

Following the MVP deployment on October 31, 2026, TASKEZY will transition into a steady-state continuous iteration cycle. This phase is entirely driven by user adoption metrics, client feedback, and evolving market requirements.

To maintain system integrity, all post-MVP updates must adhere strictly to the established SDLC process. Ad-hoc changes are strictly prohibited. The governance model dictates:
1.  **Feedback Triage**: User requests and operational feedback are collected, analyzed by the Product Owner, and translated into formal User Stories within the Product Backlog.
2.  **Sprint Planning**: Backlog items are prioritized and scheduled into subsequent 2-week development sprints.
3.  **Mandatory Documentation**: No feature will be promoted to production without comprehensive documentation. This includes:
    *   Updating the System Requirements Specification (SRS) and Backlog.
    *   Publishing Architectural Decision Records (ADRs) for any systemic changes.
    *   Generating formal Release Notes and maintaining version-controlled change logs.
4.  **Continuous Retrospectives**: Every sprint concludes with a retrospective to refine the development process, ensuring continuous improvement aligned with Lean principles.

---

## 4. Enterprise System Architecture Baseline

The system architecture designed to support the SDLC features a central API gateway routing multi-tenant requests to isolated microservices.

```
+----------------------------------------------------------------------------------------------------------------+
|                                              INGESTION & CLIENT LAYER                                          |
|  +--------------------+      +--------------------+      +--------------------+      +----------------------+  |
|  | Web App (Next.js)  |      | Mobile App (Capac) |      | Lead Sources (FB)  |      | OAuth (Meta Login)   |  |
|  +--------------------+      +--------------------+      +--------------------+      +----------------------+  |
+-------------------------------------------------------+--------------------------------------------------------+
                                                        | HTTPS / REST / Webhooks
                                                        v
+----------------------------------------------------------------------------------------------------------------+
|                                                GATEWAY & ROUTING LAYER                                         |
|                                     +-------------------------------------------+                              |
|                                     |        API Gateway (NestJS Auth Proxy)    |                              |
|                                     +-------------------------------------------+                              |
+-------------------------------------------------------+--------------------------------------------------------+
                                                        | gRPC / REST Internal
                                                        v
+----------------------------------------------------------------------------------------------------------------+
|                                                   MICROSERVICES LAYER                                          |
|      +---------------------------+        +---------------------------+        +---------------------------+   |
|      |        CRM Service        |        |        HRMS Service       |        |      Finance Service      |   |
|      +---------------------------+        +---------------------------+        +---------------------------+   |
+------------------+--------------------------------------+------------------------------------+-----------------+
                   | Data Access Layer                                                         | Data Access Layer
                   v                                                                           v
+------------------+---------------------------------------------------------------------------+-----------------+
|                                                 PERSISTENCE LAYER                                              |
|  +----------------------------------------------------------------------------------------------------------+  |
|  |   PostgreSQL on AWS RDS/Aurora (Multi-Tenant Isolated Schemas / Row Level Security [RLS])                |  |
|  +----------------------------------------------------------------------------------------------------------+  |
|  |   AWS S3 (KYC documents, invoice drafts, export reports)                                                 |  |
|  +----------------------------------------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------------------+
```

---

## 5. Roles and Responsibilities (RACI Matrix)

To enforce accountability across iterative sprints—both pre- and post-MVP—we operate on a strictly defined RACI matrix (Responsible, Accountable, Consulted, Informed).

| Task / Functional Area | Product Owner | Scrum Master | Dev Team | QA / Tester | DevOps |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Requirements & User Feedback** | R / A | C | I | I | I |
| **Systems Architecture & ADRs** | A | C | R | I | C |
| **Core Software Development** | C | I | R | C | I |
| **Automated Testing / QA** | C | I | C | R | I |
| **CI/CD Pipeline Deployment** | I | C | C | C | R |
| **Post-MVP Compliance & Auditing**| C | C | I | R | I |

*   **R - Responsible**: The role that actually performs the work to complete the task.
*   **A - Accountable**: The role with final approval power and ownership over the task's completion.
*   **C - Consulted**: The roles whose input and opinions are sought prior to or during the task.
*   **I - Informed**: The roles kept updated on progress or decisions.

---

## 6. Quality & Success Metrics (KPIs)

Sprint retrospectives and post-launch operational reviews will evaluate system health and team efficiency against key business and engineering metrics tracked via centralized dashboards (e.g., Grafana).

| Metric Category | Target Threshold | Measurement Description |
| :--- | :--- | :--- |
| **Deployment Frequency** | Multiple / Month | Tracking release consistency through the CI/CD pipeline (DORA metrics). |
| **System Resilience & Uptime** | 99.9% Minimum | Maintaining strict availability and verifying flawless offline-to-online CRDT synchronization for mobile agents. |
| **Lead Conversion & Cycle Time** | Shorter Cycles | Measuring business value by tracking lead flow efficiency from initial creation to final "Booked" status. |
| **Compliance Intactness** | Zero Infractions | Ensuring absolutely no multi-tenant data leaks, missing mandatory KYC gating, or GST miscalculations during updates. |
