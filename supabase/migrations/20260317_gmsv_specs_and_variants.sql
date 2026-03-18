-- ============================================================================
-- GMSV AU: Populate specs, features, variants, and brochure PDFs
-- for the full 7-vehicle lineup.
--
-- Data sourced directly from gmspecialtyvehicles.com/au-en vehicle pages.
-- ============================================================================

-- ── Silverado LTZ Premium ──────────────────────────────────────────────

UPDATE products SET
  engine_size   = '6200',
  cylinders     = 8,
  transmission  = '10-Speed Automatic',
  drive         = '4WD',
  drivetrain    = '4WD',
  doors         = 4,
  seats         = 5,
  fuel_type     = 'Petrol',
  body_type     = 'Ute',
  specs_json    = '{
    "engine": {
      "displacement": "6200",
      "type": "6.2L EcoTec3 V8",
      "cylinders": 8,
      "power": "313kW",
      "torque": "624Nm"
    },
    "transmission": {
      "type": "10-Speed Automatic",
      "gears": 10,
      "drivetrain": "4WD",
      "transfer_case": "2-Speed Transfer Case (2WD HI, 4WD Auto, 4WD HI, 4WD LO)"
    },
    "dimensions": {
      "length": "5931mm",
      "width": "2086mm",
      "height": "1930mm",
      "kerb_weight": "2494kg",
      "ground_clearance": null
    },
    "towing": {
      "braked": "4500kg (70mm ball) / 3500kg (50mm ball)",
      "unbraked": "750kg",
      "payload": "748kg",
      "gvm": "3300kg",
      "gcm": "7160kg"
    },
    "capacity": {
      "seats": 5,
      "doors": 4,
      "cargo_volume": "1781L",
      "fuel_tank": "91L",
      "cargo_bed_length": "1776mm"
    },
    "performance": {
      "fuel_consumption": null,
      "co2_emissions": null
    },
    "suspension": {
      "front": "Independent",
      "rear": "Solid Axle",
      "type": "Z71 Off-Road with Rancho Twin Tube Shocks"
    },
    "brakes": "4-Wheel Antilock Disc + Brake Pad Wear Indicator",
    "exhaust": "Dual Active Sport Exhaust",
    "wheels": "20-inch Sterling Silver",
    "tyres": "20-inch All-Terrain Blackwall"
  }'::jsonb,
  key_features  = '["6.2L EcoTec3 V8 Engine (313kW / 624Nm)","10-Speed Automatic Transmission","4.5 Tonne Max Braked Towing (70mm ball)","Z71 Performance Package","Z71 Off-Road Suspension with Rancho Shocks","Automatic Rear Locking Differential","Dual Active Sport Exhaust","13.4-inch Infotainment Touchscreen","12.3-inch Digital Driver Cluster","Apple CarPlay & Android Auto (Wireless)","Bose 7-Speaker Premium Sound System","Adaptive Cruise Control","Head-Up Display","Rear View Camera Mirror","Heated & Ventilated Front Seats","Heated Rear Seats","Leather Appointed Seats","Power Sunroof","Power Up/Down Tailgate","Durabed Cargo Bed (1776mm)","14 Available Camera Views","In-Vehicle Trailering App"]'::jsonb,
  meta_json     = COALESCE(meta_json, '{}'::jsonb) || '{
    "model_year": 2025,
    "sub_brand": "chevrolet",
    "brochure_pdf": "https://www.gmspecialtyvehicles.com/content/dam/chevrolet/oc/au/en/index/pickups-and-trucks/2023-silverado-ltz-premium/02-pdf/GMSV-MY24-Chevrolet-Silverado-1500-LTZ-Premium-Flyer.pdf"
  }'::jsonb
WHERE oem_id = 'gmsv-au'
  AND (external_key = 'gmsv-silverado-ltz-premium' OR title ILIKE '%Silverado%LTZ%Premium%');

-- ── Silverado ZR2 ──────────────────────────────────────────────────────

UPDATE products SET
  engine_size   = '6200',
  cylinders     = 8,
  transmission  = '10-Speed Automatic',
  drive         = '4WD',
  drivetrain    = '4WD',
  doors         = 4,
  seats         = 5,
  fuel_type     = 'Petrol',
  body_type     = 'Ute',
  specs_json    = '{
    "engine": {
      "displacement": "6200",
      "type": "6.2L EcoTec3 V8",
      "cylinders": 8,
      "power": "313kW",
      "torque": "624Nm"
    },
    "transmission": {
      "type": "10-Speed Automatic",
      "gears": 10,
      "drivetrain": "4WD",
      "transfer_case": "Enhanced 2-Speed Transfer Case with Crawl Mode (2WD HI, 4WD Auto, 4WD HI, 4WD LO)"
    },
    "dimensions": {
      "length": "5931mm",
      "width": "2074mm",
      "height": "1991mm",
      "kerb_weight": "2587kg",
      "ground_clearance": "296mm"
    },
    "towing": {
      "braked": "4200kg (70mm ball) / 3500kg (50mm ball)",
      "unbraked": "750kg",
      "payload": "713kg",
      "gvm": "3300kg",
      "gcm": "6851kg"
    },
    "capacity": {
      "seats": 5,
      "doors": 4,
      "cargo_volume": "1781L",
      "fuel_tank": "91L",
      "cargo_bed_length": "1776mm"
    },
    "performance": {
      "approach_angle": "31.8°",
      "breakover_angle": "23.4°",
      "departure_angle": "23.3°"
    },
    "suspension": {
      "front": "Independent",
      "rear": "Solid Axle",
      "type": "ZR2 High-Performance Lifted Suspension with Multimatic DSSV Dampers"
    },
    "brakes": "4-Wheel Antilock Disc + Brake Pad Wear Indicator",
    "exhaust": "Dual Active Sport Exhaust",
    "wheels": "18-inch High Gloss Black Aluminum",
    "tyres": "33-inch Goodyear Wrangler Territory Mud Terrain"
  }'::jsonb,
  key_features  = '["6.2L EcoTec3 V8 Engine (313kW / 624Nm)","10-Speed Automatic Transmission","4.2 Tonne Max Braked Towing (70mm ball)","Multimatic DSSV Dampers","ZR2 High-Performance Lifted Suspension","Front & Rear Locking Differentials","Enhanced Transfer Case with Crawl Mode","Large Underbody Aluminum ZR2 Skid Plates","Off-Road Cut Front Bumper","33-inch Goodyear Mud Terrain Tyres","296mm Ground Clearance","13.4-inch Infotainment Touchscreen","12.3-inch Digital Driver Cluster","Apple CarPlay & Android Auto (Wireless)","Bose 7-Speaker Premium Sound System","Adaptive Cruise Control","Head-Up Display","Rear View Camera Mirror","Heated & Ventilated Front Seats","Heated Rear Seats","Leather Appointed Seats","Hill Descent Control","ZR2 Off-Road Mode"]'::jsonb,
  meta_json     = COALESCE(meta_json, '{}'::jsonb) || '{
    "model_year": 2025,
    "sub_brand": "chevrolet",
    "brochure_pdf": "https://www.gmspecialtyvehicles.com/content/dam/chevrolet/oc/au/en/index/pickups-and-trucks/2023-silverado-zr2/02-pdfs/GMSV-MY24-Chevrolet-Silverado-1500-ZR2-Flyer.pdf"
  }'::jsonb
WHERE oem_id = 'gmsv-au'
  AND (external_key = 'gmsv-silverado-zr2' OR title ILIKE '%Silverado%ZR2%');

-- ── Silverado 2500 HD ──────────────────────────────────────────────────

UPDATE products SET
  engine_size   = '6600',
  cylinders     = 8,
  transmission  = '10-Speed Automatic',
  drive         = '4WD',
  drivetrain    = '4WD',
  doors         = 4,
  seats         = 5,
  fuel_type     = 'Diesel',
  body_type     = 'Ute',
  specs_json    = '{
    "engine": {
      "displacement": "6600",
      "type": "Duramax 6.6L Turbo-Diesel V8",
      "cylinders": 8,
      "power": "350kW",
      "torque": "1322Nm"
    },
    "transmission": {
      "type": "10-Speed Automatic",
      "gears": 10,
      "drivetrain": "4WD",
      "transfer_case": "2-Speed Transfer Case (2WD, Auto, 4WD HI, 4WD LO)"
    },
    "dimensions": {
      "length": "6387mm",
      "width": "2263mm",
      "height": "2039mm",
      "kerb_weight": "3762kg",
      "ground_clearance": "251mm"
    },
    "towing": {
      "braked": "4500kg (70mm ball) / 3500kg (50mm ball)",
      "unbraked": "750kg",
      "payload": "733kg (NB1) / 1386kg (NB2)",
      "gvm": "4495kg (NB1) / 5148kg (NB2)",
      "gcm": "12474kg"
    },
    "capacity": {
      "seats": 5,
      "doors": 4,
      "cargo_volume": "1968L",
      "fuel_tank": "136L",
      "cargo_bed_length": "2089mm"
    },
    "performance": {
      "approach_angle": "28.5°",
      "breakover_angle": "19°",
      "departure_angle": "23.6°"
    },
    "suspension": {
      "front": "Independent",
      "rear": "Multi-Leaf Springs",
      "type": "Z71 Off-Road with Rancho Twin Tube Shocks"
    },
    "brakes": "4-Wheel Antilock Disc + Brake Pad Wear Indicator",
    "steering": "Digital Variable Steering Assist",
    "wheels": "20-inch High Gloss Painted Black",
    "tyres": "Goodyear Wrangler Trailrunner AT"
  }'::jsonb,
  key_features  = '["Duramax 6.6L Turbo-Diesel V8 (350kW / 1322Nm)","10-Speed Automatic Transmission","4.5 Tonne Max Braked Towing (70mm ball)","12,474kg Gross Combined Mass","Up to 1,386kg Payload (NB2)","Z71 Off-Road Suspension with Rancho Shocks","Z71 Skid Plates","Automatic Rear Locking Differential","Diesel Exhaust Brake","Durabed Cargo Bed (2089mm)","13.4-inch Infotainment Touchscreen","12.3-inch Digital Driver Cluster","Apple CarPlay & Android Auto (Wireless)","Bose 7-Speaker Premium Sound System","Adaptive Cruise Control with Trailering","Up to 14 Camera Views","Power Trailering Mirrors","Power Sunroof","Heated & Ventilated Front Seats","Leather Appointed Seats","Hill Descent Control","Transparent Trailer View"]'::jsonb,
  meta_json     = COALESCE(meta_json, '{}'::jsonb) || '{
    "model_year": 2025,
    "sub_brand": "chevrolet"
  }'::jsonb
WHERE oem_id = 'gmsv-au'
  AND (external_key = 'gmsv-silverado-2500hd' OR title ILIKE '%Silverado%2500%' OR title ILIKE '%SILVERADO HD%');

-- ── GMC Yukon Denali ───────────────────────────────────────────────────

UPDATE products SET
  engine_size   = '6200',
  cylinders     = 8,
  transmission  = '10-Speed Automatic',
  drive         = '4WD',
  drivetrain    = '4WD',
  doors         = 4,
  seats         = 8,
  fuel_type     = 'Petrol',
  body_type     = 'SUV',
  specs_json    = '{
    "engine": {
      "displacement": "6200",
      "type": "6.2L EcoTec3 V8 with Dynamic Fuel Management",
      "cylinders": 8,
      "power": "313kW",
      "torque": "624Nm"
    },
    "transmission": {
      "type": "10-Speed Automatic",
      "gears": 10,
      "drivetrain": "4WD"
    },
    "dimensions": {
      "length": "5337mm",
      "width": "2058mm",
      "height": "1943mm",
      "wheelbase": "3071mm"
    },
    "towing": {
      "braked": "3628kg"
    },
    "capacity": {
      "seats": 8,
      "doors": 4,
      "cargo_volume": "3480L (seats folded)"
    },
    "suspension": {
      "type": "Air Ride Adaptive Four Corner Suspension"
    },
    "wheels": "24-inch Machined and Painted Pearl Nickel",
    "infotainment": "16.8-inch GMC Premium Infotainment System"
  }'::jsonb,
  key_features  = '["6.2L EcoTec3 V8 Engine (313kW / 624Nm)","10-Speed Automatic Transmission","3,628kg Max Braked Towing","Premium Full-Size 8-Seat SUV","Air Ride Adaptive Four Corner Suspension","24-inch Pearl Nickel Wheels","16.8-inch Premium Infotainment Touchscreen","Wireless Apple CarPlay & Android Auto","Bose 14-Speaker Centerpoint Surround Sound","Dual 12.6-inch Rear Entertainment Screens","360-Degree HD Camera (11 Views)","Panoramic Power Sunroof","Power Retractable Side Steps","AutoSense Power Liftgate","Heated & Ventilated Front Seats","Heated Second Row","Denali-Exclusive Fractal Stitching","Authentic Wood Interior Detailing","Hitch Guidance Camera","3-Row Seating with Fold-Flat"]'::jsonb,
  meta_json     = COALESCE(meta_json, '{}'::jsonb) || '{
    "model_year": 2025,
    "sub_brand": "gmc"
  }'::jsonb
WHERE oem_id = 'gmsv-au'
  AND (external_key = 'gmsv-yukon-denali' OR title ILIKE '%Yukon%Denali%');

-- ── Corvette Stingray ──────────────────────────────────────────────────

UPDATE products SET
  engine_size   = '6200',
  cylinders     = 8,
  transmission  = '8-Speed Dual-Clutch',
  drive         = 'RWD',
  drivetrain    = 'RWD',
  doors         = 2,
  seats         = 2,
  fuel_type     = 'Petrol',
  body_type     = 'Sports Car',
  specs_json    = '{
    "engine": {
      "displacement": "6200",
      "type": "6.2L LT2 V8",
      "cylinders": 8,
      "power": "369kW",
      "torque": "637Nm"
    },
    "transmission": {
      "type": "8-Speed Dual-Clutch",
      "gears": 8,
      "drivetrain": "RWD"
    },
    "performance": {
      "zero_to_hundred": "3.4 seconds",
      "quarter_mile": "11.2 seconds"
    },
    "suspension": {
      "type": "Magnetic Selective Ride Control 4.0"
    },
    "brakes": "Z51 Performance Brembo Brakes",
    "wheels": {
      "front": "19-inch Forged Aluminum",
      "rear": "20-inch Forged Aluminum"
    },
    "tyres": "Michelin Pilot Sport 4S (245/35ZR19 front, 305/30ZR20 rear)",
    "z51_package": "Standard — Performance brakes, suspension, exhaust, rear axle ratio, eLSD, splitter, spoiler"
  }'::jsonb,
  key_features  = '["6.2L LT2 V8 Mid-Engine (369kW / 637Nm)","8-Speed Dual-Clutch Transmission","Z51 Performance Package (Standard)","Magnetic Selective Ride Control 4.0","Brembo Performance Brakes","Electronic Limited Slip Differential","0-100km/h in 3.4 Seconds","12.7-inch Centre Console Display","14-inch Driver Information Center","6.6-inch Auxiliary Touchscreen","Wireless Apple CarPlay & Android Auto","Bose 14-Speaker Performance Series Audio","Performance Data Recorder","Head-Up Display","Front Lift with Memory","HD Curb View Camera","Heated & Ventilated Seats","6 Driver Modes (Tour/Sport/Track/Weather/MyMode/Z Mode)","Performance Traction Management with PTM Pro","Hardtop Convertible Available (3LT)"]'::jsonb,
  meta_json     = COALESCE(meta_json, '{}'::jsonb) || '{
    "model_year": 2026,
    "sub_brand": "chevrolet",
    "trims": ["2LT", "3LT"],
    "trim_details": {
      "2LT": "GT1 seats (Mulan leather), 5-spoke Gloss Black wheels, Dark Grey calipers",
      "3LT": "GT2 seats (Napa leather), 20-spoke Gloss Black wheels, Bright Red calipers, convertible option"
    }
  }'::jsonb
WHERE oem_id = 'gmsv-au'
  AND (external_key = 'gmsv-corvette-stingray' OR title ILIKE '%Corvette%Stingray%'
       OR title IN ('CORVETTE', 'C8 CORVETTE'));

-- ── Corvette E-Ray ─────────────────────────────────────────────────────

UPDATE products SET
  engine_size   = '6200',
  cylinders     = 8,
  transmission  = '8-Speed Dual-Clutch',
  drive         = 'eAWD',
  drivetrain    = 'eAWD',
  doors         = 2,
  seats         = 2,
  fuel_type     = 'Hybrid',
  body_type     = 'Sports Car',
  specs_json    = '{
    "engine": {
      "displacement": "6200",
      "type": "6.2L LT2 V8 with Electrified Propulsion System",
      "cylinders": 8,
      "power": "488kW (combined)",
      "torque": "806Nm (combined)"
    },
    "transmission": {
      "type": "8-Speed Dual-Clutch",
      "gears": 8,
      "drivetrain": "eAWD (electric front axle + V8 rear)"
    },
    "performance": {
      "zero_to_hundred": "2.9 seconds"
    },
    "electric": {
      "stealth_mode": "Electric-only, up to 72km/h, 6-8km range",
      "shuttle_mode": "Electric-only under 24km/h for driveway manoeuvring"
    },
    "suspension": {
      "type": "Magnetic Selective Ride Control"
    },
    "brakes": "Carbon Ceramic (Standard)",
    "wheels": {
      "front": "20-inch Gloss Black Forged Aluminum",
      "rear": "21-inch Gloss Black Forged Aluminum"
    },
    "tyres": "Michelin Pilot Sport 4S ZP",
    "zer_package": "Standard — ZER Performance Package"
  }'::jsonb,
  key_features  = '["6.2L LT2 V8 + Electric Front Axle (488kW / 806Nm Combined)","Electrified All-Wheel Drive (eAWD)","8-Speed Dual-Clutch Transmission","0-100km/h in 2.9 Seconds","Carbon Ceramic Brakes (Standard)","Magnetic Selective Ride Control","Stealth Mode (Electric-Only Driving)","ZER Performance Package (Standard)","12.7-inch Centre Console Display","14-inch Driver Information Center","6.6-inch Auxiliary Touchscreen","Wireless Apple CarPlay & Android Auto","Bose 14-Speaker Performance Series Audio","Performance Data Recorder","Head-Up Display","Front Lift with Memory","GT2 Napa Leather Seats (Standard)","Carbon Fibre Steering Wheel Trim","6 Driver Modes + Z Mode","Performance Traction Management with PTM Pro"]'::jsonb,
  meta_json     = COALESCE(meta_json, '{}'::jsonb) || '{
    "model_year": 2026,
    "sub_brand": "chevrolet",
    "trims": ["3LZ"],
    "trim_details": {
      "3LZ": "GT2 Napa leather seats, carbon ceramic brakes, carbon fibre trim, visible carbon fibre splitters + rockers"
    }
  }'::jsonb
WHERE oem_id = 'gmsv-au'
  AND (external_key = 'gmsv-corvette-e-ray' OR title ILIKE '%Corvette%E-Ray%' OR title ILIKE '%Corvette%ERay%');

-- ── Corvette Z06 ───────────────────────────────────────────────────────

UPDATE products SET
  engine_size   = '5500',
  cylinders     = 8,
  transmission  = '8-Speed Dual-Clutch',
  drive         = 'RWD',
  drivetrain    = 'RWD',
  doors         = 2,
  seats         = 2,
  fuel_type     = 'Petrol',
  body_type     = 'Sports Car',
  specs_json    = '{
    "engine": {
      "displacement": "5500",
      "type": "LT6 5.5L Flat-Plane Crank V8 (Hand-Built)",
      "cylinders": 8,
      "redline": "8600 RPM",
      "note": "Race-derived from C8.R — back-to-back IMSA GTLM manufacturer championships"
    },
    "transmission": {
      "type": "8-Speed Dual-Clutch",
      "gears": 8,
      "drivetrain": "RWD"
    },
    "suspension": {
      "type": "Mid-Engine with track-optimised setup"
    },
    "brakes": {
      "standard": "6-Piston Front / 4-Piston Rear",
      "available": "4-Wheel Carbon Ceramic"
    },
    "aero": "Standard ground effects, spoiler with replaceable wickerbills, rear brake cooling ducts, removable front fascia panel, front underwing stall Gurneys"
  }'::jsonb,
  key_features  = '["LT6 5.5L Flat-Plane Crank V8 (Hand-Built)","8600 RPM Redline","8-Speed Dual-Clutch Transmission","Race-Derived from C8.R Championship Car","6-Piston Front / 4-Piston Rear Brakes","Available Carbon Ceramic Brakes","Standard Ground Effects & Aero Package","Replaceable Spoiler Wickerbills","Performance Data Recorder","Head-Up Display","Mid-Engine Rear-Wheel Drive"]'::jsonb,
  meta_json     = COALESCE(meta_json, '{}'::jsonb) || '{
    "model_year": 2025,
    "sub_brand": "chevrolet"
  }'::jsonb
WHERE oem_id = 'gmsv-au'
  AND (external_key = 'gmsv-corvette-z06' OR title ILIKE '%Corvette%Z06%');
