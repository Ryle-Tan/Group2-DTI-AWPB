# AWPB System - DTI RAPID Growth Project

An Annual Work and Budget Plan (AWPB) management system for the DTI RAPID Growth Project, built with React and Supabase.

## Overview

The AWPB System is a web-based application that allows encoders to submit annual work and budget plans, and administrators to review, approve, or return submissions. The system manages complex hierarchical templates, monthly budget breakdowns, and user access control.


## Project Status

| Component | Status | Completion |
|-----------|--------|------------|
| Frontend | 🟢 Functional | 95% |
| Database | 🟢 Functional | 95% |
| Backend | 🔴 Removed | 0% |

**Overall Status:** ✅ Ready for User Acceptance Testing (UAT)

---

## Working Features

### For Encoders

| Feature | Status | Description |
|---------|--------|-------------|
| Login | ✅ | Username/password authentication |
| Submit Entry | ✅ | Complete AWPB entry form with 3-step wizard |
| Monthly Budget Computation | ✅ | Unit Cost × Monthly Target = Amount |
| Monthly Breakdown Display | ✅ | Shows targets and amounts in table |
| Grand Total Calculation | ✅ | Sum of all monthly amounts |
| View My Entries | ✅ | List of all submitted entries |
| Entry Status Tracking | ✅ | Shows Pending/Returned/Approved/Rejected |
| Edit Returned Entries | ✅ | All fields pre-populate when editing |
| Delete Pending Entries | ✅ | Can delete entries not yet reviewed |
| View Entry Details | ✅ | Modal with complete entry information |

### For Administrators

| Feature | Status | Description |
|---------|--------|-------------|
| Admin Dashboard | ✅ | Overview with statistics and budgets |
| Review Entries | ✅ | Table with all submissions |
| No. Column | ✅ | Shows activity number from template |
| Sub Activity Column | ✅ | Shows sub-activity from template |
| Monthly Breakdown in Review | ✅ | Displays targets and amounts |
| Approve Entries | ✅ | Changes status to "Approved" |
| Return Entries | ✅ | Changes status to "Returned" with comments |
| Reject Entries | ✅ | Changes status to "Rejected" with comments |
| Manage Template | ✅ | CRUD for components, sub-components, key activities |
| Manage Accounts | ✅ | Create, edit, activate, deactivate users |
| Submission Window Control | ✅ | Open/close encoding periods |
| Filter Entries | ✅ | By status, unit, year |
| Budget by Unit | ✅ | Dashboard shows approved budgets per unit |

### Database

| Feature | Status | Description |
|---------|--------|-------------|
| Supabase Integration | ✅ | Cloud database with real-time |
| Row Level Security | ✅ | Policies for encoders and admins |
| Foreign Key Relationships | ✅ | Properly linked tables |
| Monthly Targets | ✅ | Stored separately for each entry |
| Template Hierarchy | ✅ | 4-level nested structure |
| User Profiles | ✅ | Extended auth users with roles |

---

## Remaining Verification

### Before Final Deployment

| Issue | Description | Impact | Suggested Fix |
|-------|-------------|--------|----------------|
| Supabase Migrations | Confirm production Supabase has all migrations through `032_allow_retry_incomplete_archive_cleanup.sql` applied | Missing migrations can cause auth, RLS, template, archive cleanup, or review workflow issues | Run migrations in order or use `supabase db push` |
| Password Reset | Forgot/reset password flow depends on Supabase email and redirect settings | Reset links may fail if Site URL or Redirect URLs are wrong | Test with a real account and deployed URL |
| User Acceptance Testing | Core workflows need real-user validation | Edge cases may only appear with actual DTI data and roles | Test login, submit, return, resubmit, approve, reject, delete pending, and account deactivation |

### Optional Enhancements

| Issue | Description | Impact | Suggested Fix |
|-------|-------------|--------|----------------|
| Audit/History Table | No tracking of entry changes | Cannot see who changed what | Create audit trigger and table |
| Automated Tests | No test suite is currently configured | Manual testing is required before every release | Add focused tests for services and critical workflows |




**Project Structure**
text
<img width="455" height="592" alt="image" src="https://github.com/user-attachments/assets/c86c3fae-40a7-430b-8a1c-9c8ecf91caf1" />

<img width="402" height="190" alt="image" src="https://github.com/user-attachments/assets/3e6c40f7-e8f6-49f3-9cd6-d020fbbedf81" />


    
**User Roles**
Encoder

**Username prefix: enc_ (e.g., enc_jdelacruz)**

Can submit and edit own entries

Can view own submission status

Can edit returned entries

Admin
**Username prefix: adm_ (e.g., adm_admin)**

Can review all entries

Can manage template hierarchy

Can manage user accounts

Can configure submission windows

Can view dashboard statistics

**Key Features**
-**Submission Window Control**
Admins can open/close encoding periods. When closed, encoders cannot submit new entries or edit returned ones.

-**Monthly Budget Computation**
Unit Cost × Monthly Target = Monthly Amount

Grand Total = Sum of all monthly amounts

Only months with targets > 0 are saved

**Template Management**
Admins can manage the 4-level hierarchy:

- Components

- Sub-components

- Key Activities (with Activity No. and Performance Indicator)

- Sub-activities

**Entry Review Workflow**
- Encoder submits entry → Status: "Pending Review"

- Admin reviews → Can Approve, Return, or Reject

- If Returned, encoder can edit and resubmit

- If Approved/Rejected, entry is locked


- ✅ Troubleshooting guide
- ✅ Useful SQL queries
