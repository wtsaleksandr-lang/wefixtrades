export interface GlobeMarker {
  id: string;
  location: [number, number];
  stat: string;
  label: string;
  size: number;
}

export const GLOBE_MARKERS: GlobeMarker[] = [
  {
    id: "denver",
    location: [39.74, -104.99],
    stat: "+42% more calls",
    label: "Denver, CO · Plumber",
    size: 0.06,
  },
  {
    id: "austin",
    location: [30.27, -97.74],
    stat: "#8 → #2 on Google Maps",
    label: "Austin, TX · Cleaner",
    size: 0.06,
  },
  {
    id: "chicago",
    location: [41.88, -87.63],
    stat: "3x more leads in 30 days",
    label: "Chicago, IL · Electrician",
    size: 0.06,
  },
  {
    id: "phoenix",
    location: [33.45, -112.07],
    stat: "$4,200 new revenue this month",
    label: "Phoenix, AZ · HVAC",
    size: 0.06,
  },
  {
    id: "atlanta",
    location: [33.75, -84.39],
    stat: "AI handled 19 missed calls",
    label: "Atlanta, GA · Plumber",
    size: 0.06,
  },
  {
    id: "seattle",
    location: [47.61, -122.33],
    stat: "Fully booked for 2 weeks",
    label: "Seattle, WA · Painter",
    size: 0.06,
  },
  {
    id: "miami",
    location: [25.76, -80.19],
    stat: "31 jobs booked automatically",
    label: "Miami, FL · Cleaner",
    size: 0.06,
  },
  {
    id: "tampa",
    location: [27.95, -82.46],
    stat: "+67% increase in bookings",
    label: "Tampa, FL · Roofer",
    size: 0.06,
  },
];

// Fixed card positions relative to globe container (percentage-based).
// Three slots that cycle through markers.
export const CARD_SLOTS: { top?: string; bottom?: string; right: string; id: string }[] = [
  { top: "8%", right: "-10%", id: "slot-0" },
  { top: "45%", right: "-18%", id: "slot-1" },
  { bottom: "12%", right: "2%", id: "slot-2" },
];
