export interface RegionPreset {
  icon: string;
  label: string;
  address: string;
  hint: string;
  /** Keywords matched against building addresses (lowercase) */
  match: string[];
}

export const REGION_PRESETS: RegionPreset[] = [
  { icon: "🏙️", label: "KLCC",       address: "KLCC, Kuala Lumpur",                 hint: "吉隆坡城中城",      match: ["klcc", "kuala lumpur city centre"] },
  { icon: "🌿", label: "Bangsar",    address: "Bangsar, Kuala Lumpur",              hint: "孟沙 / Mid Valley", match: ["bangsar", "mid valley"] },
  { icon: "🏡", label: "Mont Kiara", address: "Mont Kiara, Kuala Lumpur",           hint: "蒙基拉 / Hartamas",  match: ["mont kiara", "mont'kiara", "sri hartamas"] },
  { icon: "🏢", label: "Damansara",  address: "Damansara, Petaling Jaya, Selangor", hint: "白沙罗 / PJ",        match: ["damansara"] },
  { icon: "🏙️", label: "PJ",         address: "Petaling Jaya, Selangor",            hint: "八打灵再也",          match: ["petaling jaya", " pj "] },
  { icon: "🏭", label: "Shah Alam",  address: "Shah Alam, Selangor",                hint: "沙阿南工业区",         match: ["shah alam"] },
  { icon: "🌐", label: "Cyberjaya",  address: "Cyberjaya, Selangor",                hint: "赛博再也科技城",        match: ["cyberjaya"] },
  { icon: "🚢", label: "Klang",      address: "Port Klang, Selangor",               hint: "巴生港口 / 物流",      match: ["port klang", "pelabuhan klang", "klang,", "klang "] },
  { icon: "🌇", label: "Subang",     address: "Subang Jaya, Selangor",              hint: "梳邦再也 / USJ",      match: ["subang", "usj"] },
  { icon: "🏗️", label: "Puchong",    address: "Puchong, Selangor",                  hint: "蒲种工业 / 商业",      match: ["puchong"] },
  { icon: "🏘️", label: "Ampang",     address: "Ampang, Selangor",                   hint: "安邦 / Cheras",      match: ["ampang", "cheras"] },
  { icon: "🏞️", label: "Kepong",     address: "Kepong, Kuala Lumpur",               hint: "甲洞 / Sri Damansara", match: ["kepong", "sri damansara"] },
];
