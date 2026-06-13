export interface Category {
  id: string;
  label: string;
  icon: string;
}

export interface Trade {
  id: string;
  categoryId: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { id: "cleaning", label: "Cleaning & Maintenance", icon: "Sparkles" },
  { id: "reno", label: "Home Construction & Renovation", icon: "Hammer" },
  { id: "driveway", label: "Driveway & Concrete", icon: "Layers" },
  { id: "mechanical", label: "Mechanical & Systems", icon: "Wrench" },
  { id: "emergency", label: "Emergency Services", icon: "AlertTriangle" },
  { id: "auto", label: "Auto & Mobile Services", icon: "Car" },
  { id: "outdoor", label: "Outdoor & Landscaping", icon: "Trees" },
  { id: "pro", label: "Professional Services", icon: "Briefcase" },
  { id: "custom", label: "My trade isn't listed", icon: "Plus" },
];

export const TRADES: Trade[] = [
  { id: "house_cleaning", categoryId: "cleaning", label: "House Cleaning" },
  { id: "office_cleaning", categoryId: "cleaning", label: "Office Cleaning" },
  { id: "deep_cleaning", categoryId: "cleaning", label: "Deep Cleaning" },
  { id: "move_in_out_cleaning", categoryId: "cleaning", label: "Move-In / Move-Out Cleaning" },
  { id: "commercial_cleaning", categoryId: "cleaning", label: "Commercial Cleaning" },
  { id: "post_construction_cleaning", categoryId: "cleaning", label: "Post-Construction Cleaning" },
  { id: "carpet_cleaning", categoryId: "cleaning", label: "Carpet Cleaning" },
  { id: "window_cleaning", categoryId: "cleaning", label: "Window Cleaning" },
  { id: "pressure_washing", categoryId: "cleaning", label: "Pressure Washing" },
  { id: "gutter_cleaning", categoryId: "cleaning", label: "Gutter Cleaning" },
  { id: "pool_cleaning", categoryId: "cleaning", label: "Pool Cleaning & Maintenance" },
  { id: "pool_service", categoryId: "cleaning", label: "Pool Service" },
  { id: "chimney_sweep", categoryId: "cleaning", label: "Chimney Sweep" },
  { id: "dryer_vent_cleaning", categoryId: "cleaning", label: "Dryer Vent Cleaning" },
  { id: "junk_removal", categoryId: "cleaning", label: "Junk Removal" },
  // PRICING-MODELS U7 — dumpster rental (template-inventory TOP-15 #4; the
  // rate_matrix showcase trade — sizes × delivery zones lane pricing).
  { id: "dumpster_rental", categoryId: "cleaning", label: "Dumpster Rental" },
  // TEMPLATES BATCH 4 — "Auto + Niche" (template-inventory TOP-15 #13).
  // Short-term-rental (Airbnb) turnover cleaning — recurring per-turnover
  // cleaning, distinct from one-off move-in/move-out cleaning.
  { id: "str_turnover_cleaning", categoryId: "cleaning", label: "Short-Term Rental Turnover Cleaning" },
  { id: "pest_control", categoryId: "cleaning", label: "Pest Control" },

  { id: "kitchen_remodeling", categoryId: "reno", label: "Kitchen Remodeling" },
  { id: "kitchen_remodel", categoryId: "reno", label: "Kitchen Remodel" },
  { id: "bathroom_remodeling", categoryId: "reno", label: "Bathroom Remodeling" },
  { id: "bathroom_remodel", categoryId: "reno", label: "Bathroom Remodel" },
  { id: "basement_finishing", categoryId: "reno", label: "Basement Finishing" },
  { id: "home_addition", categoryId: "reno", label: "Home Addition / Extension" },
  { id: "general_renovation", categoryId: "reno", label: "General Renovation" },
  { id: "general_contractor", categoryId: "reno", label: "General Contractor" },
  { id: "handyman", categoryId: "reno", label: "Handyman Services" },
  { id: "interior_painting", categoryId: "reno", label: "Interior Painting" },
  { id: "exterior_painting", categoryId: "reno", label: "Exterior Painting" },
  { id: "cabinet_refinishing", categoryId: "reno", label: "Cabinet Refinishing" },
  { id: "flooring_installation", categoryId: "reno", label: "Flooring Installation" },
  { id: "tile_installation", categoryId: "reno", label: "Tile Installation" },
  { id: "drywall_plaster", categoryId: "reno", label: "Drywall & Plaster" },
  { id: "insulation_installation", categoryId: "reno", label: "Insulation Installation" },
  { id: "deck_construction", categoryId: "reno", label: "Deck Construction (Wood / Composite)" },
  { id: "deck_building", categoryId: "reno", label: "Deck Building" },
  { id: "patio_installation", categoryId: "reno", label: "Patio Installation" },
  { id: "fence_installation", categoryId: "reno", label: "Fence Installation" },
  { id: "shed_installation", categoryId: "reno", label: "Shed Installation & Assembly" },
  { id: "roofing_installation", categoryId: "reno", label: "Roofing Installation" },
  { id: "roofing", categoryId: "reno", label: "Roofing" },
  { id: "siding_installation", categoryId: "reno", label: "Siding Installation" },
  { id: "window_replacement", categoryId: "reno", label: "Window Replacement" },
  { id: "door_installation", categoryId: "reno", label: "Door Installation" },
  // TEMPLATES BATCH 2 — "Surfaces" (template-inventory TOP-15 #12). Countertop
  // installation — the image_choice materials showcase (laminate/quartz/
  // granite/marble); a finish/surface reno trade.
  { id: "countertops", categoryId: "reno", label: "Countertop Installation" },
  // TEMPLATES BATCH 3 — "Outdoor / Seasonal" (template-inventory TOP-15 #5).
  // Foundation repair + basement waterproofing — one showcase template, two
  // canonical reno/construction trade ids (problem-type show_if branches).
  { id: "foundation_repair", categoryId: "reno", label: "Foundation Repair" },
  { id: "basement_waterproofing", categoryId: "reno", label: "Basement Waterproofing" },

  { id: "asphalt_driveway", categoryId: "driveway", label: "Asphalt Driveway Paving" },
  { id: "driveway_sealing", categoryId: "driveway", label: "Driveway Sealing" },
  { id: "concrete_driveway", categoryId: "driveway", label: "Concrete Driveway Installation" },
  { id: "stamped_concrete", categoryId: "driveway", label: "Stamped Concrete" },
  { id: "interlocking_pavers", categoryId: "driveway", label: "Interlocking / Paver Installation" },
  { id: "concrete_slab", categoryId: "driveway", label: "Concrete Slab Installation" },
  { id: "concrete_patio", categoryId: "driveway", label: "Concrete Patio" },
  { id: "retaining_wall", categoryId: "driveway", label: "Retaining Wall Construction" },
  // TEMPLATES BATCH 2 — "Surfaces" (template-inventory TOP-15 #2). Epoxy /
  // polyaspartic garage-floor coatings — a concrete-surface finish trade.
  { id: "garage_floor_coating", categoryId: "driveway", label: "Garage Floor Coating / Epoxy" },

  { id: "hvac_installation", categoryId: "mechanical", label: "HVAC Installation" },
  { id: "hvac_repair", categoryId: "mechanical", label: "HVAC Repair" },
  { id: "hvac_services", categoryId: "mechanical", label: "HVAC Services" },
  { id: "furnace_replacement", categoryId: "mechanical", label: "Furnace Replacement" },
  { id: "water_heater", categoryId: "mechanical", label: "Water Heater Installation" },
  { id: "plumbing_services", categoryId: "mechanical", label: "Plumbing Services" },
  { id: "electrical_services", categoryId: "mechanical", label: "Electrical Services" },
  { id: "ev_charger", categoryId: "mechanical", label: "EV Charger Installation" },
  { id: "solar_panel", categoryId: "mechanical", label: "Solar Panel Installation" },
  { id: "solar_battery", categoryId: "mechanical", label: "Solar Battery Storage" },
  { id: "generator_installation", categoryId: "mechanical", label: "Generator Installation" },
  { id: "security_system", categoryId: "mechanical", label: "Security System Installation" },
  { id: "cctv_installation", categoryId: "mechanical", label: "CCTV Installation" },
  { id: "garage_door", categoryId: "mechanical", label: "Garage Door Installation" },
  { id: "appliance_repair", categoryId: "mechanical", label: "Appliance Repair" },
  // TEMPLATES BATCH 1 — "mechanical money" trades (template-inventory TOP-15
  // #6 septic; bench duct cleaning, pairs with cleaning's dryer_vent_cleaning).
  { id: "septic_services", categoryId: "mechanical", label: "Septic Pumping & Service" },
  { id: "duct_cleaning", categoryId: "mechanical", label: "Air Duct Cleaning" },

  { id: "emergency_plumbing", categoryId: "emergency", label: "Emergency Plumbing" },
  { id: "water_damage", categoryId: "emergency", label: "Water Damage Restoration" },
  { id: "water_damage_restoration", categoryId: "emergency", label: "Water Damage Restoration Services" },
  { id: "mold_remediation", categoryId: "emergency", label: "Mold Remediation" },
  { id: "fire_damage", categoryId: "emergency", label: "Fire Damage Restoration" },
  { id: "locksmith", categoryId: "emergency", label: "Locksmith Services" },
  { id: "emergency_hvac", categoryId: "emergency", label: "Emergency HVAC Repair" },
  { id: "emergency_electrical", categoryId: "emergency", label: "Emergency Electrical Repair" },

  { id: "mobile_car_detailing", categoryId: "auto", label: "Mobile Car Detailing" },
  { id: "auto_detailing", categoryId: "auto", label: "Auto Detailing" },
  { id: "window_tinting", categoryId: "auto", label: "Window Tinting" },
  { id: "windshield_repair", categoryId: "auto", label: "Windshield Repair" },
  { id: "mobile_mechanic", categoryId: "auto", label: "Mobile Mechanic" },
  { id: "vehicle_wrap", categoryId: "auto", label: "Vehicle Wrap" },
  { id: "paint_protection_film", categoryId: "auto", label: "Paint Protection Film" },
  // TEMPLATES BATCH 0 — Car Towing template previously dangled on
  // `auto_detailing`; towing is its own purchase-intent trade.
  { id: "towing", categoryId: "auto", label: "Towing" },

  { id: "landscaping", categoryId: "outdoor", label: "Landscaping" },
  { id: "lawn_mowing", categoryId: "outdoor", label: "Lawn Mowing" },
  { id: "garden_maintenance", categoryId: "outdoor", label: "Garden Maintenance" },
  { id: "tree_service", categoryId: "outdoor", label: "Tree Service" },
  { id: "tree_trimming", categoryId: "outdoor", label: "Tree Trimming" },
  // TEMPLATES BATCH 3 — "Outdoor / Seasonal" (template-inventory TOP-15
  // #7 irrigation, #8 snow removal, #9 holiday lighting, #14 artificial turf).
  { id: "irrigation_sprinklers", categoryId: "outdoor", label: "Irrigation / Sprinkler Systems" },
  { id: "snow_removal", categoryId: "outdoor", label: "Snow Removal" },
  { id: "holiday_lighting", categoryId: "outdoor", label: "Holiday / Christmas Light Installation" },
  { id: "artificial_turf", categoryId: "outdoor", label: "Artificial Turf Installation" },

  { id: "web_design", categoryId: "pro", label: "Web Design" },
  { id: "it_services", categoryId: "pro", label: "IT Services" },
  { id: "marketing_agency", categoryId: "pro", label: "Marketing Agency" },
  { id: "mortgage_broker", categoryId: "pro", label: "Mortgage Broker" },
  { id: "insurance_broker", categoryId: "pro", label: "Insurance Broker" },
  { id: "real_estate_agent", categoryId: "pro", label: "Real Estate Agent" },
  { id: "home_inspection", categoryId: "pro", label: "Home Inspection" },
  { id: "land_surveying", categoryId: "pro", label: "Land Surveying" },
  { id: "photography", categoryId: "pro", label: "Photography" },
  { id: "photographer", categoryId: "pro", label: "Photographer" },
  { id: "videography", categoryId: "pro", label: "Videography" },
  { id: "drone_services", categoryId: "pro", label: "Drone Services" },
  { id: "moving_services", categoryId: "pro", label: "Moving Services" },
];

export function getTradesByCategory(categoryId: string): Trade[] {
  return TRADES.filter(t => t.categoryId === categoryId);
}

export function getCategoryById(categoryId: string): Category | undefined {
  return CATEGORIES.find(c => c.id === categoryId);
}

export function getTradeById(tradeId: string): Trade | undefined {
  return TRADES.find(t => t.id === tradeId);
}
