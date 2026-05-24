# AWPB System UAT Checklist

Use this checklist before the final demo or deployment sign-off. Mark each item as Pass, Fail, or N/A, then add notes for anything that needs follow-up.

## Test Details

| Field | Value |
|-------|-------|
| Test Date | |
| Tester | |
| Environment | Local / Vercel / Other |
| Supabase Project | |
| App URL | |
| Browser | |

## Pre-Test Setup

| Result | Check | Notes |
|--------|-------|-------|
| | All Supabase migrations from `001` through `034` are applied in order | |
| | `VITE_SUPABASE_URL` is configured | |
| | `VITE_SUPABASE_ANON_KEY` is configured | |
| | `VITE_APP_URL` is configured for deployed password reset links | |
| | Supabase Auth Site URL points to the deployed app URL | |
| | Supabase Auth Redirect URLs include `/confirm-password` | |
| | At least one active admin account exists | |
| | At least one active encoder account exists | |

## Authentication

| Result | Check | Notes |
|--------|-------|-------|
| | Admin can log in with username and password | |
| | Encoder can log in with username and password | |
| | Invalid credentials show an error and do not log in | |
| | Deactivated account cannot access the system | |
| | User can sign out successfully | |
| | Session expires after inactivity and returns to login | |

## Password Reset

| Result | Check | Notes |
|--------|-------|-------|
| | Forgot password accepts a valid username and registered email | |
| | Reset email is received by the registered email address | |
| | Reset link opens the deployed `/confirm-password` page | |
| | Weak new password is rejected | |
| | Valid new password is accepted | |
| | User can log in using the new password | |

## Encoder Workflow

| Result | Check | Notes |
|--------|-------|-------|
| | Encoder can open the Submit Entry page | |
| | Template dropdowns load correctly | |
| | Encoder can complete the 3-step entry form | |
| | Monthly target and amount calculations are correct | |
| | Grand total is correct | |
| | Submitted entry appears in My Entries | |
| | Pending entry can be viewed in detail | |
| | Pending entry can be deleted by the owner | |
| | Returned entry can be edited and resubmitted | |
| | Approved or rejected entry cannot be edited | |
| | Closed submission window blocks new submissions | |

## Admin Workflow

| Result | Check | Notes |
|--------|-------|-------|
| | Admin dashboard loads statistics and planning totals | |
| | Admin can view all submitted entries | |
| | Admin can filter entries by status, unit, and year | |
| | Entry details show complete monthly breakdown | |
| | Admin can approve a pending entry | |
| | Admin can return an entry with comments | |
| | Admin can reject an entry with comments | |
| | Admin can delete entries where allowed | |
| | Review actions update dashboard/planning totals correctly | |
| | Admin can open and close the submission window | |

## Account Management

| Result | Check | Notes |
|--------|-------|-------|
| | Admin can create a new encoder account | |
| | Admin can create a new admin account | |
| | Duplicate username is rejected | |
| | Duplicate email is rejected | |
| | Weak password is rejected | |
| | Admin can edit account details | |
| | Admin can reset/update an account password | |
| | Admin can deactivate an account | |
| | Admin can reactivate an account | |

## Template Management

| Result | Check | Notes |
|--------|-------|-------|
| | Admin can view the full template hierarchy | |
| | Admin can add a component, sub-component, key activity, and sub-activity | |
| | Admin can edit template items | |
| | Admin can delete template items where allowed | |
| | Template changes appear in the Submit Entry dropdowns | |
| | Set-to-default behavior works as expected | |

## Export And Reports

| Result | Check | Notes |
|--------|-------|-------|
| | Approved entries can be exported to CSV | |
| | PDF/export output includes expected entry details | |
| | Empty export state shows a clear message | |

## Final Sign-Off

| Role | Name | Signature/Approval | Date |
|------|------|--------------------|------|
| Tester | | | |
| Project Lead | | | |
| Adviser/Reviewer | | | |

## Issues Found

| Priority | Issue | Steps to Reproduce | Owner | Status |
|----------|-------|--------------------|-------|--------|
| | | | | |
