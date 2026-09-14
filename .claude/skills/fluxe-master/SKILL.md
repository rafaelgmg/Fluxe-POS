---
description: Use when working on Fluxe POS, inventory, CRM, Supabase or production changes.
---

# Fluxe Master Skill

Fluxe is a production POS system used daily in real perfume kiosks.

## Rules

- Never break existing functionality.
- Preserve invoice sequence.
- Preserve historical sales data.
- Preserve multi-location inventory.
- Never disable RLS without approval.
- Never expose service role keys in frontend.
- Prefer incremental changes over large refactors.
- Create reversible migrations whenever possible.
- Do not modify unrelated files.
- Analyze existing implementation before coding.

## Tech Stack

- React
- Vite
- TypeScript
- Supabase
- Twilio
- Vercel

## Business Context

Fluxe manages:
- Sales
- Inventory
- Transfers
- CRM
- SMS campaigns
- Employee commissions
- Multiple locations
- Reports and dashboards
