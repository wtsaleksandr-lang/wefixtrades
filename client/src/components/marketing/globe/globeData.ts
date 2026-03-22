export interface GlobeMarker {
  id: string;
  location: [number, number];
  stat: string;
  label: string;
  size: number;
  icon: string;
}

export const GLOBE_MARKERS: GlobeMarker[] = [
  {
    id: "denver",
    location: [39.74, -104.99],
    stat: "+42% more calls",
    label: "Denver, CO \u00b7 Plumber",
    size: 0.06,
    icon: "phone",
  },
  {
    id: "austin",
    location: [30.27, -97.74],
    stat: "#8 \u2192 #2 on Google Maps",
    label: "Austin, TX \u00b7 Cleaner",
    size: 0.06,
    icon: "map-pin",
  },
  {
    id: "chicago",
    location: [41.88, -87.63],
    stat: "3x more leads in 30 days",
    label: "Chicago, IL \u00b7 Electrician",
    size: 0.06,
    icon: "zap",
  },
  {
    id: "phoenix",
    location: [33.45, -112.07],
    stat: "$4,200 new revenue this month",
    label: "Phoenix, AZ \u00b7 HVAC",
    size: 0.06,
    icon: "calculator",
  },
  {
    id: "atlanta",
    location: [33.75, -84.39],
    stat: "AI handled 19 missed calls",
    label: "Atlanta, GA \u00b7 Plumber",
    size: 0.06,
    icon: "phone",
  },
  {
    id: "seattle",
    location: [47.61, -122.33],
    stat: "Fully booked for 2 weeks",
    label: "Seattle, WA \u00b7 Painter",
    size: 0.06,
    icon: "calendar",
  },
  {
    id: "miami",
    location: [25.76, -80.19],
    stat: "31 jobs booked automatically",
    label: "Miami, FL \u00b7 Cleaner",
    size: 0.06,
    icon: "briefcase",
  },
  {
    id: "tampa",
    location: [27.95, -82.46],
    stat: "+67% increase in bookings",
    label: "Tampa, FL \u00b7 Roofer",
    size: 0.06,
    icon: "wrench",
  },
];

/** Arc connections between markers — [fromIndex, toIndex] */
export const GLOBE_ARCS: [number, number][] = [
  [0, 2], // Denver → Chicago
  [1, 4], // Austin → Atlanta
  [2, 5], // Chicago → Seattle
  [3, 0], // Phoenix → Denver
  [4, 6], // Atlanta → Miami
  [5, 3], // Seattle → Phoenix
  [6, 7], // Miami → Tampa
  [1, 3], // Austin → Phoenix
  [0, 5], // Denver → Seattle
  [2, 4], // Chicago → Atlanta
];
