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
  { id: "pro", label: "Professional Services", icon: "Briefcase" },
  { id: "custom", label: "My trade isn't listed", icon: "Plus" },
];

export const TRADES: Trade[] = [
  { id: "house_cleaning", categoryId: "cleaning", label: "House Cleaning" },
  { id: "deep_cleaning", categoryId: "cleaning", label: "Deep Cleaning" },
  { id: "move_in_out_cleaning", categoryId: "cleaning", label: "Move-In / Move-Out Cleaning" },
  { id: "commercial_cleaning", categoryId: "cleaning", label: "Commercial Cleaning" },
  { id: "post_construction_cleaning", categoryId: "cleaning", label: "Post-Construction Cleaning" },
  { id: "carpet_cleaning", categoryId: "cleaning", label: "Carpet Cleaning" },
  { id: "window_cleaning", categoryId: "cleaning", label: "Window Cleaning" },
  { id: "pressure_washing", categoryId: "cleaning", label: "Pressure Washing" },
  { id: "gutter_cleaning", categoryId: "cleaning", label: "Gutter Cleaning" },
  { id: "pool_cleaning", categoryId: "cleaning", label: "Pool Cleaning & Maintenance" },
  { id: "chimney_sweep", categoryId: "cleaning", label: "Chimney Sweep" },
  { id: "dryer_vent_cleaning", categoryId: "cleaning", label: "Dryer Vent Cleaning" },

  { id: "kitchen_remodeling", categoryId: "reno", label: "Kitchen Remodeling" },
  { id: "bathroom_remodeling", categoryId: "reno", label: "Bathroom Remodeling" },
  { id: "basement_finishing", categoryId: "reno", label: "Basement Finishing" },
  { id: "home_addition", categoryId: "reno", label: "Home Addition / Extension" },
  { id: "interior_painting", categoryId: "reno", label: "Interior Painting" },
  { id: "exterior_painting", categoryId: "reno", label: "Exterior Painting" },
  { id: "cabinet_refinishing", categoryId: "reno", label: "Cabinet Refinishing" },
  { id: "flooring_installation", categoryId: "reno", label: "Flooring Installation" },
  { id: "tile_installation", categoryId: "reno", label: "Tile Installation" },
  { id: "drywall_plaster", categoryId: "reno", label: "Drywall & Plaster" },
  { id: "insulation_installation", categoryId: "reno", label: "Insulation Installation" },
  { id: "deck_construction", categoryId: "reno", label: "Deck Construction (Wood / Composite)" },
  { id: "patio_installation", categoryId: "reno", label: "Patio Installation" },
  { id: "fence_installation", categoryId: "reno", label: "Fence Installation" },
  { id: "shed_installation", categoryId: "reno", label: "Shed Installation & Assembly" },
  { id: "roofing_installation", categoryId: "reno", label: "Roofing Installation" },
  { id: "siding_installation", categoryId: "reno", label: "Siding Installation" },
  { id: "window_replacement", categoryId: "reno", label: "Window Replacement" },
  { id: "door_installation", categoryId: "reno", label: "Door Installation" },

  { id: "asphalt_driveway", categoryId: "driveway", label: "Asphalt Driveway Paving" },
  { id: "driveway_sealing", categoryId: "driveway", label: "Driveway Sealing" },
  { id: "concrete_driveway", categoryId: "driveway", label: "Concrete Driveway Installation" },
  { id: "stamped_concrete", categoryId: "driveway", label: "Stamped Concrete" },
  { id: "interlocking_pavers", categoryId: "driveway", label: "Interlocking / Paver Installation" },
  { id: "concrete_slab", categoryId: "driveway", label: "Concrete Slab Installation" },
  { id: "retaining_wall", categoryId: "driveway", label: "Retaining Wall Construction" },

  { id: "hvac_installation", categoryId: "mechanical", label: "HVAC Installation" },
  { id: "hvac_repair", categoryId: "mechanical", label: "HVAC Repair" },
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

  { id: "emergency_plumbing", categoryId: "emergency", label: "Emergency Plumbing" },
  { id: "water_damage", categoryId: "emergency", label: "Water Damage Restoration" },
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

  { id: "web_design", categoryId: "pro", label: "Web Design" },
  { id: "it_services", categoryId: "pro", label: "IT Services" },
  { id: "marketing_agency", categoryId: "pro", label: "Marketing Agency" },
  { id: "mortgage_broker", categoryId: "pro", label: "Mortgage Broker" },
  { id: "insurance_broker", categoryId: "pro", label: "Insurance Broker" },
  { id: "real_estate_agent", categoryId: "pro", label: "Real Estate Agent" },
  { id: "home_inspection", categoryId: "pro", label: "Home Inspection" },
  { id: "land_surveying", categoryId: "pro", label: "Land Surveying" },
  { id: "photography", categoryId: "pro", label: "Photography" },
  { id: "videography", categoryId: "pro", label: "Videography" },
  { id: "drone_services", categoryId: "pro", label: "Drone Services" },
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
