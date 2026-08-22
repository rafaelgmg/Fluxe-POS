/**
 * DEMO / DEVELOPMENT DATA ONLY — not used in production.
 *
 * This file contains Perfume Passage sample data used exclusively by:
 *   - demoSeed.js  (seeds localStorage for the ?demo=true URL flag)
 *   - local development without a Supabase connection
 *
 * Production data always comes from Supabase.
 * Never import this file from production components or hooks.
 */

import { parseBarcode } from '../utils/parseBarcode'

export const CATEGORIES = [
  "Armaf Oil",
  "Kids",
  "Men's Brands",
  "Men's NC",
  "Niche",
  "SMART SHOP",
  "Unisex",
  "Unisex NC",
  "Women's Brands",
]

export const EMPLOYEES = [
  { id: 1, name: "Rafael",  pin: "1234", role: "manager" },
  { id: 2, name: "Natalia", pin: "5678", role: "seller"  },
  { id: 3, name: "Nate",    pin: "9012", role: "seller"  },
]

// rawBarcode = "barcode.minPrice" — minPrice is extracted silently via parseBarcode()
const RAW_PRODUCTS = [
  { id: 1,  rawBarcode: "3616304679452.55",  name: "Burberry Hero Parfum",         description: "",                               size: "1.7oz",        category: "Men's Brands",   systemPrice: 180, qty: 8,  costPrice: 30 },
  { id: 2,  rawBarcode: "6291107972947.30",  name: "Farasha Perfume Oil",          description: "OIL",                            size: "28ml",         category: "Armaf Oil",      systemPrice: 80,  qty: 12, costPrice: 12 },
  { id: 3,  rawBarcode: "8435415076937.80",  name: "Jean Paul Gaultier",           description: "Le Male Elixir",                 size: "75ml 2.50z",   category: "Men's Brands",   systemPrice: 220, qty: 5,  costPrice: 45 },
  { id: 4,  rawBarcode: "8500678159990.60",  name: "Marley Satisfy My Soul",       description: "",                               size: "3.4oz",        category: "Unisex",         systemPrice: 160, qty: 3,  costPrice: 35 },
  { id: 5,  rawBarcode: "8500713420093.45",  name: "New Collection Maryam",        description: "",                               size: "3.4oz",        category: "Men's NC",       systemPrice: 220, qty: 10, costPrice: 20 },
  { id: 6,  rawBarcode: "6291108735213.45",  name: "New Collection Yara Air",      description: "Yara Air Refre",                 size: "3.4oz",        category: "Women's Brands", systemPrice: 220, qty: 7,  costPrice: 20 },
  { id: 7,  rawBarcode: "ID-2764.90",        name: "Pacific Artisan Apple Town",   description: "",                               size: "3.4oz",        category: "Niche",          systemPrice: 280, qty: 4,  costPrice: 55 },
  { id: 8,  rawBarcode: "ID-2765.90",        name: "Pacific Artisan Malibu Dream", description: "",                               size: "3.4oz",        category: "Niche",          systemPrice: 280, qty: 4,  costPrice: 55 },
  { id: 9,  rawBarcode: "3614274423839.99",  name: "Prada Paradoxe SET",           description: "",                               size: "1.6oz&0.33oz", category: "Women's Brands", systemPrice: 240, qty: 2,  costPrice: 60 },
  { id: 10, rawBarcode: "3605972768995.50",  name: "Ralph Lauren Polo Red",        description: "Ralph Lauren Polo Red Parfum",   size: "1.4oz-40ml",   category: "Men's Brands",   systemPrice: 140, qty: 6,  costPrice: 28 },
  { id: 11, rawBarcode: "3349669604692.75",  name: "Set Paco Rabanne",             description: "Set Paco Rabanne 4 Miniatures",  size: "",             category: "Men's Brands",   systemPrice: 200, qty: 3,  costPrice: 42 },
  { id: 12, rawBarcode: "3614273830362.120", name: "SET REPLICA JAZZ CLUB",        description: "",                               size: "",             category: "Niche",          systemPrice: 320, qty: 2,  costPrice: 80 },
  { id: 13, rawBarcode: "3614274078060.95",  name: "SET VR SPICEBOMB",             description: "",                               size: "",             category: "Men's Brands",   systemPrice: 260, qty: 5,  costPrice: 55 },
  { id: 14, rawBarcode: "8880660893289.150", name: "Tom Ford Metallique",          description: "Tom Ford Metallique",            size: "",             category: "Women's Brands", systemPrice: 380, qty: 2,  costPrice: 95 },
  { id: 15, rawBarcode: "3614273256476.80",  name: "YSL Black Opium Extreme",      description: "YSL Black Opium Extreme EDP",    size: "1.7oz-50ml",   category: "Women's Brands", systemPrice: 220, qty: 6,  costPrice: 48 },
  { id: 16, rawBarcode: "6936664328232.45",  name: "New Collection Amber",         description: "Amber Eau Fresh",                size: "3.4oz",        category: "Unisex NC",      systemPrice: 220, qty: 9,  costPrice: 20 },
  { id: 17, rawBarcode: "7451787104110.70",  name: "New Collection Ocean Noir",    description: "Michael Malul Ocean Noir EDP",   size: "3.4oz-100ml",  category: "Men's NC",       systemPrice: 220, qty: 8,  costPrice: 35 },
  { id: 18, rawBarcode: "7257656572990.60",  name: "New Collection Sangria",       description: "Michael Malul Sangria Saffron",  size: "3.4oz-100ml",  category: "Women's Brands", systemPrice: 220, qty: 5,  costPrice: 30 },
]

export const PRODUCTS = RAW_PRODUCTS.map(p => {
  const { cleanBarcode, minPrice } = parseBarcode(p.rawBarcode)
  return { ...p, rawBarcode: p.rawBarcode, barcode: cleanBarcode, minPrice: minPrice ?? 0 }
})

export const PRODUCT_BY_BARCODE = Object.fromEntries(PRODUCTS.map(p => [p.barcode, p]))

export const TAX_RATE = 0.085
