'use strict';

/**
 * Standard Indian GST Product & Inventory Categories Taxonomy
 * Mapped to standard HSN (Harmonized System of Nomenclature) codes and Indian GST rates.
 */

const INDIAN_CATEGORY_PRESETS = [
  {
    name: 'Electronics & IT Hardware',
    code: 'ELEC',
    icon: '💻',
    defaultHsn: '8471',
    defaultGstRate: 18,
    sortOrder: 1,
    subcategories: [
      { name: 'Mobile Phones & Tablets', code: 'ELEC-MOB', defaultHsn: '8517', defaultGstRate: 18 },
      { name: 'Computers, Laptops & Servers', code: 'ELEC-PC', defaultHsn: '8471', defaultGstRate: 18 },
      { name: 'Audio, Headphones & Wearables', code: 'ELEC-AUD', defaultHsn: '8518', defaultGstRate: 18 },
      { name: 'Cables, Chargers & Power Adapters', code: 'ELEC-CAB', defaultHsn: '8544', defaultGstRate: 18 },
      { name: 'Computer Peripherals & Storage', code: 'ELEC-PER', defaultHsn: '8471', defaultGstRate: 18 },
      { name: 'Electronic Components & PCBs', code: 'ELEC-CMP', defaultHsn: '8542', defaultGstRate: 18 },
    ],
  },
  {
    name: 'FMCG, Personal Care & Cleaning',
    code: 'FMCG',
    icon: '🛒',
    defaultHsn: '3401',
    defaultGstRate: 18,
    sortOrder: 2,
    subcategories: [
      { name: 'Personal Care, Soaps & Haircare', code: 'FMCG-SOAP', defaultHsn: '3401', defaultGstRate: 18 },
      { name: 'Household Cleaners & Detergents', code: 'FMCG-DET', defaultHsn: '3402', defaultGstRate: 18 },
      { name: 'Oral Care & Cosmetics', code: 'FMCG-COSM', defaultHsn: '3306', defaultGstRate: 18 },
      { name: 'Paper Products & Tissues', code: 'FMCG-PAPR', defaultHsn: '4818', defaultGstRate: 12 },
    ],
  },
  {
    name: 'Food & Beverages',
    code: 'FOOD',
    icon: '🍵',
    defaultHsn: '2106',
    defaultGstRate: 12,
    sortOrder: 3,
    subcategories: [
      { name: 'Tea, Coffee & Infusions', code: 'FOOD-TEA', defaultHsn: '0902', defaultGstRate: 5 },
      { name: 'Dairy, Milk & Butter', code: 'FOOD-DAIRY', defaultHsn: '0401', defaultGstRate: 5 },
      { name: 'Packaged Snacks, Biscuits & Namkeen', code: 'FOOD-SNCK', defaultHsn: '2106', defaultGstRate: 12 },
      { name: 'Spices, Condiments & Seasonings', code: 'FOOD-SPICE', defaultHsn: '0910', defaultGstRate: 5 },
      { name: 'Grains, Pulses & Flours (Atta/Rice)', code: 'FOOD-GRN', defaultHsn: '1006', defaultGstRate: 5 },
      { name: 'Beverages, Syrups & Mineral Water', code: 'FOOD-BEV', defaultHsn: '2202', defaultGstRate: 12 },
    ],
  },
  {
    name: 'Apparel, Textiles & Footwear',
    code: 'APPR',
    icon: '👕',
    defaultHsn: '6203',
    defaultGstRate: 5,
    sortOrder: 4,
    subcategories: [
      { name: "Men's Wear & Shirts", code: 'APPR-MEN', defaultHsn: '6203', defaultGstRate: 5 },
      { name: "Women's Wear, Sarees & Ethnic", code: 'APPR-WOMEN', defaultHsn: '6204', defaultGstRate: 5 },
      { name: "Kids & Children's Clothing", code: 'APPR-KIDS', defaultHsn: '6111', defaultGstRate: 5 },
      { name: 'Footwear, Shoes & Sandals', code: 'APPR-FOOT', defaultHsn: '6403', defaultGstRate: 12 },
      { name: 'Bags, Luggage & Belts', code: 'APPR-BAGS', defaultHsn: '4202', defaultGstRate: 12 },
      { name: 'Fabrics, Yarn & Home Textiles', code: 'APPR-FAB', defaultHsn: '5208', defaultGstRate: 5 },
    ],
  },
  {
    name: 'Pharmaceuticals & Healthcare',
    code: 'PHAR',
    icon: '💊',
    defaultHsn: '3004',
    defaultGstRate: 12,
    sortOrder: 5,
    subcategories: [
      { name: 'Allopathic Medicines & Tablets', code: 'PHAR-ALLO', defaultHsn: '3004', defaultGstRate: 12 },
      { name: 'Ayurvedic, Herbal & Homeopathic', code: 'PHAR-AYUR', defaultHsn: '3003', defaultGstRate: 12 },
      { name: 'Nutritional Supplements & Protein', code: 'PHAR-NUTR', defaultHsn: '2106', defaultGstRate: 12 },
      { name: 'Medical Devices, Disposables & PPE', code: 'PHAR-PPE', defaultHsn: '9018', defaultGstRate: 12 },
      { name: 'First Aid & Antiseptics', code: 'PHAR-AID', defaultHsn: '3005', defaultGstRate: 12 },
    ],
  },
  {
    name: 'Industrial, Hardware & Machinery',
    code: 'IND',
    icon: '⚙️',
    defaultHsn: '8481',
    defaultGstRate: 18,
    sortOrder: 6,
    subcategories: [
      { name: 'Fasteners, Screws, Nuts & Bolts', code: 'IND-FAST', defaultHsn: '7318', defaultGstRate: 18 },
      { name: 'Valves, Pumps & Flow Controls', code: 'IND-VALV', defaultHsn: '8481', defaultGstRate: 18 },
      { name: 'Power Tools & Hand Tools', code: 'IND-TOOL', defaultHsn: '8467', defaultGstRate: 18 },
      { name: 'Bearings, Belts & Mechanical Spares', code: 'IND-BEAR', defaultHsn: '8482', defaultGstRate: 18 },
      { name: 'Electrical Cables, Switchgear & Panels', code: 'IND-ELEC', defaultHsn: '8536', defaultGstRate: 18 },
      { name: 'Safety Equipment & Industrial PPE', code: 'IND-SAFE', defaultHsn: '6506', defaultGstRate: 18 },
    ],
  },
  {
    name: 'Automotive & Vehicle Parts',
    code: 'AUTO',
    icon: '🚗',
    defaultHsn: '8708',
    defaultGstRate: 28,
    sortOrder: 7,
    subcategories: [
      { name: 'Auto Spare Parts & Components', code: 'AUTO-PART', defaultHsn: '8708', defaultGstRate: 28 },
      { name: 'Batteries & Ignition Systems', code: 'AUTO-BATT', defaultHsn: '8507', defaultGstRate: 28 },
      { name: 'Tyres, Tubes & Rubber Parts', code: 'AUTO-TYRE', defaultHsn: '4011', defaultGstRate: 28 },
      { name: 'Lubricants, Engine Oils & Coolants', code: 'AUTO-LUB', defaultHsn: '2710', defaultGstRate: 18 },
      { name: 'Vehicle Accessories & Lighting', code: 'AUTO-ACC', defaultHsn: '8512', defaultGstRate: 28 },
    ],
  },
  {
    name: 'Raw Materials & Packaging',
    code: 'RAW',
    icon: '📦',
    defaultHsn: '4819',
    defaultGstRate: 18,
    sortOrder: 8,
    subcategories: [
      { name: 'Corrugated Boxes & Cartons', code: 'RAW-BOX', defaultHsn: '4819', defaultGstRate: 18 },
      { name: 'Polybags, Bubble Wrap & Packing Tapes', code: 'RAW-POLY', defaultHsn: '3923', defaultGstRate: 18 },
      { name: 'Plastic Granules, Resin & Polymers', code: 'RAW-PLAS', defaultHsn: '3901', defaultGstRate: 18 },
      { name: 'Industrial Chemicals & Solvents', code: 'RAW-CHEM', defaultHsn: '2800', defaultGstRate: 18 },
      { name: 'Metals, Sheets, Rods & Scrap', code: 'RAW-METL', defaultHsn: '7208', defaultGstRate: 18 },
    ],
  },
  {
    name: 'Office Supplies, Printing & Stationery',
    code: 'OFFC',
    icon: '📎',
    defaultHsn: '4820',
    defaultGstRate: 12,
    sortOrder: 9,
    subcategories: [
      { name: 'Paper, Registers, Notebooks & Files', code: 'OFFC-PAPR', defaultHsn: '4820', defaultGstRate: 12 },
      { name: 'Pens, Markers & Writing Instruments', code: 'OFFC-PEN', defaultHsn: '9608', defaultGstRate: 18 },
      { name: 'Printers, Toner Cartridges & Ribbons', code: 'OFFC-TONR', defaultHsn: '8443', defaultGstRate: 18 },
      { name: 'Desk Accessories & Office Consumables', code: 'OFFC-DESK', defaultHsn: '8304', defaultGstRate: 18 },
    ],
  },
];

module.exports = { INDIAN_CATEGORY_PRESETS };
